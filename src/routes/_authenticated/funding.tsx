import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FundingFormDialog } from "@/components/funding-form-dialog";
import { supabase } from "@/integrations/supabase/client";
import { currency } from "@/lib/format";
import { logActivity } from "@/lib/activity";
import { useCurrentUser } from "@/lib/use-current-user";

export const Route = createFileRoute("/_authenticated/funding")({
  component: FundingPage,
});

const stages = [
  "researching",
  "applied",
  "under_review",
  "approved",
  "funded",
  "denied",
  "closed",
] as const;

function FundingPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();

  const { data, isLoading } = useQuery({
    queryKey: ["funding"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("funding_applications")
        .select(
          "id, lender, stage, requested_amount, approved_amount, company_id, companies(legal_name)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const moveStage = async (id: string, stage: string, lender: string, companyId: string) => {
    const { error } = await supabase
      .from("funding_applications")
      .update({ stage: stage as "researching" })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await logActivity({
      action: "funding_stage_changed",
      summary: `${lender} moved to ${stage.replace("_", " ")}`,
      entityType: "funding_application",
      entityId: id,
      companyId,
      metadata: { stage },
    });
    qc.invalidateQueries({ queryKey: ["funding"] });
  };

  const byStage = stages.reduce(
    (acc, stage) => {
      acc[stage] = (data ?? []).filter((f: { stage: string }) => f.stage === stage);
      return acc;
    },
    {} as Record<string, typeof data>,
  );

  return (
    <>
      <PageHeader
        title="Funding"
        description={
          user?.isClient
            ? "Funding progress for your companies"
            : "Pipeline of funding applications"
        }
        actions={
          user?.isInternal ? (
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4" /> New application
            </Button>
          ) : undefined
        }
      />
      <div className="p-6 overflow-x-auto">
        {isLoading ? (
          <div className="text-center text-muted-foreground py-10">Loading…</div>
        ) : (
          <div className="flex gap-4 min-w-max pb-4">
            {stages.map((stage) => (
              <Card key={stage} className="w-72 shrink-0">
                <CardHeader className="border-b py-3">
                  <CardTitle className="text-sm font-semibold capitalize flex items-center justify-between">
                    {stage.replace("_", " ")}
                    <Badge variant="secondary">{byStage[stage]?.length ?? 0}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-2 space-y-2 max-h-[60vh] overflow-y-auto">
                  {(byStage[stage] ?? []).map(
                    (f: {
                      id: string;
                      lender: string;
                      requested_amount: number | null;
                      approved_amount: number | null;
                      company_id: string;
                      companies?: { legal_name: string } | null;
                    }) => (
                      <div
                        key={f.id}
                        className="rounded-md border p-3 text-sm space-y-2 bg-background"
                      >
                        <div className="font-medium">{f.lender}</div>
                        <Link
                          to="/companies/$id"
                          params={{ id: f.company_id }}
                          className="text-xs text-muted-foreground hover:text-accent"
                        >
                          {f.companies?.legal_name}
                        </Link>
                        {f.requested_amount != null && (
                          <div className="text-xs text-muted-foreground">
                            Requested: {currency(f.requested_amount)}
                          </div>
                        )}
                        {user?.isInternal && (
                          <div className="flex flex-wrap gap-1">
                            {stages
                              .filter((s) => s !== stage)
                              .slice(0, 3)
                              .map((s) => (
                                <Button
                                  key={s}
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 text-[10px] px-2"
                                  onClick={() => moveStage(f.id, s, f.lender, f.company_id)}
                                >
                                  → {s.replace("_", " ")}
                                </Button>
                              ))}
                          </div>
                        )}
                      </div>
                    ),
                  )}
                  {!byStage[stage]?.length && (
                    <div className="text-xs text-muted-foreground text-center py-6">Empty</div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
      <FundingFormDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}

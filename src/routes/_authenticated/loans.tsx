import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoanFormDialog } from "@/components/loan-form-dialog";
import { supabase } from "@/integrations/supabase/client";
import { currency, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/loans")({
  component: LoansPage,
});

function LoansPage() {
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["loans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loans")
        .select(
          "id, lender, balance, monthly_payment, next_due_date, autopay, company_id, companies(legal_name)",
        )
        .order("next_due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <>
      <PageHeader
        title="Loans"
        description="All loan and credit accounts"
        actions={
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" /> New loan account
          </Button>
        }
      />
      <div className="p-6">
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Lender</th>
                <th className="text-left px-4 py-2.5 font-medium">Company</th>
                <th className="text-right px-4 py-2.5 font-medium">Balance</th>
                <th className="text-right px-4 py-2.5 font-medium">Payment</th>
                <th className="text-left px-4 py-2.5 font-medium">Next due</th>
                <th className="text-left px-4 py-2.5 font-medium">Autopay</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : !data?.length ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    No loan accounts yet
                  </td>
                </tr>
              ) : (
                data.map(
                  (l: {
                    id: string;
                    lender: string;
                    balance: number;
                    monthly_payment: number | null;
                    next_due_date: string | null;
                    autopay: boolean;
                    company_id: string;
                    companies?: { legal_name: string } | null;
                  }) => (
                    <tr key={l.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-medium">{l.lender}</td>
                      <td className="px-4 py-2.5">
                        <Link
                          to="/companies/$id"
                          params={{ id: l.company_id }}
                          className="hover:text-accent"
                        >
                          {l.companies?.legal_name ?? "—"}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-right">{currency(l.balance)}</td>
                      <td className="px-4 py-2.5 text-right">{currency(l.monthly_payment)}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {formatDate(l.next_due_date)}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant={l.autopay ? "default" : "outline"}>
                          {l.autopay ? "Yes" : "No"}
                        </Badge>
                      </td>
                    </tr>
                  ),
                )
              )}
            </tbody>
          </table>
        </Card>
      </div>
      <LoanFormDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}

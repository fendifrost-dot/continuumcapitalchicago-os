import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Search } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CompanyFormDialog } from "@/components/company-form-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/lib/use-current-user";

export const Route = createFileRoute("/_authenticated/companies")({
  component: CompaniesList,
});

function CompaniesList() {
  const [q, setQ] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data: user } = useCurrentUser();

  const { data, isLoading } = useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, legal_name, entity_type, industry, client_id, clients(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = (data ?? []).filter(
    (c: any) => !q || c.legal_name.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <>
      <PageHeader
        title={user?.isClient ? "My companies" : "Companies"}
        description={
          user?.isClient ? "Businesses linked to your account" : `${data?.length ?? 0} total`
        }
        actions={
          user?.isInternal ? (
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4" /> New company
            </Button>
          ) : undefined
        }
      />
      <div className="p-6 space-y-4">
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search companies…"
            className="pl-9 h-9"
          />
        </div>
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Legal name</th>
                <th className="text-left px-4 py-2.5 font-medium">Client</th>
                <th className="text-left px-4 py-2.5 font-medium">Industry</th>
                <th className="text-left px-4 py-2.5 font-medium">Entity</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                    No companies yet
                  </td>
                </tr>
              ) : (
                filtered.map((co: any) => (
                  <tr key={co.id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-2.5 font-medium">
                      <Link
                        to="/companies/$id"
                        params={{ id: co.id }}
                        className="hover:text-accent"
                      >
                        {co.legal_name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{co.clients?.name ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{co.industry ?? "—"}</td>
                    <td className="px-4 py-2.5 uppercase text-xs">{co.entity_type}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
      </div>
      <CompanyFormDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}

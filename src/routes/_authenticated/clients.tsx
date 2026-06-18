import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Search } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClientFormDialog } from "@/components/client-form-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/lib/use-current-user";

export const Route = createFileRoute("/_authenticated/clients")({
  component: ClientsList,
});

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  active: "default",
  prospect: "secondary",
  inactive: "outline",
  archived: "destructive",
};

function ClientsList() {
  const [q, setQ] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data: user } = useCurrentUser();

  const { data, isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, email, phone, status, assigned_consultant, companies(count)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = (data ?? []).filter(
    (c: any) =>
      !q ||
      c.name.toLowerCase().includes(q.toLowerCase()) ||
      (c.email ?? "").toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <>
      <PageHeader
        title="Clients"
        description={`${data?.length ?? 0} total`}
        actions={
          user?.isInternal ? (
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4" /> New client
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
            placeholder="Search clients…"
            className="pl-9 h-9"
          />
        </div>
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Name</th>
                <th className="text-left px-4 py-2.5 font-medium">Email</th>
                <th className="text-left px-4 py-2.5 font-medium">Phone</th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
                <th className="text-right px-4 py-2.5 font-medium">Companies</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    No clients yet
                  </td>
                </tr>
              ) : (
                filtered.map((c: any) => (
                  <tr key={c.id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-2.5 font-medium">
                      <Link to="/clients/$id" params={{ id: c.id }} className="hover:text-accent">
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{c.email ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{c.phone ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <Badge
                        variant={statusVariant[c.status] ?? "secondary"}
                        className="capitalize"
                      >
                        {c.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right">{c.companies?.[0]?.count ?? 0}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
      </div>
      <ClientFormDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}

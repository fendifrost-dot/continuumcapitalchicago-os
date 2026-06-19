import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/app-shell";
import { AccountsPanel } from "@/components/accounts-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/accounts")({
  component: AccountsPage,
});

function AccountsPage() {
  const { data: companies, isLoading } = useQuery({
    queryKey: ["accounts-companies"],
    queryFn: async () => {
      // RLS scopes this to the companies the signed-in user can access.
      const { data } = await supabase
        .from("companies")
        .select("id, legal_name")
        .order("legal_name");
      return data ?? [];
    },
  });

  return (
    <>
      <PageHeader
        title="Accounts & Logins"
        description="Every account we manage for you — open, copy a username, or reveal the password"
      />
      <div className="p-6 space-y-6">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : !companies?.length ? (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            No companies linked yet
          </Card>
        ) : (
          companies.map((c) => (
            <Card key={c.id}>
              <CardHeader className="border-b">
                <CardTitle className="text-sm font-semibold">{c.legal_name}</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <AccountsPanel companyId={c.id} />
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { fileSentence, formatLongDate } from "@/lib/credit-mail";
import { useCurrentUser } from "@/lib/use-current-user";

export const Route = createFileRoute("/_authenticated/file")({
  component: YourFilePage,
});

function YourFilePage() {
  const { data: user } = useCurrentUser();
  const clientIds = user?.clientIds ?? [];

  const { data, isLoading } = useQuery({
    queryKey: ["credit-file", clientIds],
    enabled: Boolean(user?.isClient && clientIds.length),
    queryFn: async () => {
      const [publications, clients] = await Promise.all([
        supabase
          .from("credit_file_publications")
          .select(
            "client_id, status_sentence, next_date, waiting_on, waiting_on_name, needs_from_you, published_at",
          )
          .in("client_id", clientIds),
        supabase.from("clients").select("id, name").in("id", clientIds),
      ]);
      if (publications.error) throw publications.error;
      if (clients.error) throw clients.error;
      return {
        publications: publications.data ?? [],
        names: new Map((clients.data ?? []).map((client) => [client.id, client.name])),
      };
    },
  });

  if (user && !user.isClient) {
    return (
      <>
        <PageHeader title="Your file" description="This page is for a client login." />
        <div className="p-6">
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              Staff publish a client’s file from that client’s page. This screen does not list every
              file.
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  const rows = data?.publications ?? [];

  return (
    <>
      <PageHeader
        title="Your file"
        description="The status we have published for you. Drafts stay with our staff."
      />
      <div className="space-y-4 p-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading your file…</p>
        ) : rows.length === 0 ? (
          <Card>
            <CardContent className="space-y-3 p-6">
              <p className="text-sm text-muted-foreground">
                No status has been published yet. We’ll show it here when your file has an update.
              </p>
              <Button variant="outline" size="sm" asChild>
                <Link to="/documents">Documents</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          rows.map((row) => {
            const waiting =
              row.waiting_on === "you"
                ? "you"
                : row.waiting_on_name ||
                  (row.waiting_on === "bureau" ? "the bureau" : "the furnisher");
            return (
              <Card key={row.client_id}>
                <CardContent className="space-y-4 p-6">
                  {clientIds.length > 1 && (
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">
                      {data?.names.get(row.client_id) ?? "Your file"}
                    </div>
                  )}
                  <p className="text-lg font-medium leading-snug text-foreground">
                    {fileSentence({
                      statusSentence: row.status_sentence,
                      needsFromYou: row.needs_from_you,
                    })}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">Next date {formatLongDate(row.next_date)}</Badge>
                    <Badge variant="outline">Waiting on {waiting}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link to="/letters">Letters</Link>
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <Link to="/documents">Documents</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </>
  );
}

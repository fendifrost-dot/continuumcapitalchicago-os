import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { formatLongDate } from "@/lib/credit-mail";
import { useCurrentUser } from "@/lib/use-current-user";

export const Route = createFileRoute("/_authenticated/letters")({
  component: LettersPage,
});

function LettersPage() {
  const { data: user } = useCurrentUser();
  const clientIds = user?.clientIds ?? [];

  const { data, isLoading } = useQuery({
    queryKey: ["credit-letters", clientIds],
    enabled: Boolean(user?.isClient && clientIds.length),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_mailings")
        .select(
          "id, client_id, recipient_name, status, customer_sentence, mailed_on, tracking_number, delivered_on, response_due_on, proof_on_file",
        )
        .in("client_id", clientIds)
        .in("status", ["paid", "printing", "in_transit", "delivered"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (user && !user.isClient) {
    return (
      <>
        <PageHeader title="Letters" description="This page is for a client login." />
        <div className="p-6 text-sm text-muted-foreground">
          Mailed letters are published on the client’s file. Drafts are not shown here.
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Letters"
        description="Letters that have been paid. Drafts are not listed."
      />
      <div className="space-y-4 p-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading letters…</p>
        ) : !data?.length ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              No mailings yet. We’ll show each letter here after it goes out.
            </CardContent>
          </Card>
        ) : (
          data.map((letter) => (
            <Card key={letter.id}>
              <CardContent className="space-y-3 p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium">{letter.recipient_name}</div>
                  <Badge variant="secondary" className="capitalize">
                    {letter.status.replaceAll("_", " ")}
                  </Badge>
                </div>
                <p className="text-sm leading-relaxed">{letter.customer_sentence}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {letter.mailed_on && <span>Mailed {formatLongDate(letter.mailed_on)}</span>}
                  {letter.tracking_number && <span>Tracking {letter.tracking_number}</span>}
                  {letter.delivered_on && (
                    <span>Delivered {formatLongDate(letter.delivered_on)}</span>
                  )}
                  {letter.proof_on_file && <span>Electronic return receipt is on file</span>}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </>
  );
}

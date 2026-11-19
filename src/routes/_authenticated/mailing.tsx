import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { MailingPrice } from "@/components/mailing-price";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/edge-functions";
import { formatReturnAddress, returnAddressIssue } from "@/lib/credit-mail";
import { useCurrentUser } from "@/lib/use-current-user";

export const Route = createFileRoute("/_authenticated/mailing")({
  component: ThisMailingPage,
});

function ThisMailingPage() {
  const { data: user } = useCurrentUser();
  const clientIds = user?.clientIds ?? [];
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["credit-mailing-due", clientIds],
    enabled: Boolean(user?.isClient && clientIds.length),
    queryFn: async () => {
      const [mailings, cards] = await Promise.all([
        supabase
          .from("credit_mailings")
          .select(
            "id, client_id, recipient_name, recipient_city, recipient_state, return_name, return_line1, return_line2, return_city, return_state, return_zip, page_count, postage_cents, certified_cents, electronic_receipt_cents, handling_fee_cents, total_cents, status",
          )
          .in("client_id", clientIds)
          .eq("is_test", false)
          .in("status", ["awaiting_payment", "payment_failed"])
          .order("created_at", { ascending: false }),
        supabase
          .from("credit_saved_cards")
          .select("client_id, brand, last4")
          .in("client_id", clientIds),
      ]);
      if (mailings.error) throw mailings.error;
      if (cards.error) throw cards.error;
      return { mailings: mailings.data ?? [], cards: cards.data ?? [] };
    },
  });

  const pay = async (mailingId: string, hasCard: boolean) => {
    setBusyId(mailingId);
    if (!hasCard) {
      const { data: session, error } = await invokeEdgeFunction<{ url?: string }>(
        "credit-save-card",
        {
          mailing_id: mailingId,
        },
      );
      setBusyId(null);
      if (error || !session?.url) {
        toast.error(
          error === "payments_not_configured"
            ? "Card payments are not live yet."
            : error || "Could not open checkout",
        );
        return;
      }
      window.location.assign(session.url);
      return;
    }
    const { data: result, error } = await invokeEdgeFunction<{
      ok?: boolean;
      declined?: boolean;
      needs_card?: boolean;
      state?: string;
    }>("credit-charge-mailing", { mailing_id: mailingId });
    setBusyId(null);
    if (result?.needs_card) {
      toast.message("Save a card before this letter can be paid.");
      return;
    }
    if (result?.declined) {
      toast.error("The card was declined. Nothing was printed.");
      await refetch();
      return;
    }
    if (error || !result?.ok) {
      toast.error(
        error === "payments_not_configured"
          ? "Card payments are not live yet."
          : error || "Payment could not start",
      );
      return;
    }
    toast.success("Payment sent. The letter prints only after Stripe confirms it.");
    await refetch();
  };

  if (user && !user.isClient) {
    return (
      <>
        <PageHeader title="This mailing" description="This page is for a client login." />
        <div className="p-6 text-sm text-muted-foreground">
          Clients confirm the price here. Staff do not charge a card from this screen.
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="This mailing"
        description="You confirm the price before anything is printed."
      />
      <div className="space-y-4 p-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !data?.mailings.length ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              No letter is waiting for payment.
            </CardContent>
          </Card>
        ) : (
          data.mailings.map((mailing) => {
            const card = data.cards.find((item) => item.client_id === mailing.client_id);
            const returnIssue = returnAddressIssue({
              name: mailing.return_name,
              line1: mailing.return_line1,
              line2: mailing.return_line2,
              city: mailing.return_city,
              state: mailing.return_state,
              zip: mailing.return_zip,
            });
            return (
              <Card key={mailing.id}>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                    <span>{mailing.recipient_name}</span>
                    <Badge
                      variant={mailing.status === "payment_failed" ? "destructive" : "secondary"}
                    >
                      {mailing.status === "payment_failed"
                        ? "Card declined"
                        : "Waiting for payment"}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    {mailing.recipient_city}, {mailing.recipient_state}. Certified mail with an
                    electronic return receipt. Continuum pays the postage. You pay Continuum.
                  </p>
                  <div className="text-sm">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">
                      Return address
                    </div>
                    {returnIssue ? (
                      <p className="text-destructive">
                        This letter cannot be paid yet because the return address on file is
                        incomplete.
                      </p>
                    ) : (
                      <p className="whitespace-pre-line">
                        {formatReturnAddress({
                          name: mailing.return_name,
                          line1: mailing.return_line1,
                          line2: mailing.return_line2,
                          city: mailing.return_city,
                          state: mailing.return_state,
                          zip: mailing.return_zip,
                        })}
                      </p>
                    )}
                  </div>
                  <MailingPrice quote={mailing} />
                  <p className="text-xs text-muted-foreground">
                    {card
                      ? `Saved card ${card.brand ?? "card"} ending ${card.last4 ?? "••••"}.`
                      : "No card is saved yet. Checkout will save one for later letters."}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    The letter is printed only after Stripe says the payment succeeded. A declined
                    card does not print.
                  </p>
                  <Button
                    onClick={() => pay(mailing.id, Boolean(card?.last4))}
                    disabled={busyId === mailing.id || Boolean(returnIssue)}
                  >
                    {busyId === mailing.id
                      ? "Working…"
                      : card?.last4
                        ? "Confirm and pay"
                        : "Pay and save card"}
                  </Button>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { useCurrentUser } from "@/lib/use-current-user";
import { invokeEdgeFunction } from "@/lib/edge-functions";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/app-shell";
import { currency, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

const roles = ["consultant", "assistant", "bookkeeper", "client"] as const;

function SettingsPage() {
  const { data: user } = useCurrentUser();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("consultant");
  const [inviteClientId, setInviteClientId] = useState<string>("");
  const [inviting, setInviting] = useState(false);

  const { data: savedCards } = useQuery({
    queryKey: ["saved-cards", user?.clientIds],
    enabled: Boolean(user?.isClient && user.clientIds.length),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_saved_cards")
        .select("client_id, brand, last4, exp_month, exp_year")
        .in("client_id", user?.clientIds ?? []);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: receipts } = useQuery({
    queryKey: ["mail-receipts", user?.clientIds],
    enabled: Boolean(user?.isClient && user.clientIds.length),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_mailings")
        .select("id, recipient_name, total_cents, status, created_at, customer_sentence")
        .in("client_id", user?.clientIds ?? [])
        .in("status", ["paid", "printing", "in_transit", "delivered"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: clients } = useQuery({
    queryKey: ["clients-invite-picker"],
    enabled: Boolean(user?.isAdmin),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name")
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const handleInvite = async () => {
    if (!inviteEmail.trim()) {
      toast.error("Email is required");
      return;
    }
    // A client invite is meaningless without the client it unlocks — the portal
    // link (client_portal_users) is what grants any data access.
    if (inviteRole === "client" && !inviteClientId) {
      toast.error("Select which client this invite unlocks");
      return;
    }
    setInviting(true);
    const { data, error } = await invokeEdgeFunction<{
      invite_link?: string;
      email_sent?: boolean;
    }>("send-invitation", {
      email: inviteEmail.trim(),
      role: inviteRole,
      client_id: inviteRole === "client" ? inviteClientId : undefined,
    });
    setInviting(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(`Invitation created. Share this link: ${data?.invite_link ?? ""}`);
    setInviteEmail("");
    setInviteClientId("");
  };

  return (
    <>
      <PageHeader title="Settings" description="Profile, team, roles, and security" />
      <div className="p-6 max-w-2xl space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Name:</span> {user?.fullName ?? "—"}
            </div>
            <div>
              <span className="text-muted-foreground">Email:</span> {user?.email ?? "—"}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Roles:</span>
              {user?.roles.map((r) => (
                <Badge key={r} variant="secondary" className="capitalize">
                  {r.replace("_", " ")}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {user?.isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Invite team member</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@firm.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <Select
                    value={inviteRole}
                    onValueChange={(v) => {
                      setInviteRole(v);
                      if (v !== "client") setInviteClientId("");
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((r) => (
                        <SelectItem key={r} value={r} className="capitalize">
                          {r.replace("_", " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {inviteRole === "client" && (
                <div className="space-y-1.5">
                  <Label>Client to unlock</Label>
                  <Select value={inviteClientId} onValueChange={setInviteClientId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a client…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(clients ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    The invited user will see this client's portal after accepting.
                  </p>
                </div>
              )}
              <Button size="sm" onClick={handleInvite} disabled={inviting}>
                {inviting ? "Sending…" : "Send invitation"}
              </Button>
            </CardContent>
          </Card>
        )}

        {user?.isClient && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Saved card and mail receipts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {savedCards?.length ? (
                savedCards.map((card) => (
                  <div key={card.client_id}>
                    {card.brand ?? "Card"} ending {card.last4 ?? "••••"}
                    {card.exp_month && card.exp_year
                      ? `, expires ${card.exp_month}/${card.exp_year}`
                      : ""}
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground">
                  No card is saved yet. You’ll save one when you pay for a letter.
                </p>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  const { data, error } = await invokeEdgeFunction<{ url?: string }>(
                    "credit-save-card",
                    {},
                  );
                  if (error || !data?.url) {
                    toast.error(
                      error === "payments_not_configured"
                        ? "Card payments are not live yet."
                        : error || "Could not open checkout",
                    );
                    return;
                  }
                  window.location.assign(data.url);
                }}
              >
                {savedCards?.length ? "Replace saved card" : "Save a card"}
              </Button>
              <div className="space-y-2 border-t border-border pt-3">
                {!receipts?.length ? (
                  <p className="text-muted-foreground">No mail charges yet.</p>
                ) : (
                  receipts.map((receipt) => (
                    <div key={receipt.id} className="flex items-start justify-between gap-3">
                      <div>
                        <div>{receipt.recipient_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatDate(receipt.created_at)} · {receipt.customer_sentence}
                        </div>
                      </div>
                      <div>{currency(receipt.total_cents / 100)}</div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Security</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            MFA/TOTP can be enabled through your Supabase auth provider. Login events are recorded
            in the activity audit trail via the auth-audit edge function.
          </CardContent>
        </Card>
      </div>
    </>
  );
}

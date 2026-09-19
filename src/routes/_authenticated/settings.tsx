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

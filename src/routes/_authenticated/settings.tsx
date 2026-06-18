import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { useCurrentUser } from "@/lib/use-current-user";
import { invokeEdgeFunction } from "@/lib/edge-functions";
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
  const [inviting, setInviting] = useState(false);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) {
      toast.error("Email is required");
      return;
    }
    setInviting(true);
    const { data, error } = await invokeEdgeFunction<{
      invite_link?: string;
      email_sent?: boolean;
    }>("send-invitation", { email: inviteEmail.trim(), role: inviteRole });
    setInviting(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(`Invitation created. Share this link: ${data?.invite_link ?? ""}`);
    setInviteEmail("");
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
                  <Select value={inviteRole} onValueChange={setInviteRole}>
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

import { createFileRoute } from "@tanstack/react-router";
import { useCurrentUser } from "@/lib/use-current-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { data: user } = useCurrentUser();

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
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Security</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            MFA/TOTP can be enabled through your Supabase auth provider. Session expiration and
            device tracking are managed at the platform level.
          </CardContent>
        </Card>
      </div>
    </>
  );
}

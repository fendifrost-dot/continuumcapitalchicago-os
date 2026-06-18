import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { bootstrapUserSession } from "@/lib/session";

export function StaffSetupRequired({ email }: { email: string | null }) {
  const handleRefresh = async () => {
    await bootstrapUserSession();
    window.location.reload();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary px-4 py-12">
      <Card className="max-w-lg p-8 space-y-5">
        <div>
          <h1 className="font-serif text-xl font-semibold tracking-tight">Connect your account to the database</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{email}</span>, but your staff role is not
            assigned in Supabase yet. The app UI loads, but reads and writes are blocked by row-level security until
            this one-time setup runs.
          </p>
        </div>

        <div className="rounded-md border bg-muted/40 p-4 text-sm space-y-2">
          <p className="font-medium">In Lovable → Supabase SQL Editor, run:</p>
          <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
            <li>
              <code className="text-xs bg-background px-1 py-0.5 rounded">supabase/sql/role_assignment.sql</code>
            </li>
            <li>
              <code className="text-xs bg-background px-1 py-0.5 rounded">supabase/sql/audit_triggers_and_invoice_link.sql</code>
            </li>
            <li>Deploy edge functions from the repo (at minimum <code className="text-xs">ensure-user-role</code>)</li>
          </ol>
        </div>

        <p className="text-xs text-muted-foreground">
          After the SQL runs, click refresh below or sign out and back in. You should then see the full Operations
          workspace and be able to create clients and companies.
        </p>

        <div className="flex gap-2">
          <Button onClick={handleRefresh} className="flex-1">
            <RefreshCw className="h-4 w-4" /> Refresh after setup
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/auth";
            }}
          >
            Sign out
          </Button>
        </div>
      </Card>
    </div>
  );
}

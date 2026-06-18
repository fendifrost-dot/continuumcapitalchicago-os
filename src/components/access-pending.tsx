import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

export function AccessPending() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary px-4">
      <Card className="max-w-md p-8 text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary font-serif text-xl font-bold">
          C
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Access pending</h1>
        <p className="text-sm text-muted-foreground">
          Your account is signed in but not yet linked to a client profile. A Continuum Capital
          Group team member will grant portal access shortly.
        </p>
        <Button
          variant="outline"
          className="w-full"
          onClick={async () => {
            await supabase.auth.signOut();
            window.location.href = "/auth";
          }}
        >
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </Card>
    </div>
  );
}

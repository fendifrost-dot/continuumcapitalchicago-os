import {
  createFileRoute,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { AccessPending } from "@/components/access-pending";
import { useCurrentUser } from "@/lib/use-current-user";
import { bootstrapUserSession } from "@/lib/session";
import { isInternalOnlyPath } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const [ready, setReady] = useState(false);
  const { data: user, isLoading, refetch } = useCurrentUser();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    let active = true;
    bootstrapUserSession().finally(() => {
      if (!active) return;
      refetch().finally(() => {
        if (active) setReady(true);
      });
    });
    return () => {
      active = false;
    };
  }, [refetch]);

  useEffect(() => {
    if (!user || user.isPending) return;
    if (user.isClient && isInternalOnlyPath(pathname)) {
      navigate({ to: "/dashboard" });
    }
  }, [user, pathname, navigate]);

  if (!ready || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading workspace…
      </div>
    );
  }

  if (user?.isPending) {
    return <AccessPending />;
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

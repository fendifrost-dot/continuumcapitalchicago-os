import type { ReactNode } from "react";
import { Bell } from "lucide-react";

import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { GlobalSearch } from "@/components/global-search";
import { WorkspaceBadge } from "@/components/workspace-badge";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/lib/use-current-user";

export function AppShell({ children }: { children: ReactNode }) {
  const { data: user } = useCurrentUser();

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <SidebarTrigger />
            {user?.isInternal && <GlobalSearch />}
            {!user?.isInternal && (
              <div className="flex-1 text-sm text-muted-foreground truncate">
                Welcome back{user?.fullName ? `, ${user.fullName.split(" ")[0]}` : ""}
              </div>
            )}
            <WorkspaceBadge />
            <div className="ml-auto flex items-center gap-2">
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-4 w-4" />
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent" />
              </Button>
            </div>
          </header>
          <main className="flex-1 overflow-x-hidden">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="relative flex flex-wrap items-end justify-between gap-3 border-b border-border bg-gradient-to-r from-background via-background to-secondary/30 px-6 py-5">
      <div className="absolute inset-y-0 left-0 w-1 bg-accent/80" aria-hidden />
      <div className="pl-3">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

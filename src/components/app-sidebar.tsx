import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  Building2,
  Receipt,
  FileText,
  Landmark,
  Wallet,
  Calendar,
  FolderOpen,
  Activity,
  Settings,
  LogOut,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/lib/use-current-user";
import type { AppRole } from "@/lib/use-current-user";

type NavItem = {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  hideFor?: AppRole[];
  internalOnly?: boolean;
};

const mainItems: NavItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Clients", url: "/clients", icon: Users, internalOnly: true },
  { title: "Companies", url: "/companies", icon: Building2 },
  { title: "Transactions", url: "/transactions", icon: Receipt },
  { title: "Invoices", url: "/invoices", icon: FileText },
  { title: "Funding", url: "/funding", icon: Landmark },
  { title: "Loans", url: "/loans", icon: Wallet },
  { title: "Calendar", url: "/calendar", icon: Calendar },
  { title: "Documents", url: "/documents", icon: FolderOpen },
  { title: "Activity", url: "/activity", icon: Activity, internalOnly: true },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { data: user } = useCurrentUser();

  const visibleItems = mainItems.filter((item) => {
    if (item.internalOnly && !user?.isInternal) return false;
    if (item.hideFor && user?.roles.some((r) => item.hideFor!.includes(r))) return false;
    return true;
  });

  const isActive = (url: string) => pathname === url || pathname.startsWith(url + "/");

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="px-4 py-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground font-bold text-sm">
            C
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold text-sidebar-foreground">Continuum</span>
              <span className="text-[10px] uppercase tracking-wider text-sidebar-foreground/60">Capital Group</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel>Workspace</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <Link to={item.url} className="flex items-center gap-2.5">
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel>Account</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/settings")} tooltip="Settings">
                  <Link to="/settings" className="flex items-center gap-2.5">
                    <Settings className="h-4 w-4 shrink-0" />
                    {!collapsed && <span>Settings</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={handleSignOut} tooltip="Sign out">
                  <LogOut className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>Sign out</span>}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border px-3 py-3">
        {!collapsed && user && (
          <div className="flex flex-col gap-0.5 text-xs">
            <span className="font-medium text-sidebar-foreground truncate">{user.fullName}</span>
            <span className="text-sidebar-foreground/60 truncate">{user.email}</span>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
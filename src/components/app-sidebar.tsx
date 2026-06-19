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
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/lib/use-current-user";
import type { AppRole } from "@/lib/use-current-user";

type NavItem = {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  hideFor?: AppRole[];
  internalOnly?: boolean;
  clientOnly?: boolean;
};

const internalItems: NavItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Clients", url: "/clients", icon: Users, internalOnly: true },
  { title: "Companies", url: "/companies", icon: Building2 },
  { title: "Transactions", url: "/transactions", icon: Receipt, internalOnly: true },
  { title: "Invoices", url: "/invoices", icon: FileText },
  { title: "Funding", url: "/funding", icon: Landmark },
  { title: "Loans", url: "/loans", icon: Wallet, internalOnly: true },
  { title: "Calendar", url: "/calendar", icon: Calendar },
  { title: "Documents", url: "/documents", icon: FolderOpen },
  { title: "Activity", url: "/activity", icon: Activity, internalOnly: true },
];

const clientItems: NavItem[] = [
  { title: "Overview", url: "/dashboard", icon: LayoutDashboard, clientOnly: true },
  { title: "My companies", url: "/companies", icon: Building2, clientOnly: true },
  { title: "Documents", url: "/documents", icon: FolderOpen, clientOnly: true },
  { title: "Invoices", url: "/invoices", icon: FileText, clientOnly: true },
  { title: "Funding", url: "/funding", icon: Landmark, clientOnly: true },
  { title: "Calendar", url: "/calendar", icon: Calendar, clientOnly: true },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { data: user } = useCurrentUser();

  const navItems = user?.isClient ? clientItems : internalItems;
  const groupLabel = user?.isClient ? "Your account" : "Operations";

  const visibleItems = navItems.filter((item) => {
    if (item.internalOnly && !user?.isInternal) return false;
    if (item.clientOnly && !user?.isClient) return false;
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
      <SidebarHeader className="border-b border-sidebar-border/60 px-4 py-5">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/20 font-bold text-base tracking-tighter"
            style={{
              backgroundImage:
                "linear-gradient(135deg, #FDE68A 0%, #D4AF37 45%, #8E6E37 100%)",
              color: "#2a1e00",
              boxShadow:
                "0 0 18px rgba(212,175,55,0.35), inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -1px 0 rgba(0,0,0,0.25)",
            }}
          >
            CC
          </div>
          {!collapsed && (
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-sm font-semibold text-sidebar-foreground">Continuum</span>
              <span className="text-[10px] uppercase tracking-widest font-semibold text-[#D4AF37]">
                {user?.isClient ? "Client portal" : "Chicago · Operations"}
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel>{groupLabel}</SidebarGroupLabel>}
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
          <div className="space-y-1.5">
            <Badge
              variant="outline"
              className="border-sidebar-primary/40 bg-sidebar-primary/10 text-[10px] text-sidebar-primary"
            >
              {user.isInternal ? "Staff" : "Client"}
            </Badge>
            <div className="flex flex-col gap-0.5 text-xs">
              <span className="font-medium text-sidebar-foreground truncate">{user.fullName}</span>
              <span className="text-sidebar-foreground/60 truncate">{user.email}</span>
            </div>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}

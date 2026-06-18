import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isInternalEmail } from "@/lib/roles";

export type AppRole = "super_admin" | "consultant" | "assistant" | "bookkeeper" | "client";

export interface CurrentUser {
  id: string;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  roles: AppRole[];
  /** Has an internal role in the database (RLS will allow staff operations). */
  isInternal: boolean;
  isAdmin: boolean;
  isClient: boolean;
  /** Signed in but not linked to a client and not staff. */
  isPending: boolean;
  /** Firm email detected but DB roles not assigned yet — RLS blocks all data. */
  needsStaffSetup: boolean;
  clientIds: string[];
}

export function useCurrentUser() {
  return useQuery<CurrentUser | null>({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;
      if (!user) return null;

      const email = user.email ?? null;

      const [profileRes, rolesRes, portalRes] = await Promise.all([
        supabase.from("profiles").select("full_name, avatar_url").eq("id", user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        supabase.from("client_portal_users").select("client_id").eq("user_id", user.id),
      ]);

      const roles = (rolesRes.data ?? []).map((r) => r.role as AppRole);
      const clientIds = (portalRes.data ?? []).map((r) => r.client_id);

      const hasInternalRole = roles.some((r) =>
        ["super_admin", "consultant", "assistant", "bookkeeper"].includes(r),
      );
      const isClient = roles.includes("client") && !hasInternalRole;
      const isFirmEmail = isInternalEmail(email);

      // RLS uses database roles only — do not infer staff access from email alone.
      const isInternal = hasInternalRole;
      const needsStaffSetup = isFirmEmail && !hasInternalRole && !isClient;
      const isPending = !isInternal && !isClient && !needsStaffSetup;

      return {
        id: user.id,
        email,
        fullName: profileRes.data?.full_name ?? user.email?.split("@")[0] ?? null,
        avatarUrl: profileRes.data?.avatar_url ?? null,
        roles,
        isInternal,
        isAdmin: roles.includes("super_admin"),
        isClient,
        isPending,
        needsStaffSetup,
        clientIds,
      };
    },
    staleTime: 30_000,
  });
}

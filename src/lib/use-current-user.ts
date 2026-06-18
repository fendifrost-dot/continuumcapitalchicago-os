import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "super_admin" | "consultant" | "assistant" | "bookkeeper" | "client";

export interface CurrentUser {
  id: string;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  roles: AppRole[];
  isInternal: boolean;
  isAdmin: boolean;
  isClient: boolean;
}

export function useCurrentUser() {
  return useQuery<CurrentUser | null>({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;
      if (!user) return null;

      const [profileRes, rolesRes] = await Promise.all([
        supabase.from("profiles").select("full_name, avatar_url").eq("id", user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user.id),
      ]);

      const roles = (rolesRes.data ?? []).map((r) => r.role as AppRole);
      const isInternal = roles.some((r) => ["super_admin", "consultant", "assistant", "bookkeeper"].includes(r));

      return {
        id: user.id,
        email: user.email ?? null,
        fullName: profileRes.data?.full_name ?? user.email?.split("@")[0] ?? null,
        avatarUrl: profileRes.data?.avatar_url ?? null,
        roles,
        isInternal,
        isAdmin: roles.includes("super_admin"),
        isClient: roles.includes("client") || !isInternal,
      };
    },
    staleTime: 60_000,
  });
}
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export function createServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export function createUserClient(authHeader: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
}

export async function requireUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return { error: "Unauthorized", status: 401 as const };

  const supabase = createUserClient(authHeader);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { error: "Unauthorized", status: 401 as const };

  return { supabase, user: data.user };
}

export async function requireInternal(req: Request) {
  const result = await requireUser(req);
  if ("error" in result) return result;

  const { data: roles } = await result.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", result.user.id);

  const isInternal = (roles ?? []).some((r) =>
    ["super_admin", "consultant", "assistant", "bookkeeper"].includes(r.role),
  );
  if (!isInternal) return { error: "Forbidden", status: 403 as const };

  return result;
}

export async function requireAdmin(req: Request) {
  const result = await requireUser(req);
  if ("error" in result) return result;

  const { data: roles } = await result.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", result.user.id);

  const isAdmin = (roles ?? []).some((r) => r.role === "super_admin");
  if (!isAdmin) return { error: "Forbidden", status: 403 as const };

  return result;
}

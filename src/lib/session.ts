import { supabase } from "@/integrations/supabase/client";

/** Sync roles after sign-in (fixes firm staff vs client portal assignment). */
export async function bootstrapUserSession() {
  const { data, error } = await supabase.functions.invoke("ensure-user-role");
  if (error) {
    console.warn("ensure-user-role:", error.message);
    return null;
  }
  return data as {
    roles: string[];
    isInternal: boolean;
    isClient: boolean;
    access: "operations" | "client_portal" | "pending";
  };
}

import { supabase } from "@/integrations/supabase/client";

export async function invokeEdgeFunction<T = unknown>(
  name: string,
  body?: Record<string, unknown>,
): Promise<{ data: T | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke(name, { body: body ?? {} });
  if (error) return { data: null, error: error.message };
  return { data: data as T, error: null };
}

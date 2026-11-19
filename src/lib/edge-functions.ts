import { supabase } from "@/integrations/supabase/client";

export async function invokeEdgeFunction<T = unknown>(
  name: string,
  body?: Record<string, unknown>,
): Promise<{ data: T | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke(name, { body: body ?? {} });
  if (error) {
    const context = (error as { context?: { json?: () => Promise<unknown> } }).context;
    if (context?.json) {
      try {
        const payload = await context.json();
        if (
          payload &&
          typeof payload === "object" &&
          "error" in payload &&
          typeof payload.error === "string" &&
          payload.error
        ) {
          return { data: null, error: payload.error };
        }
      } catch {
        // The function body was not JSON.
      }
    }
    return { data: null, error: error.message };
  }
  return { data: data as T, error: null };
}

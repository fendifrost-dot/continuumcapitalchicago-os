// Lovable generates this client. The public URL/anon-key fallback in public-env.ts
// is intentional — do not go back to reading process.env.SUPABASE_URL by itself.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { brokeredPreviewStorage } from "./previewAuthStorage";
import { resolveSupabaseBrowserConfig } from "./public-env";

function createSupabaseClient() {
  // Vite's client build replaces `process.env` with `{}`. A missing
  // VITE_SUPABASE_URL therefore cannot fall back to process.env.SUPABASE_URL:
  // that expression compiles to `{}.SUPABASE_URL` and the page throws
  // "Missing Supabase environment variable(s): SUPABASE_URL".
  // resolveSupabaseBrowserConfig keeps the public project URL and anon key
  // when those build-time vars were not inlined. Server code still reads
  // process.env at runtime (keepProcessEnv is on for the server bundle).
  const { url: SUPABASE_URL, publishableKey: SUPABASE_PUBLISHABLE_KEY } =
    resolveSupabaseBrowserConfig({
      viteUrl: import.meta.env.VITE_SUPABASE_URL,
      serverUrl: process.env.SUPABASE_URL,
      vitePublishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      serverPublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
    });

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    const missing = [
      ...(!SUPABASE_URL ? ["SUPABASE_URL"] : []),
      ...(!SUPABASE_PUBLISHABLE_KEY ? ["SUPABASE_PUBLISHABLE_KEY"] : []),
    ];
    const message = `Missing Supabase environment variable(s): ${missing.join(", ")}. Connect Supabase in Lovable Cloud.`;
    console.error(`[Supabase] ${message}`);
    throw new Error(message);
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: brokeredPreviewStorage(),
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";
export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});

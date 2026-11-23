/**
 * Public browser config for the Lovable Cloud project mdmetmylcfkehugcpbjg.
 * The URL and anon (publishable) key are client values. Never put a
 * service-role key here.
 *
 * The anon key below is the one already shipped in the published client
 * bundle. It is a fallback for when the build did not inline VITE_ vars.
 */
export const PUBLIC_SUPABASE_URL = "https://mdmetmylcfkehugcpbjg.supabase.co";

export const PUBLIC_SUPABASE_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kbWV0bXlsY2ZrZWh1Z2NwYmpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MDU0MzUsImV4cCI6MjA5NzM4MTQzNX0.IfnqLMLI8Nl8lK_a44tyFBgCBRrnjBU4P4TliQ0czHA";

export type SupabaseBrowserSources = {
  viteUrl?: string;
  serverUrl?: string;
  vitePublishableKey?: string;
  serverPublishableKey?: string;
};

function firstNonEmpty(values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function jwtRole(token: string): string | undefined {
  const segment = token.split(".")[1];
  if (!segment) return undefined;
  try {
    const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const payload = JSON.parse(atob(padded)) as { role?: unknown };
    return typeof payload.role === "string" ? payload.role : undefined;
  } catch {
    return undefined;
  }
}

/** Service-role credentials must never be inlined into the browser bundle. */
export function isServiceRoleKey(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("sb_secret_")) return true;
  return jwtRole(trimmed) === "service_role";
}

function firstPublishableKey(values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed || isServiceRoleKey(trimmed)) continue;
    return trimmed;
  }
  return undefined;
}

/**
 * URL and anon key for the browser client.
 * Prefer build-time VITE_ values, then the server env names (real on the
 * server; Vite compiles `process.env` to `{}` in the client), then the
 * public constants.
 */
export function resolveSupabaseBrowserConfig(sources: SupabaseBrowserSources): {
  url: string;
  publishableKey: string;
} {
  return {
    url: firstNonEmpty([sources.viteUrl, sources.serverUrl]) ?? PUBLIC_SUPABASE_URL,
    publishableKey:
      firstPublishableKey([sources.vitePublishableKey, sources.serverPublishableKey]) ??
      PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

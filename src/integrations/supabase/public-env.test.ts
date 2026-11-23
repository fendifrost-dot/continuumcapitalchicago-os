import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  PUBLIC_SUPABASE_URL,
  isServiceRoleKey,
  resolveSupabaseBrowserConfig,
} from "./public-env.ts";

const here = dirname(fileURLToPath(import.meta.url));

function jwt(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${body}.sig`;
}

test("uses the public project URL when neither env var is set", () => {
  assert.deepEqual(resolveSupabaseBrowserConfig({}), {
    url: PUBLIC_SUPABASE_URL,
    publishableKey: PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  assert.equal(PUBLIC_SUPABASE_URL, "https://mdmetmylcfkehugcpbjg.supabase.co");
  assert.equal(isServiceRoleKey(PUBLIC_SUPABASE_PUBLISHABLE_KEY), false);
});

test("prefers VITE_ values, then server env names, and skips blanks", () => {
  assert.equal(
    resolveSupabaseBrowserConfig({
      viteUrl: "  ",
      serverUrl: "https://example.supabase.co",
      vitePublishableKey: "",
      serverPublishableKey: "sb_publishable_from_server",
    }).url,
    "https://example.supabase.co",
  );
  assert.equal(
    resolveSupabaseBrowserConfig({
      viteUrl: "https://vite.supabase.co",
      serverUrl: "https://server.supabase.co",
      vitePublishableKey: "sb_publishable_from_vite",
      serverPublishableKey: "sb_publishable_from_server",
    }).publishableKey,
    "sb_publishable_from_vite",
  );
});

test("never selects a service-role key for the browser", () => {
  const serviceRole = jwt({ role: "service_role", ref: "mdmetmylcfkehugcpbjg" });
  assert.equal(isServiceRoleKey(serviceRole), true);
  assert.equal(isServiceRoleKey("sb_secret_example"), true);
  assert.equal(
    resolveSupabaseBrowserConfig({
      vitePublishableKey: serviceRole,
      serverPublishableKey: "sb_secret_example",
    }).publishableKey,
    PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
});

test("the browser client resolves config instead of reading process.env.SUPABASE_URL alone", () => {
  const client = readFileSync(join(here, "client.ts"), "utf8");
  assert.match(client, /resolveSupabaseBrowserConfig\(/);
  assert.doesNotMatch(client, /SERVICE_ROLE/);
});

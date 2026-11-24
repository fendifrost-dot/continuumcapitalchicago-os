import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { payingClientWrite } from "./paying-client.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const actor = "11111111-1111-4111-8111-111111111111";
const markedAt = "2026-11-23T18:00:00.000Z";

test("a new unmarked client does not write paying columns", () => {
  assert.equal(
    payingClientWrite({
      isPaying: false,
      note: "   ",
      actorId: actor,
      markedAt,
    }),
    null,
  );
});

test("marking a client stamps the staff user and keeps a trimmed note", () => {
  assert.deepEqual(
    payingClientWrite({
      isPaying: true,
      note: "  Cash, through June  ",
      actorId: `  ${actor}  `,
      markedAt,
    }),
    {
      is_paying_client: true,
      paying_note: "Cash, through June",
      paying_marked_by: actor,
      paying_marked_at: markedAt,
    },
  );
});

test("a note alone on a new client still stamps the flag as not paying", () => {
  assert.deepEqual(
    payingClientWrite({
      isPaying: false,
      note: "Comped this month",
      actorId: actor,
      markedAt,
    }),
    {
      is_paying_client: false,
      paying_note: "Comped this month",
      paying_marked_by: actor,
      paying_marked_at: markedAt,
    },
  );
});

test("an edit that leaves the flag and note alone does not restamp", () => {
  assert.equal(
    payingClientWrite({
      isPaying: true,
      note: "Cash, through June",
      actorId: actor,
      markedAt,
      previous: { is_paying_client: true, paying_note: "  Cash, through June  " },
    }),
    null,
  );
});

test("staff can turn the flag off and the change is stamped", () => {
  assert.deepEqual(
    payingClientWrite({
      isPaying: false,
      note: "",
      actorId: actor,
      markedAt,
      previous: { is_paying_client: true, paying_note: "Cash, through June" },
    }),
    {
      is_paying_client: false,
      paying_note: null,
      paying_marked_by: actor,
      paying_marked_at: markedAt,
    },
  );
});

test("changing only the note stamps the same flag value", () => {
  const write = payingClientWrite({
    isPaying: true,
    note: "Updated reason",
    actorId: actor,
    markedAt,
    previous: { is_paying_client: true, paying_note: "Old reason" },
  });
  assert.equal(write?.is_paying_client, true);
  assert.equal(write?.paying_note, "Updated reason");
  assert.equal(write?.paying_marked_by, actor);
  assert.equal(write?.paying_marked_at, markedAt);
});

test("a paying change without a staff user is refused", () => {
  assert.throws(
    () =>
      payingClientWrite({
        isPaying: true,
        note: "",
        actorId: "  ",
        markedAt,
      }),
    /staff user is required/,
  );
});

test("the migration lets staff record a paying client and blocks everyone else", () => {
  const sql = readFileSync(
    join(root, "supabase/migrations/20261123180000_staff_paying_client.sql"),
    "utf8",
  );
  assert.match(sql, /ADD COLUMN IF NOT EXISTS is_paying_client boolean/);
  assert.match(sql, /ALTER COLUMN is_paying_client SET NOT NULL/);
  assert.match(sql, /ALTER COLUMN is_paying_client SET DEFAULT false/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS paying_marked_by uuid/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS paying_marked_at timestamptz/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS paying_note text/);
  assert.match(sql, /REFERENCES auth\.users \(id\)/);
  assert.match(sql, /ON DELETE SET NULL/);
  assert.match(sql, /public\.is_internal\(auth\.uid\(\)\)/);
  assert.match(sql, /Only internal staff can update paying client fields/);
  assert.match(sql, /DROP TRIGGER IF EXISTS tg_clients_paying_flag/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.guard_client_paying_flag\(\)/);
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.guard_client_paying_flag\(\) FROM PUBLIC, anon, authenticated/,
  );
  assert.match(sql, /REVOKE ALL ON TABLE public\.clients FROM anon/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.clients FROM PUBLIC/);
  assert.equal(/^\s*grant\b/im.test(sql), false);
  assert.equal(/stripe|lob|credit_mailing/i.test(sql), false);
  assert.match(sql, /WITH CHECK \(public\.is_internal\(auth\.uid\(\)\)\)/);
});

test("staff screens show the flag and payment code does not read it", () => {
  const form = readFileSync(join(root, "src/components/client-form-dialog.tsx"), "utf8");
  const list = readFileSync(join(root, "src/routes/_authenticated/clients.index.tsx"), "utf8");
  const detail = readFileSync(join(root, "src/routes/_authenticated/clients.$id.tsx"), "utf8");
  for (const source of [form, list, detail]) {
    assert.match(source, /Paying client/);
  }
  assert.match(form, /payingClientWrite/);
  assert.match(list, /is_paying_client/);
  assert.match(detail, /is_paying_client/);

  const untouched = [
    "supabase/functions/credit-test-mailing/index.ts",
    "supabase/functions/credit-charge-mailing/index.ts",
    "supabase/functions/credit-save-card/index.ts",
    "supabase/functions/credit-prepare-mailing/index.ts",
    "supabase/functions/stripe-credit-webhook/index.ts",
    "supabase/functions/_shared/publish-mailing.ts",
    "supabase/functions/_shared/lob.ts",
    "supabase/functions/_shared/credit-mail-policy.ts",
  ];
  for (const file of untouched) {
    const source = readFileSync(join(root, file), "utf8");
    assert.equal(source.includes("is_paying_client"), false, file);
    assert.equal(source.includes("paying_marked_by"), false, file);
  }
});

# Supabase SQL (SQL Editor)

**Tables, schema, RLS policies, and triggers** are applied via the **Supabase SQL Editor** in Lovable — not via `supabase db push` from this repo.

The files here are reference scripts to copy into the SQL Editor when needed.

## Scripts

| File | Purpose |
|------|---------|
| `audit_triggers_and_invoice_link.sql` | Links `invoice_items.transaction_id`, adds centralized audit triggers, ensures storage buckets exist |

## Note on `supabase/migrations/`

The `migrations/` folder contains historical schema from Lovable code generation. New schema changes should be run in the SQL Editor and reflected in `src/integrations/supabase/types.ts` when types change.

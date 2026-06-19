# Supabase SQL (SQL Editor)

**Tables, schema, RLS policies, and triggers** are applied via the **Supabase SQL Editor** in Lovable — not via `supabase db push` from this repo.

The files here are reference scripts to copy into the SQL Editor when needed.

## Scripts

| File                                  | Purpose                                                                           |
| ------------------------------------- | --------------------------------------------------------------------------------- |
| `audit_triggers_and_invoice_link.sql` | Audit triggers and storage buckets                                                |
| `role_assignment.sql`                 | Firm staff vs client role rules; promotes `@continuumcapitalchicago.com` accounts |
| `accounts_payments_secrets.sql`       | Accounts & Logins (encrypted passwords via pgcrypto) + `payment_schedules` table  |
| `seed_jamal_harris.sql`               | Test data: Jamal Harris + Buzz Genius Inc., Advisors List, Market Mingle          |

## Order to run new changes

1. `accounts_payments_secrets.sql` — adds the encryption key, account/login fields on
   `credentials`, the `reveal_credential_secret` / `set_credential_secret` functions, the
   client read policy, and the `payment_schedules` table. Idempotent.
2. `seed_jamal_harris.sql` — optional test data. Idempotent. Passwords are placeholders
   (`Continuum#Setup2026`) — update them in the app once real logins are confirmed.

## Note on `supabase/migrations/`

The `migrations/` folder contains historical schema from Lovable code generation. New schema
changes should be run in the SQL Editor and reflected in `src/integrations/supabase/types.ts`
when types change. The two new scripts above are also mirrored as migration files with matching
content, so either path stays in sync.

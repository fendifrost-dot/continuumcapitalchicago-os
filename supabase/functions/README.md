# Supabase Edge Functions

Write functions in `supabase/functions/<name>/index.ts` and commit — Lovable syncs and deploys them.

Shared utilities live in `_shared/`.

## Functions

| Function                | Trigger                | Purpose                                                                                           |
| ----------------------- | ---------------------- | ------------------------------------------------------------------------------------------------- |
| `ensure-user-role`      | App invoke on sign-in  | Assigns firm staff vs client portal roles; promotes `@continuumcapitalchicago.com` to super_admin |
| `payment-reminders`     | Daily cron             | In-app reminders at 30/14/7/1 days for loans, calendar, invoices                                  |
| `mark-overdue-invoices` | Daily cron             | Marks past-due sent invoices as overdue                                                           |
| `generate-invoice-pdf`  | App invoke             | Builds PDF, uploads to storage                                                                    |
| `auth-audit`            | App invoke / auth hook | Logs sign-in to activity trail                                                                    |
| `send-invitation`       | App invoke (admin)     | Creates invitation record and returns shareable link                                              |

Email delivery (Resend) is intentionally not wired — invitations and reminders are in-app only for now.

## Cron schedules

| Function                | Example schedule |
| ----------------------- | ---------------- |
| `payment-reminders`     | `0 8 * * *`      |
| `mark-overdue-invoices` | `0 1 * * *`      |

## Required SQL (SQL Editor)

Run `supabase/sql/role_assignment.sql` so signup triggers and your firm account roles are correct.

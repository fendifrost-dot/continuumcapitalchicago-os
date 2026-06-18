# Supabase Edge Functions

Write functions in `supabase/functions/<name>/index.ts` and commit — Lovable syncs and deploys them.

Shared utilities live in `_shared/`.

## Functions

| Function | Trigger | Purpose |
|----------|---------|---------|
| `payment-reminders` | Daily cron | Loan, calendar, and invoice due-date reminders (30/14/7/1 days). In-app notifications + optional Resend email. |
| `mark-overdue-invoices` | Daily cron | Marks `sent` invoices past `due_date` as `overdue` and logs activity. |
| `generate-invoice-pdf` | App invoke | Builds PDF with pdf-lib, uploads to `invoices` bucket, updates `pdf_path`. Requires internal user JWT. |
| `auth-audit` | Auth hook or app invoke | Records login/logout in `activity_logs`. |
| `send-invitation` | App invoke (admin) | Creates invitation row and emails invite link via Resend. |

## Secrets (set in Lovable / Supabase)

| Secret | Required | Used by |
|--------|----------|---------|
| `SUPABASE_URL` | Auto | All |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto | All |
| `SUPABASE_ANON_KEY` | Auto | Authenticated invokes |
| `RESEND_API_KEY` | Optional | Email sending |
| `RESEND_FROM_EMAIL` | Optional | Email from address |
| `APP_URL` | Recommended | Links in emails |

## Cron schedules (configure in Lovable after deploy)

| Function | Schedule | Example |
|----------|----------|---------|
| `payment-reminders` | Daily 8 AM UTC | `0 8 * * *` |
| `mark-overdue-invoices` | Daily 1 AM UTC | `0 1 * * *` |

## Auth hook

Point Supabase Auth Hook (sign-in / sign-out) at `auth-audit` for automatic login audit logging without client calls.

## App integration

The React app calls edge functions via `supabase.functions.invoke()`:

- `generate-invoice-pdf` — after invoice creation and from Invoices page
- `auth-audit` — after email sign-in
- `send-invitation` — Settings page (admin only)

# Supabase Edge Functions

Write edge functions in `supabase/functions/<name>/index.ts` and commit to the connected branch. Lovable syncs and deploys them to the linked Supabase project.

## Functions

| Function | Purpose |
|----------|---------|
| `payment-reminders` | Daily check for loan payments and calendar events due in 30/14/7/1 days; creates in-app notifications for internal users |

## Scheduling

After deploy, configure a daily cron trigger in Lovable/Supabase to invoke `payment-reminders` (e.g. `0 8 * * *` for 8 AM UTC).

## Local invoke (optional)

```bash
supabase functions serve payment-reminders
```

# Handoff — certified letter payments

Phase 3 (the customer file) is in this branch. Phase 4 (pay, then print) is coded and is not live. Do not redeploy the mail functions until the keys below exist in Lovable Cloud for Continuum OS (`3636b8e4-5824-4ba6-8e02-4deb03fca014`). Do not paste the values into chat or git.

The Stripe account is the one the Continuum Capital site already uses. Add a restricted key on that account. Do not create a second Stripe account. Lob is the mail provider. Continuum pays Lob. The customer pays Continuum. Electronic return receipt only. No physical green card.

## Keys to add

| Name                           | What it is                                                                                                                                                                                                                               |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `STRIPE_RESTRICTED_KEY`        | Restricted key, prefix `rk_`. A secret key (`sk_`) is ignored on purpose. Permissions: Checkout Sessions write, Customers write, PaymentIntents write, SetupIntents read, PaymentMethods read. No tax, no connect.                       |
| `STRIPE_CREDIT_WEBHOOK_SECRET` | Signing secret, prefix `whsec_`, for a webhook endpoint aimed at `stripe-credit-webhook`. Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `payment_intent.succeeded`, `payment_intent.payment_failed`. |
| `LOB_API_KEY`                  | Lob secret key, prefix `test_` until a sandbox letter is accepted, then `live_`.                                                                                                                                                         |
| `LOB_WEBHOOK_SECRET`           | Lob webhook signing secret for `lob-tracking-webhook`.                                                                                                                                                                                   |
| `LOB_FROM_NAME`                | Continuum’s return name on the envelope.                                                                                                                                                                                                 |
| `LOB_FROM_LINE1`               | Return street.                                                                                                                                                                                                                           |
| `LOB_FROM_LINE2`               | Optional.                                                                                                                                                                                                                                |
| `LOB_FROM_CITY`                | Return city.                                                                                                                                                                                                                             |
| `LOB_FROM_STATE`               | Two-letter state.                                                                                                                                                                                                                        |
| `LOB_FROM_ZIP`                 | ZIP.                                                                                                                                                                                                                                     |
| `APP_URL`                      | Published Continuum OS origin, `https://…`. Used only if the browser origin is not already an allowed Continuum or Lovable host.                                                                                                         |

## After the keys exist

Redeploy these edge functions. Publish does not redeploy them.

- `credit-prepare-mailing`
- `credit-save-card`
- `credit-charge-mailing`
- `stripe-credit-webhook`
- `lob-tracking-webhook`

Apply `supabase/migrations/20261008021500_credit_file_customer_copy.sql` in the Lovable SQL editor if it is not already on the database.

## Checks

1. A client login sees only the published status, mailed letters, and documents for the client ids on `client_portal_users`. A second client does not see the first. Drafts and `raw_line` are not columns.
2. A letter shows pages, print and postage, certified mail, electronic return receipt, and a $5 handling fee.
3. Stripe test mode: a succeeded payment is the only path that calls Lob. A declined card leaves the letter unprinted. The audit row `lob_submitted` or `lob_not_submitted` says which.
4. Do not charge a real customer until the restricted key and the Lob key are live keys and a test letter has a tracking number.

Phase 4 stays unpublished while any of those keys are missing. The customer page can still say that card payments are not live yet.

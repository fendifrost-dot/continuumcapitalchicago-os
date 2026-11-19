# Handoff — certified letter payments

Phase 3 (the customer file) is in this branch. Phase 4 (pay, then print) is coded and is not live. Do not redeploy the mail functions until the keys below exist in Lovable Cloud for Continuum OS (`3636b8e4-5824-4ba6-8e02-4deb03fca014`). Do not paste the values into chat or git.

The Stripe account is the one the Continuum Capital site already uses. Add a restricted key on that account. Do not create a second Stripe account. Lob is the mail provider. Continuum pays Lob. The customer pays Continuum. Electronic return receipt only. No physical green card.

## Keys to add

| Name                           | What it is                                                                                                                                                                                                                               |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `STRIPE_RESTRICTED_KEY`        | Restricted key, prefix `rk_`. A secret key (`sk_`) is ignored on purpose. Permissions: Checkout Sessions write, Customers write, PaymentIntents write, SetupIntents read, PaymentMethods read. No tax, no connect.                       |
| `STRIPE_CREDIT_WEBHOOK_SECRET` | Signing secret, prefix `whsec_`, for a webhook endpoint aimed at `stripe-credit-webhook`. Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `payment_intent.succeeded`, `payment_intent.payment_failed`. |
| `LOB_API_KEY`                  | Lob secret key, prefix `test_` until a sandbox letter is accepted, then `live_`. This is the only Lob secret required to submit a letter.                                                                                                |
| `LOB_WEBHOOK_SECRET`           | Lob webhook signing secret for `lob-tracking-webhook`.                                                                                                                                                                                   |
| `APP_URL`                      | Published Continuum OS origin, `https://…`. Used only if the browser origin is not already an allowed Continuum or Lovable host.                                                                                                         |

`LOB_FROM_NAME`, `LOB_FROM_LINE1`, `LOB_FROM_LINE2`, `LOB_FROM_CITY`, `LOB_FROM_STATE`, and `LOB_FROM_ZIP` are not read. Do not put Continuum’s name or address on the envelope. Each letter is mailed from the client.

The client record stores that address on `clients.name`, `mailing_line1`, `mailing_line2`, `mailing_city`, `mailing_state`, and `mailing_zip`. A company address is not the return address. Preparing a quote copies the client address onto `credit_mailings.return_name`, `return_line1`, `return_line2`, `return_city`, `return_state`, and `return_zip`. Lob’s `from` is that copy. Staff see it on the quote before the client pays, and the client sees the same snapshot before paying. If the address is missing or incomplete, the quote is refused, Checkout and a saved-card charge are refused, and Lob is not called.

Quotes prepared before `20261119193000_client_return_address.sql` have no return snapshot. They cannot be paid. Save the client address and prepare the quote again.

## After the keys exist

Apply these in the Lovable SQL editor if they are not already on the database:

- `supabase/migrations/20261008021500_credit_file_customer_copy.sql`
- `supabase/migrations/20261119193000_client_return_address.sql`

Redeploy these edge functions after the migration. Publish does not redeploy them.

- `credit-prepare-mailing`
- `credit-save-card`
- `credit-charge-mailing`
- `stripe-credit-webhook`
- `lob-tracking-webhook`

The client return address is read by the first four. `lob-tracking-webhook` is unchanged by that work. Redeploy it when its own code or `LOB_WEBHOOK_SECRET` changes.

## Checks

1. A client login sees only the published status, mailed letters, and documents for the client ids on `client_portal_users`. A second client does not see the first. Drafts and `raw_line` are not columns.
2. A letter shows pages, print and postage, certified mail, electronic return receipt, and a $5 handling fee.
3. Stripe test mode: a succeeded payment is the only path that calls Lob. A declined card leaves the letter unprinted. The audit row `lob_submitted` or `lob_not_submitted` says which. `return_address_incomplete` means Lob was not called because the client address was missing.
4. Do not charge a real customer until the restricted key and the Lob key are live keys and a test letter has a tracking number.
5. The staff quote shows the client return address. An incomplete address cannot be prepared or paid. Lob’s `from` is the snapshot on that mailing.

Phase 4 stays unpublished while any of those keys are missing. The customer page can still say that card payments are not live yet.

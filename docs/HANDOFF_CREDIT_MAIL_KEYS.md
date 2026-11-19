# Handoff — certified letter payments

Phase 3 (the customer file) is in this branch. Phase 4 (pay, then print) is coded and is not live. Do not redeploy the mail functions until the keys below exist in Lovable Cloud for Continuum OS (`3636b8e4-5824-4ba6-8e02-4deb03fca014`). Do not paste the values into chat or git.

The Stripe account is the one the Continuum Capital site already uses. Add a restricted key on that account. Do not create a second Stripe account. Lob is the mail provider. Continuum pays Lob. The customer pays Continuum. Electronic return receipt only. No physical green card.

## Keys to add

| Name                           | What it is                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `STRIPE_RESTRICTED_KEY`        | Restricted key, prefix `rk_`, for client Checkout and saved-card charges. A secret key (`sk_`) is ignored on that path. The staff sandbox also accepts `sk_test_` or `rk_test_` in this same variable, and refuses `sk_live_` / `rk_live_`. Permissions: Checkout Sessions write, Customers write, PaymentIntents write, SetupIntents read, PaymentMethods read. No tax, no connect. |
| `STRIPE_CREDIT_WEBHOOK_SECRET` | Signing secret, prefix `whsec_`, for a webhook endpoint aimed at `stripe-credit-webhook`. Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `payment_intent.succeeded`, `payment_intent.payment_failed`.                                                                                                                                             |
| `LOB_API_KEY`                  | Lob secret key, prefix `test_` until a sandbox letter is accepted, then `live_`. This is the only Lob secret required to submit a letter.                                                                                                                                                                                                                                            |
| `LOB_WEBHOOK_SECRET`           | Lob webhook signing secret for `lob-tracking-webhook`.                                                                                                                                                                                                                                                                                                                               |
| `APP_URL`                      | Published Continuum OS origin, `https://…`. Used only if the browser origin is not already an allowed Continuum or Lovable host.                                                                                                                                                                                                                                                     |

`LOB_FROM_NAME`, `LOB_FROM_LINE1`, `LOB_FROM_LINE2`, `LOB_FROM_CITY`, `LOB_FROM_STATE`, and `LOB_FROM_ZIP` are not read. Do not put Continuum’s name or address on the envelope. Each letter is mailed from the client.

The client record stores that address on `clients.name`, `mailing_line1`, `mailing_line2`, `mailing_city`, `mailing_state`, and `mailing_zip`. A company address is not the return address. Preparing a quote copies the client address onto `credit_mailings.return_name`, `return_line1`, `return_line2`, `return_city`, `return_state`, and `return_zip`. Lob’s `from` is that copy. Staff see it on the quote before the client pays, and the client sees the same snapshot before paying. If the address is missing or incomplete, the quote is refused, Checkout and a saved-card charge are refused, and Lob is not called.

Quotes prepared before `20261119193000_client_return_address.sql` have no return snapshot. They cannot be paid. Save the client address and prepare the quote again.

## After the keys exist

Apply these in the Lovable SQL editor if they are not already on the database:

- `supabase/migrations/20261008021500_credit_file_customer_copy.sql`
- `supabase/migrations/20261119193000_client_return_address.sql`
- `supabase/migrations/20261120010000_credit_mail_packets_and_sandbox.sql`

The last migration creates the private `credit-mail-packets` bucket (PDF, JPEG, and PNG, 20 MB, internal staff only), stores `credit_mailings.packet_storage_path` and `is_test`, and adds `credit_mail_audit.is_test`. Clients cannot read sandbox rows.

Redeploy these edge functions after the migration. Publish does not redeploy them.

- `credit-prepare-mailing`
- `credit-test-mailing`
- `credit-save-card`
- `credit-charge-mailing`
- `stripe-credit-webhook`
- `lob-tracking-webhook`

The client return address is read by prepare, the sandbox send, save-card, charge, and the Stripe webhook. `lob-tracking-webhook` copies `is_test` onto tracking audit rows. Redeploy it with the others.

## Checks

1. A client login sees only the published status, mailed letters, and documents for the client ids on `client_portal_users`. A second client does not see the first. Drafts and `raw_line` are not columns.
2. A letter shows pages, print and postage, certified mail, electronic return receipt, and a $5 handling fee.
3. Stripe test mode: a succeeded payment is the only path that calls Lob. A declined card leaves the letter unprinted. The audit row `lob_submitted` or `lob_not_submitted` says which. `return_address_incomplete` means Lob was not called because the client address was missing.
4. Do not charge a real customer until the restricted key and the Lob key are live keys and a test letter has a tracking number.
5. The staff quote shows the client return address. An incomplete address cannot be prepared or paid. Lob’s `from` is the snapshot on that mailing.
6. A packet PDF is black and white, US Letter, 1 to 6 pages. Lob uses `address_placement=top_first_page`. The first page must leave the top 2.75 inches blank. `insert_blank_page` is not used, because that extra sheet would be billed. Short HTML letters still go to Lob inline. HTML over 10,000 characters has to be a PDF.

## Sandbox send

`STRIPE_RESTRICTED_KEY` may be `rk_test_…` or, for the sandbox button only, `sk_test_…`. A live secret key (`sk_live_…`) is ignored. `credit-save-card` and `credit-charge-mailing` still accept only a restricted key (`rk_`), and they still refuse an internal staff session. The client confirms a live letter.

`credit-test-mailing` runs only when the Stripe key is `sk_test_` or `rk_test_` and `LOB_API_KEY` is `test_`. If either key is live, it writes `credit_mail_audit.action = sandbox_refused` with `is_test = true` and does not create a payment. It never returns the key.

On the client’s Credit tab, **Send test (sandbox)** prepares the quote, confirms Stripe’s test card `pm_card_visa`, and stops. Lob is called only by `stripe-credit-webhook` after `payment_intent.succeeded`. Point a Stripe test-mode webhook at that function, with events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `payment_intent.succeeded`, and `payment_intent.payment_failed`. The signing secret is `STRIPE_CREDIT_WEBHOOK_SECRET`.

The return address is still the client’s mailing address. The letter has no Continuum letterhead. A sandbox row is hidden from the client’s Letters and This mailing pages. No bookkeeping invoice is created for it. The mail audit shows `is_test`.

Do not put a live key in the project while you are running this button.

Phase 4 stays unpublished while any of those keys are missing. The customer page can still say that card payments are not live yet.

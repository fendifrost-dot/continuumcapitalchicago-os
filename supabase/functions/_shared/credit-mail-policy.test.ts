import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  CUSTOMER_MAILING_COLUMNS,
  DEFAULT_CERTIFIED_CENTS,
  DEFAULT_ELECTRONIC_RECEIPT_CENTS,
  DEFAULT_PAGE_CENTS,
  FORBIDDEN_CUSTOMER_FIELDS,
  HANDLING_FEE_CENTS,
  amountsMatch,
  decideLobTracking,
  decideStripeEvent,
  fileSentence,
  integrationIdentifier,
  isCustomerLetterStatus,
  letterSentence,
  quoteMailing,
} from "./credit-mail-policy.ts";

const here = dirname(fileURLToPath(import.meta.url));

test("quote adds a fixed $5 handling fee on top of Lob's lines", () => {
  const quote = quoteMailing({ pages: 1 });
  assert.equal(quote.postageCents, DEFAULT_PAGE_CENTS);
  assert.equal(quote.certifiedCents, DEFAULT_CERTIFIED_CENTS);
  assert.equal(quote.electronicReceiptCents, DEFAULT_ELECTRONIC_RECEIPT_CENTS);
  assert.equal(quote.handlingFeeCents, HANDLING_FEE_CENTS);
  assert.equal(
    quote.totalCents,
    DEFAULT_PAGE_CENTS + DEFAULT_CERTIFIED_CENTS + DEFAULT_ELECTRONIC_RECEIPT_CENTS + 500,
  );
  assert.equal(quote.totalCents, 1592);
});

test("staff cannot replace the handling fee", () => {
  const quote = quoteMailing({
    pages: 2,
    postageCents: 212,
    certifiedCents: 695,
    electronicReceiptCents: 291,
  });
  assert.equal(quote.handlingFeeCents, 500);
  assert.equal(quote.totalCents, 212 + 695 + 291 + 500);
});

test("customer letter sentences hide unpaid and failed letters", () => {
  assert.equal(isCustomerLetterStatus("awaiting_payment"), false);
  assert.equal(isCustomerLetterStatus("payment_failed"), false);
  assert.equal(isCustomerLetterStatus("cancelled"), false);
  assert.equal(letterSentence({ status: "awaiting_payment" }), "");
  assert.equal(letterSentence({ status: "paid" }), "Paid. We're printing this letter.");
  assert.equal(
    letterSentence({
      status: "in_transit",
      mailedOn: "2026-03-03",
      trackingNumber: "9400111899223856789012",
    }),
    "Mailed March 3, 2026. Tracking 9400111899223856789012.",
  );
  assert.equal(
    letterSentence({
      status: "delivered",
      deliveredOn: "2026-03-06",
      responseDueOn: "2026-04-05",
    }),
    "Delivered March 6, 2026. Response due April 5, 2026.",
  );
});

test("a document request is the only status line", () => {
  assert.equal(
    fileSentence({
      statusSentence: "We mailed Equifax on March 3. They have until April 2.",
      needsFromYou: "a photo ID",
    }),
    "We need a photo ID from you before the next letter.",
  );
});

test("unpaid checkout and a failed card do not submit to Lob", () => {
  const unpaid = decideStripeEvent({
    type: "checkout.session.completed",
    data: {
      object: {
        mode: "payment",
        payment_status: "unpaid",
        metadata: { mailing_id: "letter-1" },
        amount_total: 1592,
      },
    },
  });
  assert.equal(unpaid.action, "ignore");

  const asyncUnpaid = decideStripeEvent({
    type: "checkout.session.async_payment_succeeded",
    data: {
      object: {
        mode: "payment",
        payment_status: "unpaid",
        metadata: { mailing_id: "letter-1" },
      },
    },
  });
  assert.equal(asyncUnpaid.action, "ignore");

  const setup = decideStripeEvent({
    type: "checkout.session.completed",
    data: {
      object: {
        mode: "setup",
        payment_status: "no_payment_required",
        setup_intent: "seti_test",
        metadata: { client_id: "client-1" },
      },
    },
  });
  assert.equal(setup.action, "save_card");

  const failed = decideStripeEvent({
    type: "payment_intent.payment_failed",
    data: { object: { metadata: { mailing_id: "letter-1" } } },
  });
  assert.deepEqual(failed, { action: "mark_failed", mailingId: "letter-1" });
});

test("a paid webhook is the only submit decision", () => {
  const paid = decideStripeEvent({
    type: "checkout.session.completed",
    data: {
      object: {
        mode: "payment",
        payment_status: "paid",
        amount_total: 1592,
        payment_intent: "pi_test",
        metadata: { mailing_id: "letter-1", client_id: "client-1" },
      },
    },
  });
  assert.equal(paid.action, "submit_lob");
  if (paid.action === "submit_lob") {
    assert.equal(paid.mailingId, "letter-1");
    assert.equal(paid.amountCents, 1592);
    assert.equal(amountsMatch(1592, paid.amountCents), true);
    assert.equal(amountsMatch(1592, 500), false);
  }

  const later = decideStripeEvent({
    type: "payment_intent.succeeded",
    data: { object: { id: "pi_test", amount: 1592, metadata: { mailing_id: "letter-1" } } },
  });
  assert.equal(later.action, "submit_lob");

  const asyncPaid = decideStripeEvent({
    type: "checkout.session.async_payment_succeeded",
    data: {
      object: {
        mode: "payment",
        payment_status: "paid",
        amount_total: 1592,
        metadata: { mailing_id: "letter-1" },
      },
    },
  });
  assert.equal(asyncPaid.action, "submit_lob");
});

test("customer columns do not include drafts, raw lines, or payment secrets", () => {
  const joined = CUSTOMER_MAILING_COLUMNS.join(" ");
  for (const field of FORBIDDEN_CUSTOMER_FIELDS) {
    assert.equal(joined.includes(field), false, field);
  }
  assert.equal(CUSTOMER_MAILING_COLUMNS.includes("raw_line" as never), false);
});

test("integration identifier ends in 8 letters", () => {
  const id = integrationIdentifier();
  assert.match(id, /^continuum_certified_mail_[a-z]{8}$/);
});

test("delivery tracking can land without a green card", () => {
  const update = decideLobTracking("letter.delivered", {
    tracking_number: "9400111899223856789012",
    date_delivered: "2026-03-06",
  });
  assert.equal(update.kind, "tracking");
  if (update.kind === "tracking") {
    assert.equal(update.status, "delivered");
    assert.equal(update.proofOnFile, true);
    assert.equal(update.deliveredOn, "2026-03-06");
  }
});

test("the charge function never calls Lob", () => {
  const charge = readFileSync(join(here, "../credit-charge-mailing/index.ts"), "utf8");
  const save = readFileSync(join(here, "../credit-save-card/index.ts"), "utf8");
  const prepare = readFileSync(join(here, "../credit-prepare-mailing/index.ts"), "utf8");
  for (const source of [charge, save, prepare]) {
    assert.equal(source.includes("api.lob.com"), false);
    assert.equal(source.includes("submitCertifiedLetter"), false);
    assert.equal(source.includes("LOB_API_KEY"), false);
  }
  const webhook = readFileSync(join(here, "../stripe-credit-webhook/index.ts"), "utf8");
  assert.equal(webhook.includes("submitCertifiedLetter"), true);
});

test("customer pages do not query the staff ledger or hold a guardian key", () => {
  const root = join(here, "../../../src");
  const files = [
    "routes/_authenticated/file.tsx",
    "routes/_authenticated/letters.tsx",
    "routes/_authenticated/mailing.tsx",
    "components/credit-file-staff.tsx",
  ];
  for (const file of files) {
    const source = readFileSync(join(root, file), "utf8");
    assert.equal(source.includes("raw_line"), false, file);
    assert.equal(source.includes("CREDIT_GUARDIAN_KEY"), false, file);
    assert.equal(source.includes("stripe_payment_method"), false, file);
    assert.equal(source.includes("fairway"), false, file);
  }
});

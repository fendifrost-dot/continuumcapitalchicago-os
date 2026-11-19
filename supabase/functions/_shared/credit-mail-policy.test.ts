import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { PDFDocument } from "pdf-lib";

import { contentTop, readLetterPacket, renderLetterPacket } from "./credit-mail-packet.ts";
import {
  CUSTOMER_MAILING_COLUMNS,
  DEFAULT_CERTIFIED_CENTS,
  DEFAULT_ELECTRONIC_RECEIPT_CENTS,
  DEFAULT_PAGE_CENTS,
  FIRST_PAGE_ADDRESS_BLANK_INCHES,
  FORBIDDEN_CUSTOMER_FIELDS,
  HANDLING_FEE_CENTS,
  LOB_ADDRESS_PLACEMENT,
  LOB_INLINE_HTML_MAX,
  amountsMatch,
  assertStagingPath,
  classifyLobKey,
  classifyStripeKey,
  decideLobTracking,
  decideStripeEvent,
  fileSentence,
  integrationIdentifier,
  isCustomerLetterStatus,
  letterHtmlToPlainText,
  letterSentence,
  lobFileSource,
  planMailBody,
  quoteMailing,
  requireClientReturnAddress,
  returnAddressIssue,
  sandboxRefusal,
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
  const publish = readFileSync(join(here, "publish-mailing.ts"), "utf8");
  const sandbox = readFileSync(join(here, "../credit-test-mailing/index.ts"), "utf8");
  for (const source of [charge, save, prepare, publish, sandbox]) {
    assert.equal(source.includes("api.lob.com"), false);
    assert.equal(source.includes("submitCertifiedLetter"), false);
    assert.equal(source.includes("LOB_API_KEY"), false);
    assert.equal(source.includes("LOB_FROM_"), false);
  }
  assert.equal(charge.includes("Clients confirm their own letters"), true);
  assert.equal(save.includes("Clients save their own card"), true);
  assert.equal(charge.includes("pm_card_visa"), false);
  assert.equal(save.includes("is_test"), false);
  assert.equal(charge.includes("is_test"), false);
  const webhook = readFileSync(join(here, "../stripe-credit-webhook/index.ts"), "utf8");
  assert.equal(webhook.includes("submitCertifiedLetter"), true);
  assert.ok(
    webhook.indexOf("returnAddressIssue({") < webhook.lastIndexOf("submitCertifiedLetter({"),
  );
  assert.ok(webhook.indexOf("sandboxRefusal(") < webhook.indexOf("submitCertifiedLetter({"));
  assert.ok(webhook.indexOf("if (isTest)") < webhook.indexOf("sandboxRefusal("));
  assert.equal(webhook.includes("createSignedUrl"), true);
  assert.equal(webhook.includes("PACKET_SIGNED_URL_SECONDS"), true);
  assert.ok(charge.indexOf("returnAddressIssue({") < charge.indexOf("paymentIntents.create"));
  const paymentCheckout = save.lastIndexOf("checkout.sessions.create");
  assert.ok(save.indexOf("returnAddressIssue({") < paymentCheckout);
});

test("a quote copies the client mailing address and refuses an incomplete one", () => {
  const address = requireClientReturnAddress({
    name: "  Jane Q. Client ",
    mailing_line1: "123 Main Street",
    mailing_line2: " Apt 4 ",
    mailing_city: "Chicago",
    mailing_state: "il",
    mailing_zip: "60601",
  });
  assert.deepEqual(address, {
    name: "Jane Q. Client",
    line1: "123 Main Street",
    line2: "Apt 4",
    city: "Chicago",
    state: "IL",
    zip: "60601",
  });

  assert.equal(
    returnAddressIssue({ name: "Jane Q. Client", line1: "", city: "", state: "", zip: "" }),
    "Client street address is required",
  );
  assert.equal(
    returnAddressIssue({
      name: "Jane Q. Client",
      line1: "123 Main Street",
      city: "Chicago",
      state: "Illinois",
      zip: "60601",
    }),
    "Client state must be two letters",
  );
  assert.throws(
    () => requireClientReturnAddress({ name: "Jane Q. Client" }),
    /Nothing is charged and nothing is printed/,
  );

  const prepare = readFileSync(join(here, "../credit-prepare-mailing/index.ts"), "utf8");
  const publish = readFileSync(join(here, "publish-mailing.ts"), "utf8");
  assert.equal(prepare.includes("isTest: false"), true);
  assert.equal(prepare.includes("body.is_test"), false);
  assert.ok(publish.indexOf("requireClientReturnAddress") < publish.indexOf(".insert("));
  assert.equal(publish.includes("return_name: returnAddress.name"), true);
  assert.equal(publish.includes("is_test: isTest"), true);
  assert.equal(publish.includes("body.return_"), false);
  assert.equal(publish.includes("body.is_test"), false);
});

test("Lob uses the mailing return address and does not read a firm from-address", () => {
  const lob = readFileSync(join(here, "lob.ts"), "utf8");
  assert.equal(lob.includes("LOB_FROM_"), false);
  assert.equal(lob.includes("input.from"), true);
  assert.equal(LOB_ADDRESS_PLACEMENT, "top_first_page");
  assert.match(lob, /address_placement: LOB_ADDRESS_PLACEMENT/);
  assert.equal(lob.includes('address_placement: "insert_blank_page"'), false);
  assert.equal(lob.includes("color: false"), true);
  assert.equal(lob.includes("double_sided: false"), true);
  assert.match(lob, /key\.startsWith\("test_"\) \|\| key\.startsWith\("live_"\)/);
  const webhook = readFileSync(join(here, "../stripe-credit-webhook/index.ts"), "utf8");
  assert.equal(webhook.includes("from: postalAddressFrom"), true);
  assert.equal(webhook.includes("file,"), true);
  assert.equal(webhook.includes("LOB_FROM_"), false);
});

test("customer pages do not query the staff ledger or hold a guardian key", () => {
  const root = join(here, "../../../src");
  const files = [
    "routes/_authenticated/file.tsx",
    "routes/_authenticated/letters.tsx",
    "routes/_authenticated/mailing.tsx",
    "components/credit-file-staff.tsx",
    "components/client-mailing-address.tsx",
  ];
  for (const file of files) {
    const source = readFileSync(join(root, file), "utf8");
    assert.equal(source.includes("raw_line"), false, file);
    assert.equal(source.includes("CREDIT_GUARDIAN_KEY"), false, file);
    assert.equal(source.includes("stripe_payment_method"), false, file);
    assert.equal(source.includes("fairway"), false, file);
  }
  for (const file of [
    "routes/_authenticated/file.tsx",
    "routes/_authenticated/letters.tsx",
    "routes/_authenticated/mailing.tsx",
  ]) {
    const source = readFileSync(join(root, file), "utf8");
    assert.equal(source.includes("packet_storage_path"), false, file);
  }
  const letters = readFileSync(join(root, "routes/_authenticated/letters.tsx"), "utf8");
  const mailing = readFileSync(join(root, "routes/_authenticated/mailing.tsx"), "utf8");
  assert.equal(letters.includes('.eq("is_test", false)'), true);
  assert.equal(mailing.includes('.eq("is_test", false)'), true);
  const staff = readFileSync(join(root, "components/credit-file-staff.tsx"), "utf8");
  assert.equal(staff.includes("Send test (sandbox)"), true);
  assert.equal(staff.includes("credit-test-mailing"), true);
});

const PNG_1PX = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (char) => char.charCodeAt(0),
);

test("sandbox send refuses a live key and does not echo it", () => {
  const stripeSecret = "sk_live_do_not_echo_this_value";
  const lobSecret = "live_do_not_echo_lob";
  const refusal = sandboxRefusal({
    stripe: classifyStripeKey(stripeSecret),
    lob: classifyLobKey("test_ok"),
  });
  assert.equal(refusal, "Sandbox send is refused while a live payment or mail key is in use.");
  assert.equal(refusal?.includes(stripeSecret), false);
  assert.equal(refusal?.includes("do_not_echo"), false);
  const lobLive = sandboxRefusal({
    stripe: classifyStripeKey("rk_test_abc"),
    lob: classifyLobKey(lobSecret),
  });
  assert.equal(lobLive?.includes(lobSecret), false);
  assert.match(lobLive ?? "", /live payment or mail key/);
  assert.equal(
    sandboxRefusal({ stripe: classifyStripeKey(""), lob: classifyLobKey("") }),
    "Sandbox send needs a Stripe test key and a Lob test key.",
  );
  assert.equal(
    sandboxRefusal({
      stripe: classifyStripeKey("sk_test_abc"),
      lob: classifyLobKey("test_abc"),
    }),
    null,
  );
  assert.equal(
    sandboxRefusal({
      stripe: classifyStripeKey("rk_test_abc"),
      lob: classifyLobKey("test_abc"),
    }),
    null,
  );
  assert.equal(classifyStripeKey("rk_live_abc"), "live");
  assert.equal(classifyStripeKey("sk_unknown_shape"), "live");
  assert.equal(classifyLobKey("not_a_prefix"), "live");
  const sandbox = readFileSync(join(here, "../credit-test-mailing/index.ts"), "utf8");
  assert.ok(sandbox.indexOf("sandboxRefusal(") < sandbox.indexOf("paymentIntents.create"));
  assert.equal(sandbox.includes('payment_method: "pm_card_visa"'), true);
  assert.equal(sandbox.includes("isTest: true"), true);
  assert.equal(sandbox.includes("STRIPE_RESTRICTED_KEY"), false);
  assert.equal(sandbox.includes("sk_test_"), false);
  assert.equal(sandbox.includes("sk_live_"), false);
  assert.equal(sandbox.includes("rk_live_"), false);
  assert.equal(sandbox.includes("console.log"), false);
  const keys = readFileSync(join(here, "credit-mail-keys.ts"), "utf8");
  assert.equal(keys.includes("return {"), true);
  assert.equal(keys.includes("console."), false);
});

test("a packet PDF is quoted from its page count and short HTML stays inline", () => {
  assert.deepEqual(
    planMailBody({
      letterHtml: "<p>Hello from the client.</p>",
      hasPacketPdf: false,
      enclosureCount: 0,
    }),
    {
      kind: "inline_html",
    },
  );
  assert.equal(
    planMailBody({ letterHtml: null, hasPacketPdf: true, enclosureCount: 0 }).kind,
    "uploaded_pdf",
  );
  assert.equal(
    planMailBody({
      letterHtml: "<p>Hello from the client.</p>",
      hasPacketPdf: false,
      enclosureCount: 1,
    }).kind,
    "rendered_pdf",
  );
  assert.throws(
    () =>
      planMailBody({
        letterHtml: "x".repeat(LOB_INLINE_HTML_MAX + 1),
        hasPacketPdf: false,
        enclosureCount: 0,
      }),
    /10,000 characters/,
  );
  assert.equal(
    lobFileSource({ packetStoragePath: "client/mailing.pdf", letterHtml: "<p>kept</p>" }),
    "packet_url",
  );
  assert.equal(
    lobFileSource({ packetStoragePath: null, letterHtml: "<p>Hello from the client.</p>" }),
    "inline_html",
  );
  const clientId = "11111111-1111-4111-8111-111111111111";
  assert.equal(
    assertStagingPath(clientId, `${clientId}/staging/id.png`),
    `${clientId}/staging/id.png`,
  );
  assert.throws(() => assertStagingPath(clientId, `${clientId}/../other/id.pdf`), /invalid/);
  assert.equal(quoteMailing({ pages: 3 }).postageCents, DEFAULT_PAGE_CENTS * 3);
});

test("a rendered packet is letter size, has no letterhead, and leaves the first page top blank", async () => {
  assert.equal(contentTop(0), 792 - FIRST_PAGE_ADDRESS_BLANK_INCHES * 72);
  assert.ok(contentTop(1) > contentTop(0));
  const plain = letterHtmlToPlainText(
    "<p>Dispute this account.</p><p>Continuum is not the sender.</p>",
  );
  assert.equal(plain.includes("Dispute this account."), true);
  const bytes = await renderLetterPacket({
    html: "<p>Dispute this account. The consumer wrote this letter.</p>",
    enclosures: [PNG_1PX],
  });
  const info = await readLetterPacket(bytes);
  assert.equal(info.pageCount, 2);
  const decoded = inflatePdfStreams(bytes);
  const visible = pdfShownText(decoded);
  assert.equal(visible.toLowerCase().includes("continuum"), false);
  assert.equal(visible.includes("Dispute this account."), true);
  const positioned = decoded.match(/1 0 0 1 54 ([\d.]+) Tm/);
  assert.ok(positioned);
  const textY = Number(positioned?.[1]);
  assert.ok(textY <= contentTop(0) - 11);
  const reloaded = await PDFDocument.load(bytes);
  const first = reloaded.getPages()[0].getSize();
  assert.equal(first.width, 612);
  assert.equal(first.height, 792);

  const legal = await PDFDocument.create();
  legal.addPage([612, 1008]);
  await assert.rejects(readLetterPacket(await legal.save()), /US Letter/);
});

function pdfShownText(content: string): string {
  const pieces: string[] = [];
  for (const match of content.matchAll(/<([0-9A-Fa-f\s]+)>/g)) {
    const digits = match[1].replace(/\s/g, "");
    if (digits.length % 2 !== 0) continue;
    let text = "";
    for (let i = 0; i < digits.length; i += 2) {
      text += String.fromCharCode(parseInt(digits.slice(i, i + 2), 16));
    }
    pieces.push(text);
  }
  return pieces.join("\n");
}

function inflatePdfStreams(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes);
  const parts = [raw.toString("latin1")];
  const marker = Buffer.from("stream");
  let offset = 0;
  while (offset < raw.length) {
    const start = raw.indexOf(marker, offset);
    if (start < 0) break;
    let dataStart = start + marker.length;
    if (raw[dataStart] === 0x0d && raw[dataStart + 1] === 0x0a) dataStart += 2;
    else if (raw[dataStart] === 0x0a) dataStart += 1;
    const end = raw.indexOf(Buffer.from("endstream"), dataStart);
    if (end < 0) break;
    try {
      parts.push(inflateSync(raw.subarray(dataStart, end)).toString("latin1"));
    } catch {
      // Not a compressed stream.
    }
    offset = end + 9;
  }
  return parts.join("\n");
}

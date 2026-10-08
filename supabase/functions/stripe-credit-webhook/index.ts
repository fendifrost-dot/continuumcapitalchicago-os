import { createServiceClient } from "../_shared/client.ts";
import { jsonResponse, handleCors } from "../_shared/cors.ts";
import {
  addDays,
  amountsMatch,
  decideStripeEvent,
  letterSentence,
} from "../_shared/credit-mail-policy.ts";
import { lobConfigured, submitCertifiedLetter } from "../_shared/lob.ts";
import { createStripeClient, webhookSecret } from "../_shared/stripe-credit.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const stripe = createStripeClient();
  const secret = webhookSecret();
  if (!stripe || !secret) return jsonResponse({ error: "payments_not_configured" }, 503);

  const signature = req.headers.get("stripe-signature");
  const rawBody = await req.text();
  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature ?? "", secret);
  } catch {
    return jsonResponse({ error: "Invalid signature" }, 400);
  }

  const admin = createServiceClient();
  const { data: seen } = await admin
    .from("credit_webhook_events")
    .select("event_id")
    .eq("event_id", event.id)
    .maybeSingle();
  if (seen) return jsonResponse({ ok: true, duplicate: true });

  const decision = decideStripeEvent({
    type: event.type,
    data: { object: event.data.object as unknown as Record<string, unknown> },
  });

  try {
    if (decision.action === "save_card") {
      await saveCard(stripe, admin, decision.clientId, decision.setupIntentId, event.data.object);
    } else if (decision.action === "mark_failed") {
      await markFailed(admin, decision.mailingId);
    } else if (decision.action === "submit_lob") {
      await fulfillPaidLetter(stripe, admin, decision);
    }

    await admin.from("credit_webhook_events").insert({
      event_id: event.id,
      event_type: event.type,
    });
    return jsonResponse({ ok: true });
  } catch (error) {
    console.error(
      "credit webhook failed",
      event.type,
      error instanceof Error ? error.name : "error",
    );
    return jsonResponse({ error: "Webhook failed" }, 500);
  }
});

async function saveCard(
  stripe: NonNullable<ReturnType<typeof createStripeClient>>,
  admin: ReturnType<typeof createServiceClient>,
  clientId: string | null,
  setupIntentId: string | null,
  session: unknown,
) {
  const record = session as {
    customer?: string | { id?: string };
    payment_intent?: string | { id?: string };
    metadata?: { client_id?: string };
  };
  const resolvedClient = clientId ?? record.metadata?.client_id ?? null;
  if (!resolvedClient) return;

  let paymentMethodId: string | null = null;
  let customerId: string | null =
    typeof record.customer === "string" ? record.customer : (record.customer?.id ?? null);

  if (setupIntentId) {
    const setup = await stripe.setupIntents.retrieve(setupIntentId);
    paymentMethodId =
      typeof setup.payment_method === "string"
        ? setup.payment_method
        : (setup.payment_method?.id ?? null);
    customerId =
      typeof setup.customer === "string" ? setup.customer : (setup.customer?.id ?? customerId);
  } else if (record.payment_intent) {
    const piId =
      typeof record.payment_intent === "string" ? record.payment_intent : record.payment_intent.id;
    if (piId) {
      const intent = await stripe.paymentIntents.retrieve(piId);
      paymentMethodId =
        typeof intent.payment_method === "string"
          ? intent.payment_method
          : (intent.payment_method?.id ?? null);
      customerId =
        typeof intent.customer === "string" ? intent.customer : (intent.customer?.id ?? customerId);
    }
  }

  if (!customerId || !paymentMethodId) return;
  const method = await stripe.paymentMethods.retrieve(paymentMethodId);
  await admin.from("credit_billing_vault").upsert({
    client_id: resolvedClient,
    stripe_customer_id: customerId,
    stripe_payment_method_id: paymentMethodId,
  });
  await admin.from("credit_saved_cards").upsert({
    client_id: resolvedClient,
    brand: method.card?.brand ?? null,
    last4: method.card?.last4 ?? null,
    exp_month: method.card?.exp_month ?? null,
    exp_year: method.card?.exp_year ?? null,
  });
  await admin.from("credit_mail_audit").insert({
    client_id: resolvedClient,
    actor_id: null,
    action: "card_saved",
    detail: "A card was saved from Checkout. No letter was printed for a setup.",
  });
}

async function markFailed(admin: ReturnType<typeof createServiceClient>, mailingId: string) {
  const { data: mailing } = await admin
    .from("credit_mailings")
    .select("id, client_id, status")
    .eq("id", mailingId)
    .maybeSingle();
  if (!mailing) return;
  if (
    mailing.status === "in_transit" ||
    mailing.status === "delivered" ||
    mailing.status === "printing"
  )
    return;
  await admin
    .from("credit_mailings")
    .update({ status: "payment_failed", customer_sentence: "" })
    .eq("id", mailingId);
  await admin.from("credit_mail_audit").insert({
    mailing_id: mailingId,
    client_id: mailing.client_id,
    action: "charge_failed",
    detail: "Stripe reported the payment failed. Lob was not called.",
  });
}

async function fulfillPaidLetter(
  stripe: NonNullable<ReturnType<typeof createStripeClient>>,
  admin: ReturnType<typeof createServiceClient>,
  decision: { mailingId: string; paymentIntentId: string | null; amountCents: number | null },
) {
  const { data: mailing } = await admin
    .from("credit_mailings")
    .select(
      "id, client_id, status, total_cents, recipient_name, recipient_line1, recipient_line2, recipient_city, recipient_state, recipient_zip, postage_cents, certified_cents, electronic_receipt_cents, handling_fee_cents",
    )
    .eq("id", decision.mailingId)
    .maybeSingle();
  if (!mailing) return;
  if (
    mailing.status === "cancelled" ||
    mailing.status === "in_transit" ||
    mailing.status === "delivered"
  )
    return;

  const { data: fulfillment } = await admin
    .from("credit_mailing_fulfillment")
    .select("letter_html, lob_letter_id, released_by, invoice_id")
    .eq("mailing_id", mailing.id)
    .maybeSingle();
  if (!fulfillment) return;
  if (fulfillment.lob_letter_id) return;

  if (!amountsMatch(mailing.total_cents, decision.amountCents)) {
    await admin.from("credit_mail_audit").insert({
      mailing_id: mailing.id,
      client_id: mailing.client_id,
      action: "amount_mismatch",
      detail: "The paid amount did not match the quote. The letter was not printed.",
    });
    return;
  }

  if (decision.paymentIntentId) {
    await saveCard(stripe, admin, mailing.client_id, null, {
      payment_intent: decision.paymentIntentId,
      metadata: { client_id: mailing.client_id },
    });
    await admin
      .from("credit_mailing_fulfillment")
      .update({ stripe_payment_intent_id: decision.paymentIntentId })
      .eq("mailing_id", mailing.id);
  }

  const mailedOn = new Date().toISOString().slice(0, 10);
  await admin
    .from("credit_mailings")
    .update({
      status: "paid",
      customer_sentence: letterSentence({ status: "paid" }),
    })
    .eq("id", mailing.id);

  await mirrorInvoice(admin, mailing, fulfillment.invoice_id, fulfillment.released_by);

  await admin.from("credit_mail_audit").insert({
    mailing_id: mailing.id,
    client_id: mailing.client_id,
    actor_id: fulfillment.released_by,
    action: "charge_succeeded",
    detail: "Stripe confirmed the payment. Printing waits on the mail submit inside this webhook.",
  });

  if (!lobConfigured()) {
    await admin.from("credit_mail_audit").insert({
      mailing_id: mailing.id,
      client_id: mailing.client_id,
      actor_id: fulfillment.released_by,
      action: "lob_not_submitted",
      detail: "Payment succeeded. The mail provider key is not configured, so nothing was printed.",
    });
    return;
  }

  const { data: claimed } = await admin
    .from("credit_mailing_fulfillment")
    .update({ lob_submitted_at: new Date().toISOString() })
    .eq("mailing_id", mailing.id)
    .is("lob_letter_id", null)
    .is("lob_submitted_at", null)
    .select("mailing_id")
    .maybeSingle();
  if (!claimed) return;

  try {
    const letter = await submitCertifiedLetter({
      mailingId: mailing.id,
      html: fulfillment.letter_html,
      to: {
        name: mailing.recipient_name,
        line1: mailing.recipient_line1,
        line2: mailing.recipient_line2,
        city: mailing.recipient_city,
        state: mailing.recipient_state,
        zip: mailing.recipient_zip,
      },
    });
    const status = letter.trackingNumber ? "in_transit" : "printing";
    const responseDue = letter.expectedDeliveryDate
      ? addDays(letter.expectedDeliveryDate, 30)
      : addDays(mailedOn, 35);
    await admin
      .from("credit_mailings")
      .update({
        status,
        mailed_on: mailedOn,
        tracking_number: letter.trackingNumber,
        response_due_on: status === "in_transit" ? null : responseDue,
        customer_sentence: letterSentence({
          status,
          mailedOn,
          trackingNumber: letter.trackingNumber,
        }),
      })
      .eq("id", mailing.id);
    await admin
      .from("credit_mailing_fulfillment")
      .update({ lob_letter_id: letter.id, lob_proof_url: letter.url })
      .eq("mailing_id", mailing.id);
    await admin.from("credit_mail_audit").insert({
      mailing_id: mailing.id,
      client_id: mailing.client_id,
      actor_id: fulfillment.released_by,
      action: "lob_submitted",
      detail: letter.trackingNumber
        ? `Certified letter accepted. Tracking ${letter.trackingNumber}.`
        : "Certified letter accepted. Tracking is not back yet.",
    });
  } catch (error) {
    await admin
      .from("credit_mailing_fulfillment")
      .update({ lob_submitted_at: null })
      .eq("mailing_id", mailing.id)
      .is("lob_letter_id", null);
    await admin.from("credit_mail_audit").insert({
      mailing_id: mailing.id,
      client_id: mailing.client_id,
      action: "lob_error",
      detail: "The mail provider did not accept the letter. Stripe will retry this webhook.",
    });
    throw error;
  }
}

async function mirrorInvoice(
  admin: ReturnType<typeof createServiceClient>,
  mailing: {
    id: string;
    client_id: string;
    total_cents: number;
    postage_cents: number;
    certified_cents: number;
    electronic_receipt_cents: number;
    handling_fee_cents: number;
    recipient_name: string;
  },
  existingInvoiceId: string | null,
  actorId: string | null,
) {
  if (existingInvoiceId) return;
  const { data: company } = await admin
    .from("companies")
    .select("id")
    .eq("client_id", mailing.client_id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!company) {
    await admin.from("credit_mail_audit").insert({
      mailing_id: mailing.id,
      client_id: mailing.client_id,
      action: "invoice_skipped",
      detail: "No company on the file, so no bookkeeping invoice was mirrored.",
    });
    return;
  }

  const dollars = (cents: number) => Number((cents / 100).toFixed(2));
  const total = dollars(mailing.total_cents);
  const invoiceNumber = `CM-${mailing.id.replaceAll("-", "").slice(0, 8).toUpperCase()}`;
  const { data: invoice, error } = await admin
    .from("invoices")
    .insert({
      company_id: company.id,
      invoice_number: invoiceNumber,
      status: "paid",
      issue_date: new Date().toISOString().slice(0, 10),
      due_date: new Date().toISOString().slice(0, 10),
      subtotal: total,
      tax: 0,
      total,
      paid_at: new Date().toISOString(),
      notes:
        "Card collected in Stripe for a certified letter. This invoice records the books. It does not collect the money.",
    })
    .select("id")
    .single();
  if (error || !invoice) return;

  const items = [
    ["Print and postage", mailing.postage_cents],
    ["Certified mail", mailing.certified_cents],
    ["Electronic return receipt", mailing.electronic_receipt_cents],
    ["Continuum handling fee", mailing.handling_fee_cents],
  ].filter(([, cents]) => Number(cents) > 0);

  await admin.from("invoice_items").insert(
    items.map(([description, cents]) => ({
      invoice_id: invoice.id,
      description: `${description} — ${mailing.recipient_name}`,
      quantity: 1,
      unit_price: dollars(Number(cents)),
      amount: dollars(Number(cents)),
    })),
  );
  await admin
    .from("credit_mailing_fulfillment")
    .update({ invoice_id: invoice.id })
    .eq("mailing_id", mailing.id);
  await admin.from("activity_logs").insert({
    actor_id: actorId,
    action: "certified_letter_paid",
    entity_type: "credit_mailing",
    entity_id: mailing.id,
    client_id: mailing.client_id,
    company_id: company.id,
    summary: `Certified letter to ${mailing.recipient_name} was paid in Stripe. Invoice ${invoiceNumber} records it.`,
  });
}

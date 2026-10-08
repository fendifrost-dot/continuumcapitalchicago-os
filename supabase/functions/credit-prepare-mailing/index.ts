import { createServiceClient, requireInternal } from "../_shared/client.ts";
import { jsonResponse, handleCors } from "../_shared/cors.ts";
import {
  QuoteError,
  assertUsAddress,
  quoteMailing,
  sanitizeLetterHtml,
} from "../_shared/credit-mail-policy.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const auth = await requireInternal(req);
  if ("error" in auth) return jsonResponse({ error: auth.error }, auth.status);

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return jsonResponse({ error: "Invalid request" }, 400);

  const clientId = String(body.client_id ?? "");
  if (!clientId) return jsonResponse({ error: "client_id is required" }, 400);

  try {
    const state = String(body.recipient_state ?? "")
      .trim()
      .toUpperCase();
    assertUsAddress({
      name: String(body.recipient_name ?? ""),
      line1: String(body.recipient_line1 ?? ""),
      city: String(body.recipient_city ?? ""),
      state,
      zip: String(body.recipient_zip ?? ""),
    });
    const quote = quoteMailing({
      pages: Number(body.page_count),
      postageCents: body.postage_cents === undefined ? undefined : Number(body.postage_cents),
      certifiedCents: body.certified_cents === undefined ? undefined : Number(body.certified_cents),
      electronicReceiptCents:
        body.electronic_receipt_cents === undefined
          ? undefined
          : Number(body.electronic_receipt_cents),
    });
    const letterHtml = sanitizeLetterHtml(String(body.letter_html ?? ""));

    const admin = createServiceClient();
    const { data: client, error: clientError } = await admin
      .from("clients")
      .select("id")
      .eq("id", clientId)
      .maybeSingle();
    if (clientError || !client) return jsonResponse({ error: "Client not found" }, 404);

    const { data: mailing, error: insertError } = await admin
      .from("credit_mailings")
      .insert({
        client_id: clientId,
        recipient_name: String(body.recipient_name).trim(),
        recipient_line1: String(body.recipient_line1).trim(),
        recipient_line2: body.recipient_line2 ? String(body.recipient_line2).trim() : null,
        recipient_city: String(body.recipient_city).trim(),
        recipient_state: state,
        recipient_zip: String(body.recipient_zip).trim(),
        page_count: quote.pageCount,
        postage_cents: quote.postageCents,
        certified_cents: quote.certifiedCents,
        electronic_receipt_cents: quote.electronicReceiptCents,
        handling_fee_cents: quote.handlingFeeCents,
        total_cents: quote.totalCents,
        status: "awaiting_payment",
        customer_sentence: "",
      })
      .select(
        "id, total_cents, postage_cents, certified_cents, electronic_receipt_cents, handling_fee_cents, page_count",
      )
      .single();
    if (insertError || !mailing)
      return jsonResponse({ error: "Could not publish the mailing" }, 500);

    const { error: fulfillError } = await admin.from("credit_mailing_fulfillment").insert({
      mailing_id: mailing.id,
      letter_html: letterHtml,
      released_by: auth.user.id,
    });
    if (fulfillError) return jsonResponse({ error: "Could not store the letter" }, 500);

    await admin.from("credit_mail_audit").insert({
      mailing_id: mailing.id,
      client_id: clientId,
      actor_id: auth.user.id,
      action: "ready_to_mail",
      detail: "Staff published a quote. Nothing is charged and nothing is printed.",
    });

    return jsonResponse({
      ok: true,
      mailing_id: mailing.id,
      page_count: mailing.page_count,
      postage_cents: mailing.postage_cents,
      certified_cents: mailing.certified_cents,
      electronic_receipt_cents: mailing.electronic_receipt_cents,
      handling_fee_cents: mailing.handling_fee_cents,
      total_cents: mailing.total_cents,
    });
  } catch (error) {
    if (error instanceof QuoteError) return jsonResponse({ error: error.message }, 400);
    return jsonResponse({ error: "Could not prepare the mailing" }, 500);
  }
});

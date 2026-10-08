import { createServiceClient } from "../_shared/client.ts";
import { jsonResponse, handleCors } from "../_shared/cors.ts";
import { addDays, decideLobTracking, letterSentence } from "../_shared/credit-mail-policy.ts";
import { verifyLobSignature } from "../_shared/lob.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const rawBody = await req.text();
  const valid = await verifyLobSignature(rawBody, req.headers.get("lob-signature"));
  if (!valid) return jsonResponse({ error: "Invalid signature" }, 400);

  const payload = JSON.parse(rawBody) as {
    id?: string;
    event_type?: { id?: string };
    body?: Record<string, unknown>;
  };
  const eventType = payload.event_type?.id ?? "";
  const body = payload.body ?? {};
  const lobId = typeof body.id === "string" ? body.id : "";
  if (!lobId) return jsonResponse({ ok: true, ignored: true });

  const update = decideLobTracking(eventType, body);
  if (update.kind === "ignore") return jsonResponse({ ok: true, ignored: true });

  const admin = createServiceClient();
  const { data: fulfillment } = await admin
    .from("credit_mailing_fulfillment")
    .select("mailing_id")
    .eq("lob_letter_id", lobId)
    .maybeSingle();
  if (!fulfillment) return jsonResponse({ ok: true, unknown: true });

  const { data: mailing } = await admin
    .from("credit_mailings")
    .select("id, client_id, status, mailed_on, tracking_number, proof_on_file")
    .eq("id", fulfillment.mailing_id)
    .maybeSingle();
  if (!mailing) return jsonResponse({ ok: true });
  if (mailing.status === "delivered" && update.status !== "delivered") {
    return jsonResponse({ ok: true, ignored: true });
  }
  if (mailing.status === "in_transit" && update.status === "printing") {
    return jsonResponse({ ok: true, ignored: true });
  }

  const tracking = update.trackingNumber ?? mailing.tracking_number;
  const deliveredOn = update.deliveredOn;
  const responseDue = deliveredOn ? addDays(deliveredOn, 30) : null;
  await admin
    .from("credit_mailings")
    .update({
      status: update.status,
      tracking_number: tracking,
      delivered_on: deliveredOn,
      response_due_on: responseDue,
      proof_on_file: update.proofOnFile || mailing.proof_on_file,
      customer_sentence: letterSentence({
        status: update.status,
        mailedOn: mailing.mailed_on,
        trackingNumber: tracking,
        deliveredOn,
        responseDueOn: responseDue,
      }),
    })
    .eq("id", mailing.id);

  await admin.from("credit_mail_audit").insert({
    mailing_id: mailing.id,
    client_id: mailing.client_id,
    action: "tracking_updated",
    detail: `Mail status ${update.status}.`,
  });

  return jsonResponse({ ok: true });
});

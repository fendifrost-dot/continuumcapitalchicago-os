import { createServiceClient, requireUser } from "../_shared/client.ts";
import { jsonResponse, handleCors } from "../_shared/cors.ts";
import { returnAddressIssue } from "../_shared/credit-mail-policy.ts";
import { createStripeClient } from "../_shared/stripe-credit.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const auth = await requireUser(req);
  if ("error" in auth) return jsonResponse({ error: auth.error }, auth.status);

  const body = await req.json().catch(() => ({}));
  const mailingId = typeof body.mailing_id === "string" ? body.mailing_id : "";
  if (!mailingId) return jsonResponse({ error: "mailing_id is required" }, 400);

  const { data: roles } = await auth.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", auth.user.id);
  const isInternal = (roles ?? []).some((row) =>
    ["super_admin", "consultant", "assistant", "bookkeeper"].includes(row.role),
  );
  if (isInternal) return jsonResponse({ error: "Clients confirm their own letters" }, 403);

  const { data: mailing, error: mailingError } = await auth.supabase
    .from("credit_mailings")
    .select(
      "id, client_id, status, total_cents, return_name, return_line1, return_line2, return_city, return_state, return_zip",
    )
    .eq("id", mailingId)
    .maybeSingle();
  if (mailingError) return jsonResponse({ error: "Could not read the letter" }, 500);
  if (!mailing) return jsonResponse({ error: "Letter not found" }, 404);
  if (mailing.status !== "awaiting_payment" && mailing.status !== "payment_failed") {
    return jsonResponse({ error: "This letter is not waiting for payment" }, 409);
  }
  const returnIssue = returnAddressIssue({
    name: mailing.return_name,
    line1: mailing.return_line1,
    line2: mailing.return_line2,
    city: mailing.return_city,
    state: mailing.return_state,
    zip: mailing.return_zip,
  });
  if (returnIssue) {
    const admin = createServiceClient();
    await admin.from("credit_mail_audit").insert({
      mailing_id: mailing.id,
      client_id: mailing.client_id,
      actor_id: auth.user.id,
      action: "return_address_incomplete",
      detail: `${returnIssue}. The card was not charged and Lob was not called.`,
    });
    return jsonResponse(
      {
        error: `${returnIssue}. This letter cannot be paid until the client's return address is on the mailing.`,
      },
      409,
    );
  }

  const stripe = createStripeClient();
  if (!stripe) return jsonResponse({ error: "payments_not_configured" }, 503);

  const admin = createServiceClient();
  const { data: vault } = await admin
    .from("credit_billing_vault")
    .select("stripe_customer_id, stripe_payment_method_id")
    .eq("client_id", mailing.client_id)
    .maybeSingle();
  if (!vault?.stripe_customer_id || !vault.stripe_payment_method_id) {
    return jsonResponse({ needs_card: true });
  }

  await admin.from("credit_mail_audit").insert({
    mailing_id: mailing.id,
    client_id: mailing.client_id,
    actor_id: auth.user.id,
    action: "customer_confirmed",
    detail: "Customer confirmed the saved card. Lob is not called from this step.",
  });

  try {
    const intent = await stripe.paymentIntents.create({
      amount: mailing.total_cents,
      currency: "usd",
      customer: vault.stripe_customer_id,
      payment_method: vault.stripe_payment_method_id,
      off_session: true,
      confirm: true,
      metadata: {
        client_id: mailing.client_id,
        mailing_id: mailing.id,
        purpose: "certified_dispute_mailing",
      },
    });

    await admin
      .from("credit_mailing_fulfillment")
      .update({ stripe_payment_intent_id: intent.id, released_by: auth.user.id })
      .eq("mailing_id", mailing.id);

    if (intent.status === "succeeded" || intent.status === "processing") {
      return jsonResponse({ ok: true, state: "processing" });
    }
    return jsonResponse({ needs_card: true });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    const type = typeof error === "object" && error && "type" in error ? String(error.type) : "";
    console.error("certified mailing charge failed", code || type || "card_error");
    if (code === "authentication_required") return jsonResponse({ needs_card: true });
    if (type !== "StripeCardError" && code !== "card_declined") {
      return jsonResponse({ error: "Payment could not start" }, 502);
    }
    await admin
      .from("credit_mailings")
      .update({ status: "payment_failed", customer_sentence: "" })
      .eq("id", mailing.id);
    await admin.from("credit_mail_audit").insert({
      mailing_id: mailing.id,
      client_id: mailing.client_id,
      actor_id: auth.user.id,
      action: "charge_failed",
      detail: "The card was declined. The letter was not printed.",
    });
    return jsonResponse({ ok: false, declined: true });
  }
});

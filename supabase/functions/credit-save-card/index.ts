import { createServiceClient, requireUser } from "../_shared/client.ts";
import { jsonResponse, handleCors } from "../_shared/cors.ts";
import { appOrigin } from "../_shared/credit-origin.ts";
import { integrationIdentifier } from "../_shared/credit-mail-policy.ts";
import { createStripeClient } from "../_shared/stripe-credit.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const auth = await requireUser(req);
  if ("error" in auth) return jsonResponse({ error: auth.error }, auth.status);

  const stripe = createStripeClient();
  if (!stripe) return jsonResponse({ error: "payments_not_configured" }, 503);

  const origin = appOrigin(req);
  if (!origin) return jsonResponse({ error: "payments_not_configured" }, 503);

  const body = await req.json().catch(() => ({}));
  const requestedClientId = typeof body.client_id === "string" ? body.client_id : null;
  const mailingId = typeof body.mailing_id === "string" ? body.mailing_id : null;

  const { data: links, error: linkError } = await auth.supabase
    .from("client_portal_users")
    .select("client_id")
    .eq("user_id", auth.user.id);
  if (linkError) return jsonResponse({ error: "Could not confirm your file" }, 403);
  const clientIds = (links ?? []).map((row) => row.client_id as string);
  const clientId = requestedClientId ?? clientIds[0] ?? null;
  if (!clientId || !clientIds.includes(clientId)) return jsonResponse({ error: "Forbidden" }, 403);

  const { data: roles } = await auth.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", auth.user.id);
  const isInternal = (roles ?? []).some((row) =>
    ["super_admin", "consultant", "assistant", "bookkeeper"].includes(row.role),
  );
  if (isInternal) return jsonResponse({ error: "Clients save their own card" }, 403);

  const admin = createServiceClient();
  const { data: client } = await admin
    .from("clients")
    .select("name, email")
    .eq("id", clientId)
    .maybeSingle();

  const { data: vault } = await admin
    .from("credit_billing_vault")
    .select("stripe_customer_id")
    .eq("client_id", clientId)
    .maybeSingle();

  let customerId = vault?.stripe_customer_id as string | undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: client?.email ?? auth.user.email ?? undefined,
      name: client?.name ?? undefined,
      metadata: { client_id: clientId },
    });
    customerId = customer.id;
    await admin.from("credit_billing_vault").upsert({
      client_id: clientId,
      stripe_customer_id: customerId,
    });
  }

  if (!mailingId) {
    const session = await stripe.checkout.sessions.create({
      mode: "setup",
      currency: "usd",
      customer: customerId,
      client_reference_id: clientId,
      success_url: `${origin}/settings?card=saved`,
      cancel_url: `${origin}/settings?card=cancelled`,
      metadata: { client_id: clientId },
      integration_identifier: integrationIdentifier(),
    });
    return jsonResponse({ url: session.url });
  }

  const { data: mailing } = await auth.supabase
    .from("credit_mailings")
    .select(
      "id, status, postage_cents, certified_cents, electronic_receipt_cents, handling_fee_cents, total_cents, client_id",
    )
    .eq("id", mailingId)
    .maybeSingle();
  if (!mailing || mailing.client_id !== clientId)
    return jsonResponse({ error: "Letter not found" }, 404);
  if (mailing.status !== "awaiting_payment" && mailing.status !== "payment_failed") {
    return jsonResponse({ error: "This letter is not waiting for payment" }, 409);
  }

  const line = (name: string, cents: number) =>
    cents > 0
      ? [
          {
            quantity: 1,
            price_data: {
              currency: "usd" as const,
              unit_amount: cents,
              product_data: { name },
            },
          },
        ]
      : [];

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    client_reference_id: mailing.id,
    success_url: `${origin}/mailing?paid=pending`,
    cancel_url: `${origin}/mailing?paid=cancelled`,
    metadata: { client_id: clientId, mailing_id: mailing.id },
    integration_identifier: integrationIdentifier(),
    payment_intent_data: {
      setup_future_usage: "off_session",
      metadata: {
        client_id: clientId,
        mailing_id: mailing.id,
        purpose: "certified_dispute_mailing",
      },
    },
    line_items: [
      ...line("Print and postage", mailing.postage_cents),
      ...line("Certified mail", mailing.certified_cents),
      ...line("Electronic return receipt", mailing.electronic_receipt_cents),
      ...line("Continuum handling fee", mailing.handling_fee_cents),
    ],
  });

  await admin
    .from("credit_mailing_fulfillment")
    .update({ stripe_checkout_session_id: session.id, released_by: auth.user.id })
    .eq("mailing_id", mailing.id);

  await admin.from("credit_mail_audit").insert({
    mailing_id: mailing.id,
    client_id: clientId,
    actor_id: auth.user.id,
    action: "customer_opened_checkout",
    detail: "Customer opened Checkout. The letter is not printed from this page.",
  });

  return jsonResponse({ url: session.url });
});

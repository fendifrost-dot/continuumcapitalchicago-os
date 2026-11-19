import { createServiceClient, requireInternal } from "../_shared/client.ts";
import { jsonResponse, handleCors } from "../_shared/cors.ts";
import { sandboxKeyModes } from "../_shared/credit-mail-keys.ts";
import { QuoteError, sandboxRefusal } from "../_shared/credit-mail-policy.ts";
import { publishPreparedMailing } from "../_shared/publish-mailing.ts";
import { createSandboxStripeClient } from "../_shared/stripe-credit.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const auth = await requireInternal(req);
  if ("error" in auth) return jsonResponse({ error: auth.error }, auth.status);

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return jsonResponse({ error: "Invalid request" }, 400);
  const clientId = typeof body.client_id === "string" ? body.client_id : "";

  const admin = createServiceClient();
  const refusal = sandboxRefusal(sandboxKeyModes());
  if (refusal) {
    await recordRefusal(admin, clientId, auth.user.id, refusal);
    return jsonResponse({ error: refusal }, 403);
  }

  const stripe = createSandboxStripeClient();
  if (!stripe) {
    const message = "Sandbox send needs a Stripe test key and a Lob test key.";
    await recordRefusal(admin, clientId, auth.user.id, message);
    return jsonResponse({ error: message }, 403);
  }

  try {
    const result = await publishPreparedMailing({
      admin,
      actorId: auth.user.id,
      body: body as Record<string, unknown>,
      isTest: true,
    });
    if (!result.ok) return jsonResponse({ error: result.error }, result.status);

    const mailing = result.mailing;
    await admin.from("credit_mail_audit").insert({
      mailing_id: mailing.id,
      client_id: clientId,
      actor_id: auth.user.id,
      action: "sandbox_payment_started",
      is_test: true,
      detail:
        "Staff started a sandbox payment with Stripe's test card. The client did not confirm. Lob is not called from this step.",
    });

    try {
      const intent = await stripe.paymentIntents.create(
        {
          amount: mailing.total_cents,
          currency: "usd",
          payment_method: "pm_card_visa",
          confirm: true,
          payment_method_types: ["card"],
          metadata: {
            client_id: clientId,
            mailing_id: mailing.id,
            purpose: "certified_dispute_mailing",
            sandbox: "true",
          },
        },
        { idempotencyKey: `sandbox_${mailing.id}` },
      );
      await admin
        .from("credit_mailing_fulfillment")
        .update({ stripe_payment_intent_id: intent.id })
        .eq("mailing_id", mailing.id);

      if (intent.status === "succeeded" || intent.status === "processing") {
        return jsonResponse({
          ok: true,
          sandbox: true,
          mailing_id: mailing.id,
          page_count: mailing.page_count,
          total_cents: mailing.total_cents,
          state: "processing",
        });
      }
      return jsonResponse({ error: "The test card did not succeed." }, 402);
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
      const type = typeof error === "object" && error && "type" in error ? String(error.type) : "";
      console.error("sandbox payment failed", code || type || "card_error");
      await admin
        .from("credit_mailings")
        .update({ status: "payment_failed", customer_sentence: "" })
        .eq("id", mailing.id);
      await admin.from("credit_mail_audit").insert({
        mailing_id: mailing.id,
        client_id: clientId,
        actor_id: auth.user.id,
        action: "sandbox_payment_failed",
        is_test: true,
        detail: "The sandbox card did not succeed. Lob was not called.",
      });
      return jsonResponse({ error: "The sandbox payment could not start." }, 502);
    }
  } catch (error) {
    if (error instanceof QuoteError) return jsonResponse({ error: error.message }, 400);
    return jsonResponse({ error: "Could not prepare the sandbox mailing" }, 500);
  }
});

async function recordRefusal(
  admin: ReturnType<typeof createServiceClient>,
  clientId: string,
  actorId: string,
  detail: string,
) {
  if (!clientId) return;
  await admin.from("credit_mail_audit").insert({
    client_id: clientId,
    actor_id: actorId,
    action: "sandbox_refused",
    is_test: true,
    detail,
  });
}

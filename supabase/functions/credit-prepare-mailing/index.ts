import { createServiceClient, requireInternal } from "../_shared/client.ts";
import { jsonResponse, handleCors } from "../_shared/cors.ts";
import { QuoteError } from "../_shared/credit-mail-policy.ts";
import { publishPreparedMailing } from "../_shared/publish-mailing.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const auth = await requireInternal(req);
  if ("error" in auth) return jsonResponse({ error: auth.error }, auth.status);

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return jsonResponse({ error: "Invalid request" }, 400);

  try {
    const result = await publishPreparedMailing({
      admin: createServiceClient(),
      actorId: auth.user.id,
      body: body as Record<string, unknown>,
      isTest: false,
    });
    if (!result.ok) return jsonResponse({ error: result.error }, result.status);
    return jsonResponse({
      ok: true,
      mailing_id: result.mailing.id,
      page_count: result.mailing.page_count,
      postage_cents: result.mailing.postage_cents,
      certified_cents: result.mailing.certified_cents,
      electronic_receipt_cents: result.mailing.electronic_receipt_cents,
      handling_fee_cents: result.mailing.handling_fee_cents,
      total_cents: result.mailing.total_cents,
    });
  } catch (error) {
    if (error instanceof QuoteError) return jsonResponse({ error: error.message }, 400);
    return jsonResponse({ error: "Could not prepare the mailing" }, 500);
  }
});

import { createServiceClient } from "../_shared/client.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";

// Public (verify_jwt = false): lets an invited user preview their invitation
// from the /auth?invite=<token> link BEFORE they have an account. Returns only
// non-sensitive fields needed to render the accept-invite signup form.
Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const body = await req.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) return jsonResponse({ valid: false, reason: "missing_token" }, 400);

  const admin = createServiceClient();
  const { data: invitation } = await admin
    .from("invitations")
    .select("email, role, client_id, expires_at, accepted_at")
    .eq("token", token)
    .maybeSingle();

  if (!invitation) return jsonResponse({ valid: false, reason: "not_found" });

  const expired = new Date(invitation.expires_at).getTime() <= Date.now();
  const accepted = invitation.accepted_at != null;

  return jsonResponse({
    valid: !expired && !accepted,
    expired,
    accepted,
    email: invitation.email,
    role: invitation.role,
    // Boolean only — never leak the client_id / name to an unauthenticated caller.
    client_scoped: invitation.client_id != null,
  });
});

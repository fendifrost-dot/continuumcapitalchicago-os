import { createServiceClient, createUserClient } from "../_shared/client.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";

// M1 fix: this endpoint writes to activity_logs with the service role, so it
// MUST NOT trust a caller-supplied user_id blindly. Two accepted callers:
//   1. A signed-in user recording their own login/logout — verified via their
//      JWT; the audited user_id is forced to the authenticated uid.
//   2. A trusted server / Supabase Auth Hook presenting the shared secret in
//      the x-audit-secret header (matched against AUTH_AUDIT_SECRET).
// Anything else is rejected, so forged log injection is no longer possible.
Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const supabase = createServiceClient();
  const body = await req.json().catch(() => ({}));

  const eventType = body.type ?? body.event ?? body.action ?? "login";
  const ip = req.headers.get("x-forwarded-for") ?? body.ip ?? null;

  let userId: string | null = null;

  const authHeader = req.headers.get("Authorization");
  const auditSecret = Deno.env.get("AUTH_AUDIT_SECRET");
  const providedSecret = req.headers.get("x-audit-secret");

  if (authHeader) {
    const { data: userData, error } = await createUserClient(authHeader).auth.getUser();
    if (error || !userData.user) return jsonResponse({ error: "Unauthorized" }, 401);
    // Force the audited subject to the authenticated user — ignore any body value.
    userId = userData.user.id;
  } else if (auditSecret && providedSecret && providedSecret === auditSecret) {
    // Trusted server/hook context may name the subject explicitly.
    userId = body.user_id ?? body.record?.id ?? body.metadata?.uuid ?? body.user?.id ?? null;
  } else {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  if (!userId) return jsonResponse({ error: "user_id required" }, 400);

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();

  const actorName = profile?.full_name ?? profile?.email ?? "User";
  const isLogin =
    String(eventType).toLowerCase().includes("login") ||
    String(eventType).toLowerCase() === "signed_in";

  await supabase.from("activity_logs").insert({
    actor_id: userId,
    actor_name: actorName,
    action: isLogin ? "login" : "logout",
    entity_type: "auth",
    entity_id: userId,
    summary: isLogin ? `${actorName} signed in` : `${actorName} signed out`,
    metadata: { event_type: eventType, ip },
  });

  return jsonResponse({ ok: true });
});

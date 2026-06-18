import { createServiceClient } from "../_shared/client.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const supabase = createServiceClient();
  const body = await req.json().catch(() => ({}));

  // Supabase Auth Hook payload or direct client invoke
  const userId = body.user_id ?? body.record?.id ?? body.metadata?.uuid ?? body.user?.id;

  const eventType = body.type ?? body.event ?? body.action ?? "login";
  const ip = req.headers.get("x-forwarded-for") ?? body.ip ?? null;

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

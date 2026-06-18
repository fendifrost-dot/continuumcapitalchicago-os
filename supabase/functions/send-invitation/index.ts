import { createServiceClient, requireAdmin } from "../_shared/client.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const auth = await requireAdmin(req);
  if ("error" in auth) return jsonResponse({ error: auth.error }, auth.status);

  const body = await req.json();
  const { email, role, client_id } = body;
  if (!email || !role) return jsonResponse({ error: "email and role required" }, 400);

  const admin = createServiceClient();

  const { data: invitation, error } = await admin
    .from("invitations")
    .insert({
      email: email.toLowerCase().trim(),
      role,
      client_id: client_id ?? null,
      invited_by: auth.user.id,
    })
    .select("id, token, expires_at")
    .single();

  if (error) return jsonResponse({ error: error.message }, 500);

  const appUrl = Deno.env.get("APP_URL") ?? "";
  const inviteLink = `${appUrl}/auth?invite=${invitation.token}`;

  const { data: profile } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", auth.user.id)
    .maybeSingle();

  await admin.from("activity_logs").insert({
    actor_id: auth.user.id,
    actor_name: profile?.full_name ?? auth.user.email,
    action: "invitation_sent",
    entity_type: "invitation",
    entity_id: invitation.id,
    client_id: client_id ?? null,
    summary: `Invited ${email} as ${role}`,
    metadata: { email, role },
  });

  return jsonResponse({
    ok: true,
    invitation_id: invitation.id,
    invite_link: inviteLink,
  });
});

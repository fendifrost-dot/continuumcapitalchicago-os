import { createServiceClient, createUserClient } from "../_shared/client.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";

const OWNER_EMAILS = ["info@continuumcapitalchicago.com"];
const INTERNAL_DOMAINS = ["continuumcapitalchicago.com"];

function isInternalEmail(email: string) {
  const lower = email.toLowerCase().trim();
  if (OWNER_EMAILS.includes(lower)) return true;
  return INTERNAL_DOMAINS.some((d) => lower.endsWith(`@${d}`));
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401);

  const userClient = createUserClient(authHeader);
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return jsonResponse({ error: "Unauthorized" }, 401);

  const user = userData.user;
  const email = user.email ?? "";
  const admin = createServiceClient();

  const { data: existingRoles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  const roles = (existingRoles ?? []).map((r) => r.role);
  let assignedRole: string | null = null;

  if (isInternalEmail(email)) {
    if (!roles.includes("super_admin")) {
      await admin.from("user_roles").insert({ user_id: user.id, role: "super_admin" });
      assignedRole = "super_admin";
    }
    await admin.from("user_roles").delete().eq("user_id", user.id).eq("role", "client");
  } else {
    const { data: portalLink } = await admin
      .from("client_portal_users")
      .select("client_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (portalLink) {
      if (!roles.includes("client")) {
        await admin.from("user_roles").insert({ user_id: user.id, role: "client" });
        assignedRole = "client";
      }
      await admin
        .from("user_roles")
        .delete()
        .eq("user_id", user.id)
        .in("role", ["consultant", "assistant", "bookkeeper"]);
    } else if (roles.includes("consultant") && !roles.includes("super_admin")) {
      const { data: invitation } = await admin
        .from("invitations")
        .select("id")
        .eq("email", email.toLowerCase())
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (!invitation) {
        await admin.from("user_roles").delete().eq("user_id", user.id).eq("role", "consultant");
      }
    }
  }

  const { data: finalRoles } = await admin.from("user_roles").select("role").eq("user_id", user.id);

  const final = (finalRoles ?? []).map((r) => r.role);
  const isInternal = final.some((r) =>
    ["super_admin", "consultant", "assistant", "bookkeeper"].includes(r),
  );
  const isClient = final.includes("client");

  return jsonResponse({
    ok: true,
    roles: final,
    isInternal,
    isClient,
    assignedRole,
    access: isInternal ? "operations" : isClient ? "client_portal" : "pending",
  });
});

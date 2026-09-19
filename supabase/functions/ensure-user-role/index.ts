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
  // Defense-in-depth (H1): only grant firm-domain super_admin once the user has
  // actually proven ownership of the email. If Supabase "Confirm email" is OFF,
  // email_confirmed_at is still set for password/OAuth signups; this blocks the
  // "register anything@firmdomain and self-promote" path when confirmation is ON.
  const emailConfirmed = Boolean(user.email_confirmed_at ?? user.confirmed_at);
  const admin = createServiceClient();

  const { data: existingRoles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  const roles = (existingRoles ?? []).map((r) => r.role);
  let assignedRole: string | null = null;
  let linkedClient = false;

  if (isInternalEmail(email)) {
    if (emailConfirmed && !roles.includes("super_admin")) {
      await admin.from("user_roles").insert({ user_id: user.id, role: "super_admin" });
      assignedRole = "super_admin";
    }
    if (emailConfirmed) {
      await admin.from("user_roles").delete().eq("user_id", user.id).eq("role", "client");
    }
  } else {
    const { data: portalLink } = await admin
      .from("client_portal_users")
      .select("client_id")
      .eq("user_id", user.id)
      .maybeSingle();

    let hasPortalLink = Boolean(portalLink);

    // Accept a pending invitation: this is the step that was missing end-to-end.
    // An admin-issued invitation for this email links the account to its client
    // (client_portal_users) and/or grants the invited staff role, then is marked
    // accepted so it can't be reused.
    if (!hasPortalLink) {
      const { data: invitation } = await admin
        .from("invitations")
        .select("id, role, client_id")
        .eq("email", email.toLowerCase())
        .is("accepted_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .maybeSingle();

      if (invitation) {
        if (invitation.client_id) {
          await admin
            .from("client_portal_users")
            .upsert(
              { user_id: user.id, client_id: invitation.client_id },
              { onConflict: "user_id,client_id", ignoreDuplicates: true },
            );
          hasPortalLink = true;
          linkedClient = true;
        }
        if (invitation.role && !roles.includes(invitation.role)) {
          await admin.from("user_roles").insert({ user_id: user.id, role: invitation.role });
          assignedRole = invitation.role;
        }
        await admin
          .from("invitations")
          .update({ accepted_at: new Date().toISOString() })
          .eq("id", invitation.id);
      }
    }

    if (hasPortalLink) {
      if (!roles.includes("client") && assignedRole !== "client") {
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
    linkedClient,
    access: isInternal ? "operations" : isClient ? "client_portal" : "pending",
  });
});

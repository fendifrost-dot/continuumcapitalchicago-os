import { supabase } from "@/integrations/supabase/client";

export async function logActivity(opts: {
  action: string;
  summary: string;
  entityType?: string;
  entityId?: string;
  companyId?: string;
  clientId?: string;
  metadata?: Record<string, unknown>;
  actorId?: string;
  actorName?: string;
}) {
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user;
  if (!user) return;

  let actorName = opts.actorName;
  if (!actorName) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    actorName = profile?.full_name ?? user.email ?? "Unknown";
  }

  await supabase.from("activity_logs").insert({
    actor_id: opts.actorId ?? user.id,
    actor_name: actorName,
    action: opts.action,
    summary: opts.summary,
    entity_type: opts.entityType,
    entity_id: opts.entityId,
    company_id: opts.companyId,
    client_id: opts.clientId,
    metadata: opts.metadata as never,
  });
}

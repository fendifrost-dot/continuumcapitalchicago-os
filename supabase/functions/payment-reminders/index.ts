import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const REMINDER_DAYS = [30, 14, 7, 1];

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let notificationsCreated = 0;

  for (const days of REMINDER_DAYS) {
    const target = new Date(today);
    target.setDate(target.getDate() + days);
    const targetStr = target.toISOString().slice(0, 10);

    const { data: loans } = await supabase
      .from("loans")
      .select("id, lender, next_due_date, monthly_payment, company_id, companies(legal_name)")
      .eq("next_due_date", targetStr);

    for (const loan of loans ?? []) {
      const { data: internalUsers } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["super_admin", "consultant", "assistant"]);

      for (const u of internalUsers ?? []) {
        await supabase.from("notifications").insert({
          user_id: u.user_id,
          type: "payment_reminder",
          title: `Payment due in ${days} day${days === 1 ? "" : "s"}`,
          message: `${loan.lender} — ${loan.companies?.legal_name ?? "Company"} — $${loan.monthly_payment ?? 0}`,
          link: `/companies/${loan.company_id}`,
        });
        notificationsCreated++;
      }
    }

    const targetStart = new Date(target);
    targetStart.setHours(0, 0, 0, 0);
    const targetEnd = new Date(target);
    targetEnd.setHours(23, 59, 59, 999);

    const { data: events } = await supabase
      .from("calendar_events")
      .select("id, title, starts_at, company_id, companies(legal_name)")
      .gte("starts_at", targetStart.toISOString())
      .lte("starts_at", targetEnd.toISOString());

    for (const event of events ?? []) {
      const { data: internalUsers } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["super_admin", "consultant", "assistant"]);

      for (const u of internalUsers ?? []) {
        await supabase.from("notifications").insert({
          user_id: u.user_id,
          type: "calendar_reminder",
          title: `Reminder: ${event.title}`,
          message: `Due in ${days} day${days === 1 ? "" : "s"} — ${event.companies?.legal_name ?? ""}`,
          link: event.company_id ? `/companies/${event.company_id}` : "/calendar",
        });
        notificationsCreated++;
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, notificationsCreated }), {
    headers: { "Content-Type": "application/json" },
  });
});

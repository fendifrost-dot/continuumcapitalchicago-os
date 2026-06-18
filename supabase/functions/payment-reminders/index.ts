import { createServiceClient } from "../_shared/client.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";

const REMINDER_DAYS = [30, 14, 7, 1];

async function notifyUser(
  supabase: ReturnType<typeof createServiceClient>,
  opts: {
    userId: string;
    type: string;
    title: string;
    message: string;
    link: string;
  },
) {
  const today = new Date().toISOString().slice(0, 10);
  const { data: existing } = await supabase
    .from("notifications")
    .select("id")
    .eq("user_id", opts.userId)
    .eq("type", opts.type)
    .eq("link", opts.link)
    .eq("title", opts.title)
    .gte("created_at", `${today}T00:00:00`)
    .maybeSingle();

  if (existing) return false;

  const { error } = await supabase.from("notifications").insert({
    user_id: opts.userId,
    type: opts.type,
    title: opts.title,
    message: opts.message,
    link: opts.link,
  });
  return !error;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const supabase = createServiceClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let notificationsCreated = 0;

  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("user_id")
    .in("role", ["super_admin", "consultant", "assistant"]);

  const recipientIds = [...new Set((roleRows ?? []).map((u) => u.user_id))];

  for (const days of REMINDER_DAYS) {
    const target = new Date(today);
    target.setDate(target.getDate() + days);
    const targetStr = target.toISOString().slice(0, 10);

    const { data: loans } = await supabase
      .from("loans")
      .select("id, lender, next_due_date, monthly_payment, company_id, companies(legal_name)")
      .eq("next_due_date", targetStr);

    for (const loan of loans ?? []) {
      const companyName =
        (loan.companies as { legal_name: string } | null)?.legal_name ?? "Company";
      const title = `Payment due in ${days} day${days === 1 ? "" : "s"}`;
      const message = `${loan.lender} — ${companyName} — $${Number(loan.monthly_payment ?? 0).toFixed(2)}`;

      for (const userId of recipientIds) {
        const created = await notifyUser(supabase, {
          userId,
          type: "payment_reminder",
          title,
          message,
          link: `/companies/${loan.company_id}`,
        });
        if (created) notificationsCreated++;
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
      const companyName = (event.companies as { legal_name: string } | null)?.legal_name ?? "";
      const title = `Reminder: ${event.title}`;
      const message = `Due in ${days} day${days === 1 ? "" : "s"}${companyName ? ` — ${companyName}` : ""}`;

      for (const userId of recipientIds) {
        const created = await notifyUser(supabase, {
          userId,
          type: "calendar_reminder",
          title,
          message,
          link: event.company_id ? `/companies/${event.company_id}` : "/calendar",
        });
        if (created) notificationsCreated++;
      }
    }
  }

  for (const days of REMINDER_DAYS) {
    const target = new Date(today);
    target.setDate(target.getDate() + days);
    const targetStr = target.toISOString().slice(0, 10);

    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, invoice_number, total, due_date, company_id, companies(legal_name)")
      .eq("due_date", targetStr)
      .in("status", ["sent", "overdue"]);

    for (const inv of invoices ?? []) {
      const companyName = (inv.companies as { legal_name: string } | null)?.legal_name ?? "Company";
      const title = `Invoice due in ${days} day${days === 1 ? "" : "s"}`;
      const message = `${inv.invoice_number} — ${companyName} — $${Number(inv.total).toFixed(2)}`;

      for (const userId of recipientIds) {
        const created = await notifyUser(supabase, {
          userId,
          type: "invoice_reminder",
          title,
          message,
          link: "/invoices",
        });
        if (created) notificationsCreated++;
      }
    }
  }

  return jsonResponse({ ok: true, notificationsCreated });
});

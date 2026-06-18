import { createServiceClient } from "../_shared/client.ts";
import { sendEmail } from "../_shared/resend.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";

const REMINDER_DAYS = [30, 14, 7, 1];

async function notifyUser(
  supabase: ReturnType<typeof createServiceClient>,
  opts: {
    userId: string;
    email: string | null;
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
  if (error) return false;

  if (opts.email) {
    await sendEmail({
      to: opts.email,
      subject: opts.title,
      html: `<p>${opts.message}</p><p><a href="${Deno.env.get("APP_URL") ?? ""}${opts.link}">View in Continuum OS</a></p>`,
    });
  }

  return true;
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

  const userIds = [...new Set((roleRows ?? []).map((u) => u.user_id))];
  const { data: profileRows } = await supabase
    .from("profiles")
    .select("id, email")
    .in("id", userIds);

  const emailByUser = new Map((profileRows ?? []).map((p) => [p.id, p.email]));
  const recipients = userIds.map((userId) => ({
    userId,
    email: emailByUser.get(userId) ?? null,
  }));

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
      const link = `/companies/${loan.company_id}`;

      for (const r of recipients) {
        const created = await notifyUser(supabase, {
          userId: r.userId,
          email: r.email,
          type: "payment_reminder",
          title,
          message,
          link,
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
      const companyName =
        (event.companies as { legal_name: string } | null)?.legal_name ?? "";
      const title = `Reminder: ${event.title}`;
      const message = `Due in ${days} day${days === 1 ? "" : "s"}${companyName ? ` — ${companyName}` : ""}`;
      const link = event.company_id ? `/companies/${event.company_id}` : "/calendar";

      for (const r of recipients) {
        const created = await notifyUser(supabase, {
          userId: r.userId,
          email: r.email,
          type: "calendar_reminder",
          title,
          message,
          link,
        });
        if (created) notificationsCreated++;
      }
    }
  }

  // Remind about invoices due within reminder windows
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
      const companyName =
        (inv.companies as { legal_name: string } | null)?.legal_name ?? "Company";
      const title = `Invoice due in ${days} day${days === 1 ? "" : "s"}`;
      const message = `${inv.invoice_number} — ${companyName} — $${Number(inv.total).toFixed(2)}`;
      const link = `/invoices`;

      for (const r of recipients) {
        const created = await notifyUser(supabase, {
          userId: r.userId,
          email: r.email,
          type: "invoice_reminder",
          title,
          message,
          link,
        });
        if (created) notificationsCreated++;
      }
    }
  }

  return jsonResponse({ ok: true, notificationsCreated });
});

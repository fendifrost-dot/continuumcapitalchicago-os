import { createServiceClient } from "../_shared/client.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const supabase = createServiceClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: overdue, error } = await supabase
    .from("invoices")
    .update({ status: "overdue" })
    .eq("status", "sent")
    .lt("due_date", today)
    .select("id, invoice_number, company_id, due_date");

  if (error) return jsonResponse({ error: error.message }, 500);

  for (const inv of overdue ?? []) {
    await supabase.from("activity_logs").insert({
      actor_name: "System",
      action: "invoice_overdue",
      entity_type: "invoice",
      entity_id: inv.id,
      company_id: inv.company_id,
      summary: `Invoice ${inv.invoice_number} marked overdue (due ${inv.due_date})`,
      metadata: { due_date: inv.due_date },
    });
  }

  return jsonResponse({ ok: true, marked_overdue: overdue?.length ?? 0 });
});

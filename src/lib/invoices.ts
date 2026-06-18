import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity";
import { invokeEdgeFunction } from "@/lib/edge-functions";

export async function generateInvoiceFromTransactions(companyId: string, transactionIds: string[]) {
  const { data: transactions, error: txError } = await supabase
    .from("transactions")
    .select("id, payee, description, amount, occurred_on")
    .eq("company_id", companyId)
    .in("id", transactionIds)
    .is("invoice_id", null)
    .eq("billable", true);

  if (txError) throw txError;
  if (!transactions?.length) throw new Error("No billable transactions selected");

  const subtotal = transactions.reduce((s, t) => s + Number(t.amount), 0);
  const tax = 0;
  const total = subtotal + tax;

  const { count } = await supabase.from("invoices").select("id", { count: "exact", head: true });
  const invoiceNumber = `INV-${String((count ?? 0) + 1).padStart(5, "0")}`;

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);

  const { data: invoice, error: invError } = await supabase
    .from("invoices")
    .insert({
      company_id: companyId,
      invoice_number: invoiceNumber,
      status: "draft",
      issue_date: new Date().toISOString().slice(0, 10),
      due_date: dueDate.toISOString().slice(0, 10),
      subtotal,
      tax,
      total,
    })
    .select("id, invoice_number")
    .single();

  if (invError) throw invError;

  const items = transactions.map((t) => ({
    invoice_id: invoice.id,
    description: t.description || t.payee || "Service",
    quantity: 1,
    unit_price: Number(t.amount),
    amount: Number(t.amount),
  }));

  const { error: itemsError } = await supabase.from("invoice_items").insert(items);
  if (itemsError) throw itemsError;

  const { error: linkError } = await supabase
    .from("transactions")
    .update({ invoice_id: invoice.id })
    .in("id", transactionIds);
  if (linkError) throw linkError;

  await logActivity({
    action: "invoice_generated",
    summary: `Generated invoice ${invoice.invoice_number} for $${total.toFixed(2)}`,
    entityType: "invoice",
    entityId: invoice.id,
    companyId,
    metadata: {
      invoice_number: invoice.invoice_number,
      total,
      transaction_count: transactions.length,
    },
  });

  // Generate PDF via edge function (non-blocking failure)
  await invokeEdgeFunction("generate-invoice-pdf", { invoice_id: invoice.id });

  return invoice;
}

import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { createServiceClient, requireInternal } from "../_shared/client.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";

function currency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const auth = await requireInternal(req);
  if ("error" in auth) return jsonResponse({ error: auth.error }, auth.status);

  const { invoice_id } = await req.json();
  if (!invoice_id) return jsonResponse({ error: "invoice_id required" }, 400);

  const admin = createServiceClient();

  const { data: invoice, error: invError } = await admin
    .from("invoices")
    .select("*, companies(legal_name, business_email, address_line1, city, state, postal_code)")
    .eq("id", invoice_id)
    .single();

  if (invError || !invoice) return jsonResponse({ error: "Invoice not found" }, 404);

  const { data: items } = await admin
    .from("invoice_items")
    .select("description, quantity, unit_price, amount")
    .eq("invoice_id", invoice_id);

  const company = invoice.companies as {
    legal_name: string;
    business_email: string | null;
    address_line1: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
  } | null;

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let y = 740;

  const draw = (text: string, size = 11, useBold = false) => {
    page.drawText(text, { x: 50, y, size, font: useBold ? bold : font, color: rgb(0.1, 0.1, 0.1) });
    y -= size + 6;
  };

  draw("CONTINUUM CAPITAL GROUP", 16, true);
  draw("INVOICE", 14, true);
  y -= 8;
  draw(`Invoice #: ${invoice.invoice_number}`, 11, true);
  draw(`Issue date: ${invoice.issue_date}`);
  draw(`Due date: ${invoice.due_date ?? "—"}`);
  draw(`Status: ${invoice.status}`);
  y -= 8;
  draw(`Bill to: ${company?.legal_name ?? "—"}`, 11, true);
  if (company?.address_line1) draw(company.address_line1);
  if (company?.city) draw([company.city, company.state, company.postal_code].filter(Boolean).join(", "));
  if (company?.business_email) draw(company.business_email);
  y -= 12;

  draw("Description                    Qty      Amount", 10, true);
  for (const item of items ?? []) {
    const line = `${(item.description ?? "").slice(0, 28).padEnd(28)} ${String(item.quantity).padStart(3)}   ${currency(Number(item.amount))}`;
    draw(line, 10);
  }

  y -= 12;
  draw(`Subtotal: ${currency(Number(invoice.subtotal))}`, 11, true);
  draw(`Tax: ${currency(Number(invoice.tax))}`, 11);
  draw(`Total: ${currency(Number(invoice.total))}`, 13, true);

  const pdfBytes = await pdf.save();
  const path = `${invoice.company_id}/${invoice.invoice_number}.pdf`;

  const { error: uploadError } = await admin.storage
    .from("invoices")
    .upload(path, pdfBytes, { contentType: "application/pdf", upsert: true });

  if (uploadError) return jsonResponse({ error: uploadError.message }, 500);

  const { error: updateError } = await admin
    .from("invoices")
    .update({ pdf_path: path })
    .eq("id", invoice_id);

  if (updateError) return jsonResponse({ error: updateError.message }, 500);

  const { data: profile } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", auth.user.id)
    .maybeSingle();

  await admin.from("activity_logs").insert({
    actor_id: auth.user.id,
    actor_name: profile?.full_name ?? auth.user.email,
    action: "invoice_pdf_generated",
    entity_type: "invoice",
    entity_id: invoice_id,
    company_id: invoice.company_id,
    summary: `Generated PDF for invoice ${invoice.invoice_number}`,
    metadata: { pdf_path: path },
  });

  const { data: signed } = await admin.storage.from("invoices").createSignedUrl(path, 3600);

  return jsonResponse({
    ok: true,
    pdf_path: path,
    signed_url: signed?.signedUrl ?? null,
  });
});

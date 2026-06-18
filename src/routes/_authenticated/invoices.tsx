import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { currency, formatDate } from "@/lib/format";
import { logActivity } from "@/lib/activity";
import { invokeEdgeFunction } from "@/lib/edge-functions";

export const Route = createFileRoute("/_authenticated/invoices")({
  component: InvoicesPage,
});

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "secondary",
  sent: "default",
  paid: "outline",
  overdue: "destructive",
  void: "outline",
};

function InvoicesPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select(
          "id, invoice_number, status, issue_date, due_date, total, pdf_path, company_id, companies(legal_name)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const updateStatus = async (
    id: string,
    status: string,
    invoiceNumber: string,
    companyId: string,
  ) => {
    const { error } = await supabase
      .from("invoices")
      .update({ status: status as "draft" })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await logActivity({
      action: "invoice_status_changed",
      summary: `Invoice ${invoiceNumber} marked as ${status}`,
      entityType: "invoice",
      entityId: id,
      companyId,
      metadata: { status },
    });
    qc.invalidateQueries({ queryKey: ["invoices"] });
    toast.success(`Invoice ${status}`);
  };

  const generatePdf = async (invoiceId: string) => {
    const { data, error } = await invokeEdgeFunction<{ signed_url?: string }>(
      "generate-invoice-pdf",
      { invoice_id: invoiceId },
    );
    if (error) {
      toast.error(error);
      return;
    }
    qc.invalidateQueries({ queryKey: ["invoices"] });
    toast.success("PDF generated");
    if (data?.signed_url) window.open(data.signed_url, "_blank");
  };

  const downloadPdf = async (pdfPath: string) => {
    const { data } = await supabase.storage.from("invoices").createSignedUrl(pdfPath, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    else toast.error("Could not open PDF");
  };

  return (
    <>
      <PageHeader title="Invoices" description="Generate and track invoices" />
      <div className="p-6">
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Invoice #</th>
                <th className="text-left px-4 py-2.5 font-medium">Company</th>
                <th className="text-left px-4 py-2.5 font-medium">Issued</th>
                <th className="text-left px-4 py-2.5 font-medium">Due</th>
                <th className="text-right px-4 py-2.5 font-medium">Total</th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
                <th className="text-right px-4 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : !data?.length ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    No invoices yet. Select billable transactions and click Generate Invoice.
                  </td>
                </tr>
              ) : (
                data.map(
                  (inv: {
                    id: string;
                    invoice_number: string;
                    status: string;
                    issue_date: string;
                    due_date: string | null;
                    total: number;
                    pdf_path: string | null;
                    company_id: string;
                    companies?: { legal_name: string } | null;
                  }) => (
                    <tr key={inv.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-mono text-xs font-medium">
                        {inv.invoice_number}
                      </td>
                      <td className="px-4 py-2.5">
                        <Link
                          to="/companies/$id"
                          params={{ id: inv.company_id }}
                          className="hover:text-accent"
                        >
                          {inv.companies?.legal_name ?? "—"}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {formatDate(inv.issue_date)}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {formatDate(inv.due_date)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium">{currency(inv.total)}</td>
                      <td className="px-4 py-2.5">
                        <Badge
                          variant={statusVariant[inv.status] ?? "secondary"}
                          className="capitalize"
                        >
                          {inv.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right space-x-1">
                        {inv.pdf_path ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => downloadPdf(inv.pdf_path!)}
                          >
                            PDF
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => generatePdf(inv.id)}
                          >
                            Generate PDF
                          </Button>
                        )}
                        {inv.status === "draft" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() =>
                              updateStatus(inv.id, "sent", inv.invoice_number, inv.company_id)
                            }
                          >
                            Mark sent
                          </Button>
                        )}
                        {inv.status === "sent" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() =>
                              updateStatus(inv.id, "paid", inv.invoice_number, inv.company_id)
                            }
                          >
                            Mark paid
                          </Button>
                        )}
                      </td>
                    </tr>
                  ),
                )
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}

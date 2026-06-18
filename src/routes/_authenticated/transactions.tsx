import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, FileText } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { TransactionFormDialog } from "@/components/transaction-form-dialog";
import { supabase } from "@/integrations/supabase/client";
import { currency, formatDate } from "@/lib/format";
import { generateInvoiceFromTransactions } from "@/lib/invoices";
import { useCurrentUser } from "@/lib/use-current-user";
import { canGenerateInvoices } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/transactions")({
  component: TransactionsPage,
});

function TransactionsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();

  const { data, isLoading } = useQuery({
    queryKey: ["transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select(
          "id, occurred_on, payee, category, amount, description, billable, invoice_id, company_id, companies(legal_name)",
        )
        .order("occurred_on", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const billableUninvoiced = (data ?? []).filter(
    (t: { billable: boolean; invoice_id: string | null }) => t.billable && !t.invoice_id,
  );

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleGenerateInvoice = async () => {
    if (selected.size === 0) {
      toast.error("Select billable transactions first");
      return;
    }
    const txs = billableUninvoiced.filter((t: { id: string }) => selected.has(t.id));
    if (!txs.length) {
      toast.error("Selected transactions must be billable and uninvoiced");
      return;
    }
    const companyId = txs[0].company_id;
    if (txs.some((t: { company_id: string }) => t.company_id !== companyId)) {
      toast.error("All selected transactions must belong to the same company");
      return;
    }
    try {
      const invoice = await generateInvoiceFromTransactions(companyId, Array.from(selected));
      toast.success(`Invoice ${invoice.invoice_number} created`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to generate invoice");
    }
  };

  return (
    <>
      <PageHeader
        title="Transactions"
        description="Log billable and non-billable activity"
        actions={
          <div className="flex gap-2">
            {user && canGenerateInvoices(user.roles) && selected.size > 0 && (
              <Button size="sm" variant="outline" onClick={handleGenerateInvoice}>
                <FileText className="h-4 w-4" /> Generate invoice ({selected.size})
              </Button>
            )}
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4" /> New transaction
            </Button>
          </div>
        }
      />
      <div className="p-6">
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="w-10 px-4 py-2.5" />
                <th className="text-left px-4 py-2.5 font-medium">Date</th>
                <th className="text-left px-4 py-2.5 font-medium">Company</th>
                <th className="text-left px-4 py-2.5 font-medium">Payee</th>
                <th className="text-left px-4 py-2.5 font-medium">Category</th>
                <th className="text-right px-4 py-2.5 font-medium">Amount</th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
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
                    No transactions yet
                  </td>
                </tr>
              ) : (
                data.map(
                  (t: {
                    id: string;
                    occurred_on: string;
                    payee: string | null;
                    category: string;
                    amount: number;
                    billable: boolean;
                    invoice_id: string | null;
                    companies?: { legal_name: string } | null;
                  }) => (
                    <tr key={t.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-2.5">
                        {t.billable && !t.invoice_id && (
                          <Checkbox
                            checked={selected.has(t.id)}
                            onCheckedChange={() => toggleSelect(t.id)}
                          />
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {formatDate(t.occurred_on)}
                      </td>
                      <td className="px-4 py-2.5">{t.companies?.legal_name ?? "—"}</td>
                      <td className="px-4 py-2.5 font-medium">{t.payee ?? "—"}</td>
                      <td className="px-4 py-2.5 capitalize text-muted-foreground">
                        {t.category.replace("_", " ")}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium">{currency(t.amount)}</td>
                      <td className="px-4 py-2.5">
                        {t.invoice_id ? (
                          <Badge variant="secondary">Invoiced</Badge>
                        ) : t.billable ? (
                          <Badge>Billable</Badge>
                        ) : (
                          <Badge variant="outline">Recorded</Badge>
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
      <TransactionFormDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CompanySelect } from "@/components/company-select";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity";
import { formatSupabaseError } from "@/lib/supabase-errors";

const categories = [
  "revenue",
  "cogs",
  "operating",
  "payroll",
  "tax",
  "loan_payment",
  "owner_draw",
  "other",
];

export function TransactionFormDialog({
  open,
  onOpenChange,
  defaultCompanyId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultCompanyId?: string;
}) {
  const qc = useQueryClient();
  const [companyId, setCompanyId] = useState(defaultCompanyId ?? "");
  const [occurredOn, setOccurredOn] = useState(new Date().toISOString().slice(0, 10));
  const [payee, setPayee] = useState("");
  const [category, setCategory] = useState("operating");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [billable, setBillable] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!companyId || !amount) {
      toast.error("Company and amount are required");
      return;
    }
    setSaving(true);
    const { data: user } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("transactions")
      .insert({
        company_id: companyId,
        occurred_on: occurredOn,
        payee: payee || null,
        category: category as "operating",
        amount: parseFloat(amount),
        description: description || null,
        billable,
        created_by: user.user?.id,
      })
      .select("id")
      .single();
    if (error) {
      toast.error(formatSupabaseError(error.message));
      setSaving(false);
      return;
    }
    await logActivity({
      action: "transaction_created",
      summary: `Recorded ${billable ? "billable " : ""}transaction: ${payee || description || "—"} ($${amount})`,
      entityType: "transaction",
      entityId: data.id,
      companyId,
      metadata: { amount: parseFloat(amount), billable },
    });
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    toast.success("Transaction recorded");
    setSaving(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New transaction</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {!defaultCompanyId && (
            <div className="space-y-1.5">
              <Label>Company</Label>
              <CompanySelect value={companyId} onChange={setCompanyId} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input
                type="date"
                value={occurredOn}
                onChange={(e) => setOccurredOn(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Payee</Label>
              <Input
                value={payee}
                onChange={(e) => setPayee(e.target.value)}
                placeholder="Stripe, IRS, etc."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">
                      {c.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={billable} onCheckedChange={setBillable} id="billable" />
            <Label htmlFor="billable">Billable to client</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

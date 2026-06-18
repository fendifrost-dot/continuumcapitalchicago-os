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
import { Switch } from "@/components/ui/switch";
import { CompanySelect } from "@/components/company-select";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity";

export function LoanFormDialog({
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
  const [lender, setLender] = useState("");
  const [balance, setBalance] = useState("");
  const [monthlyPayment, setMonthlyPayment] = useState("");
  const [nextDueDate, setNextDueDate] = useState("");
  const [autopay, setAutopay] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!companyId || !lender.trim()) {
      toast.error("Company and lender are required");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("loans")
      .insert({
        company_id: companyId,
        lender: lender.trim(),
        balance: balance ? parseFloat(balance) : 0,
        monthly_payment: monthlyPayment ? parseFloat(monthlyPayment) : null,
        next_due_date: nextDueDate || null,
        autopay,
      })
      .select("id")
      .single();
    if (error) {
      toast.error(error.message);
      setSaving(false);
      return;
    }
    await logActivity({
      action: "loan_created",
      summary: `Added loan account: ${lender}`,
      entityType: "loan",
      entityId: data.id,
      companyId,
    });
    qc.invalidateQueries({ queryKey: ["loans"] });
    toast.success("Loan account added");
    setSaving(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New loan account</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {!defaultCompanyId && (
            <div className="space-y-1.5">
              <Label>Company</Label>
              <CompanySelect value={companyId} onChange={setCompanyId} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Lender / account name</Label>
            <Input value={lender} onChange={(e) => setLender(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Balance</Label>
              <Input
                type="number"
                step="0.01"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Monthly payment</Label>
              <Input
                type="number"
                step="0.01"
                value={monthlyPayment}
                onChange={(e) => setMonthlyPayment(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Next due date</Label>
            <Input
              type="date"
              value={nextDueDate}
              onChange={(e) => setNextDueDate(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={autopay} onCheckedChange={setAutopay} id="autopay" />
            <Label htmlFor="autopay">Autopay enabled</Label>
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

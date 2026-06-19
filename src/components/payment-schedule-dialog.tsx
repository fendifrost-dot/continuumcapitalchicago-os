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
import { FREQUENCY_LABELS, type Frequency } from "@/lib/payments";

const FREQUENCIES = Object.keys(FREQUENCY_LABELS) as Frequency[];

const CATEGORIES = [
  { value: "owner_draw", label: "Owner draw" },
  { value: "payroll", label: "Payroll" },
  { value: "operating", label: "Operating" },
  { value: "loan_payment", label: "Loan payment" },
  { value: "tax", label: "Tax" },
  { value: "other", label: "Other" },
];

export function PaymentScheduleDialog({
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
  const [name, setName] = useState("");
  const [payee, setPayee] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [method, setMethod] = useState("");
  const [category, setCategory] = useState("owner_draw");
  const [nextRunDate, setNextRunDate] = useState("");
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setCompanyId(defaultCompanyId ?? "");
    setName("");
    setPayee("");
    setAmount("");
    setFrequency("monthly");
    setMethod("");
    setCategory("owner_draw");
    setNextRunDate("");
    setMemo("");
  };

  const handleSave = async () => {
    if (!companyId || !name.trim() || !nextRunDate) {
      toast.error("Company, name, and first payment date are required");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("payment_schedules")
      .insert({
        company_id: companyId,
        name: name.trim(),
        payee: payee.trim() || null,
        amount: amount ? parseFloat(amount) : 0,
        frequency,
        method: method.trim() || null,
        category: category as "owner_draw",
        next_run_date: nextRunDate,
        memo: memo.trim() || null,
        active: true,
      })
      .select("id")
      .single();
    if (error) {
      toast.error(formatSupabaseError(error.message));
      setSaving(false);
      return;
    }
    await logActivity({
      action: "payment_schedule_created",
      summary: `Created payment schedule: ${name}`,
      entityType: "payment_schedule",
      entityId: data.id,
      companyId,
      metadata: { amount, frequency, method },
    });
    qc.invalidateQueries({ queryKey: ["payment-schedules"] });
    toast.success("Payment schedule created");
    setSaving(false);
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New payment schedule</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          A fixed, recurring payment that runs on its own cadence — independent of the business's
          income. Recording it writes a clean transaction; you still execute the transfer in
          Melio / Square / Stripe.
        </p>
        <div className="space-y-4 py-2">
          {!defaultCompanyId && (
            <div className="space-y-1.5">
              <Label>Company</Label>
              <CompanySelect value={companyId} onChange={setCompanyId} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Owner draw"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Payee</Label>
              <Input
                value={payee}
                onChange={(e) => setPayee(e.target.value)}
                placeholder="Jamal Harris"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="2000.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Frequency</Label>
              <Select value={frequency} onValueChange={(v) => setFrequency(v as Frequency)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map((f) => (
                    <SelectItem key={f} value={f}>
                      {FREQUENCY_LABELS[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Method</Label>
              <Input
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                placeholder="Melio ACH"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>First payment date</Label>
            <Input
              type="date"
              value={nextRunDate}
              onChange={(e) => setNextRunDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Memo (optional)</Label>
            <Input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="Biweekly owner compensation"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Create schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

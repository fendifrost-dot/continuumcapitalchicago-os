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

const stages = ["researching", "applied", "under_review", "approved", "funded", "denied", "closed"];

export function FundingFormDialog({
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
  const [stage, setStage] = useState("researching");
  const [requestedAmount, setRequestedAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!companyId || !lender.trim()) {
      toast.error("Company and lender are required");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("funding_applications")
      .insert({
        company_id: companyId,
        lender: lender.trim(),
        stage: stage as "researching",
        requested_amount: requestedAmount ? parseFloat(requestedAmount) : null,
        notes: notes || null,
      })
      .select("id")
      .single();
    if (error) {
      toast.error(formatSupabaseError(error.message));
      setSaving(false);
      return;
    }
    await logActivity({
      action: "funding_created",
      summary: `Added funding application: ${lender} (${stage})`,
      entityType: "funding_application",
      entityId: data.id,
      companyId,
    });
    qc.invalidateQueries({ queryKey: ["funding"] });
    toast.success("Funding application added");
    setSaving(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New funding application</DialogTitle>
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
              <Label>Lender</Label>
              <Input value={lender} onChange={(e) => setLender(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Stage</Label>
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">
                      {s.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Requested amount</Label>
            <Input
              type="number"
              step="0.01"
              value={requestedAmount}
              onChange={(e) => setRequestedAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
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

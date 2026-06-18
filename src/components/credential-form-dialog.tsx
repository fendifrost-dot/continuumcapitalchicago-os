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
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity";

const categories = ["banking", "irs", "state", "payroll", "software", "utility", "other"];

export function CredentialFormDialog({
  open,
  onOpenChange,
  companyId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: string;
}) {
  const qc = useQueryClient();
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState("other");
  const [provider, setProvider] = useState("");
  const [vaultReference, setVaultReference] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!label.trim() || !vaultReference.trim()) {
      toast.error("Label and vault reference are required");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("credentials")
      .insert({
        company_id: companyId,
        label: label.trim(),
        category: category as "other",
        provider: provider || null,
        vault_reference: vaultReference.trim(),
      })
      .select("id")
      .single();
    if (error) {
      toast.error(error.message);
      setSaving(false);
      return;
    }
    await logActivity({
      action: "credential_added",
      summary: `Added vault reference: ${label}`,
      entityType: "credential",
      entityId: data.id,
      companyId,
      metadata: { provider, category },
    });
    qc.invalidateQueries({ queryKey: ["credentials", companyId] });
    toast.success("Vault reference added");
    setSaving(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add vault reference</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Store credentials in 1Password or Bitwarden. Only the vault reference is saved here.
        </p>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Label</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Stripe account"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Provider</Label>
              <Input
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                placeholder="1password"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Vault reference</Label>
            <Input
              value={vaultReference}
              onChange={(e) => setVaultReference(e.target.value)}
              placeholder="op://continuum/client123/stripe"
              className="font-mono text-xs"
            />
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

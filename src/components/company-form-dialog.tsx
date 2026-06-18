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
import { formatSupabaseError } from "@/lib/supabase-errors";
import { useClientsList } from "@/components/client-form-dialog";

const entityTypes = ["llc", "c_corp", "s_corp", "sole_prop", "partnership", "nonprofit", "other"];

export function CompanyFormDialog({
  open,
  onOpenChange,
  defaultClientId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultClientId?: string;
}) {
  const qc = useQueryClient();
  const { data: clients } = useClientsList();
  const [clientId, setClientId] = useState(defaultClientId ?? "");
  const [legalName, setLegalName] = useState("");
  const [ein, setEin] = useState("");
  const [entityType, setEntityType] = useState("llc");
  const [industry, setIndustry] = useState("");
  const [businessEmail, setBusinessEmail] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!clientId || !legalName.trim()) {
      toast.error("Client and legal name are required");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("companies")
      .insert({
        client_id: clientId,
        legal_name: legalName.trim(),
        ein: ein || null,
        entity_type: entityType as "llc",
        industry: industry || null,
        business_email: businessEmail || null,
      })
      .select("id")
      .single();
    if (error) {
      toast.error(formatSupabaseError(error.message));
      setSaving(false);
      return;
    }
    await logActivity({
      action: "company_created",
      summary: `Created company ${legalName}`,
      entityType: "company",
      entityId: data.id,
      companyId: data.id,
      clientId,
    });
    qc.invalidateQueries({ queryKey: ["companies"] });
    toast.success("Company created");
    setSaving(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New company</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Client</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger>
                <SelectValue placeholder="Select client" />
              </SelectTrigger>
              <SelectContent>
                {(clients ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Legal name</Label>
            <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>EIN</Label>
              <Input value={ein} onChange={(e) => setEin(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Entity type</Label>
              <Select value={entityType} onValueChange={setEntityType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {entityTypes.map((t) => (
                    <SelectItem key={t} value={t} className="uppercase text-xs">
                      {t.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Industry</Label>
              <Input value={industry} onChange={(e) => setIndustry(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Business email</Label>
              <Input
                type="email"
                value={businessEmail}
                onChange={(e) => setBusinessEmail(e.target.value)}
              />
            </div>
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

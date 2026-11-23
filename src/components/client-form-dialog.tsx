import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity";
import { returnAddressIssue } from "@/lib/credit-mail";
import { payingClientWrite } from "@/lib/paying-client";
import { formatSupabaseError } from "@/lib/supabase-errors";

const ENTITY_TYPES = [
  { value: "llc", label: "LLC" },
  { value: "c_corp", label: "C-Corp" },
  { value: "s_corp", label: "S-Corp" },
  { value: "sole_prop", label: "Sole Proprietor" },
  { value: "partnership", label: "Partnership" },
  { value: "nonprofit", label: "Nonprofit" },
  { value: "other", label: "Other" },
];

export function ClientFormDialog({
  open,
  onOpenChange,
  client,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  client?: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    status: string;
    notes?: string | null;
    mailing_line1?: string | null;
    mailing_line2?: string | null;
    mailing_city?: string | null;
    mailing_state?: string | null;
    mailing_zip?: string | null;
    is_paying_client?: boolean | null;
    paying_note?: string | null;
  };
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(client?.name ?? "");
  const [email, setEmail] = useState(client?.email ?? "");
  const [phone, setPhone] = useState(client?.phone ?? "");
  const [status, setStatus] = useState(client?.status ?? "prospect");
  const [notes, setNotes] = useState(client?.notes ?? "");
  const [isPaying, setIsPaying] = useState(Boolean(client?.is_paying_client));
  const [payingNote, setPayingNote] = useState(client?.paying_note ?? "");
  const [mailLine1, setMailLine1] = useState(client?.mailing_line1 ?? "");
  const [mailLine2, setMailLine2] = useState(client?.mailing_line2 ?? "");
  const [mailCity, setMailCity] = useState(client?.mailing_city ?? "");
  const [mailState, setMailState] = useState(client?.mailing_state ?? "");
  const [mailZip, setMailZip] = useState(client?.mailing_zip ?? "");
  const [saving, setSaving] = useState(false);
  const hydratedFor = useRef<string | null>(null);

  // Optional first company (new clients only)
  const [addCompany, setAddCompany] = useState(false);
  const [coName, setCoName] = useState("");
  const [coEntity, setCoEntity] = useState("llc");
  const [coEin, setCoEin] = useState("");
  const [coIndustry, setCoIndustry] = useState("");

  const reset = () => {
    setName("");
    setEmail("");
    setPhone("");
    setStatus("prospect");
    setNotes("");
    setIsPaying(false);
    setPayingNote("");
    setMailLine1("");
    setMailLine2("");
    setMailCity("");
    setMailState("");
    setMailZip("");
    setAddCompany(false);
    setCoName("");
    setCoEntity("llc");
    setCoEin("");
    setCoIndustry("");
  };

  useEffect(() => {
    const key = open ? (client?.id ?? "new") : null;
    if (!open || !key) {
      hydratedFor.current = null;
      return;
    }
    if (hydratedFor.current === key) return;
    hydratedFor.current = key;
    setName(client?.name ?? "");
    setEmail(client?.email ?? "");
    setPhone(client?.phone ?? "");
    setStatus(client?.status ?? "prospect");
    setNotes(client?.notes ?? "");
    setIsPaying(Boolean(client?.is_paying_client));
    setPayingNote(client?.paying_note ?? "");
    setMailLine1(client?.mailing_line1 ?? "");
    setMailLine2(client?.mailing_line2 ?? "");
    setMailCity(client?.mailing_city ?? "");
    setMailState(client?.mailing_state ?? "");
    setMailZip(client?.mailing_zip ?? "");
    setAddCompany(false);
    setCoName("");
    setCoEntity("llc");
    setCoEin("");
    setCoIndustry("");
  }, [open, client]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!client && addCompany && !coName.trim()) {
      toast.error("Company legal name is required (or turn off “Add a company”)");
      return;
    }
    const mailingPayload = {
      mailing_line1: mailLine1.trim() || null,
      mailing_line2: mailLine2.trim() || null,
      mailing_city: mailCity.trim() || null,
      mailing_state: mailState.trim().toUpperCase() || null,
      mailing_zip: mailZip.trim() || null,
    };
    const storedMailing = {
      mailing_line1: client?.mailing_line1?.trim() || null,
      mailing_line2: client?.mailing_line2?.trim() || null,
      mailing_city: client?.mailing_city?.trim() || null,
      mailing_state: client?.mailing_state?.trim().toUpperCase() || null,
      mailing_zip: client?.mailing_zip?.trim() || null,
    };
    const mailingChanged =
      !client ||
      mailingPayload.mailing_line1 !== storedMailing.mailing_line1 ||
      mailingPayload.mailing_line2 !== storedMailing.mailing_line2 ||
      mailingPayload.mailing_city !== storedMailing.mailing_city ||
      mailingPayload.mailing_state !== storedMailing.mailing_state ||
      mailingPayload.mailing_zip !== storedMailing.mailing_zip;
    const mailingFilled = Object.values(mailingPayload).some((value) => value);
    if (mailingChanged && mailingFilled) {
      const issue = returnAddressIssue({
        name,
        line1: mailLine1,
        line2: mailLine2,
        city: mailCity,
        state: mailState,
        zip: mailZip,
      });
      if (issue) {
        toast.error(`${issue}. Leave the mailing address blank, or complete every line.`);
        return;
      }
    }
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const actorId = auth.user?.id;
    if (!actorId) {
      toast.error("Session expired. Please sign in again.");
      setSaving(false);
      return;
    }
    let paying: ReturnType<typeof payingClientWrite>;
    try {
      paying = payingClientWrite({
        isPaying,
        note: payingNote,
        actorId,
        markedAt: new Date().toISOString(),
        previous: client
          ? {
              is_paying_client: Boolean(client.is_paying_client),
              paying_note: client.paying_note ?? null,
            }
          : null,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the paying client flag");
      setSaving(false);
      return;
    }
    const payload = {
      name: name.trim(),
      email: email || null,
      phone: phone || null,
      status: status as "prospect",
      notes: notes || null,
      ...(paying ?? {}),
      ...(mailingChanged ? mailingPayload : {}),
    };
    const payingSummary = !paying
      ? ""
      : paying.is_paying_client
        ? ". Marked as a paying client."
        : ". Cleared the paying client flag.";

    if (client) {
      const { error } = await supabase.from("clients").update(payload).eq("id", client.id);
      if (error) {
        toast.error(formatSupabaseError(error.message));
        setSaving(false);
        return;
      }
      await logActivity({
        action: "client_updated",
        summary: `Updated client ${name}${payingSummary}`,
        entityType: "client",
        entityId: client.id,
        clientId: client.id,
      });
      toast.success("Client updated");
    } else {
      const { data, error } = await supabase
        .from("clients")
        .insert({ ...payload, created_by: actorId })
        .select("id")
        .single();
      if (error) {
        toast.error(formatSupabaseError(error.message));
        setSaving(false);
        return;
      }
      await logActivity({
        action: "client_created",
        summary: `Created client ${name}${payingSummary}`,
        entityType: "client",
        entityId: data.id,
        clientId: data.id,
      });

      // Optionally create the client's first company in the same flow.
      if (addCompany && coName.trim()) {
        const { data: co, error: coErr } = await supabase
          .from("companies")
          .insert({
            client_id: data.id,
            legal_name: coName.trim(),
            entity_type: coEntity as "llc",
            ein: coEin.trim() || null,
            industry: coIndustry.trim() || null,
          })
          .select("id")
          .single();
        if (coErr) {
          toast.error(`Client created, but company failed: ${formatSupabaseError(coErr.message)}`);
        } else {
          await logActivity({
            action: "company_created",
            summary: `Created company ${coName} for ${name}`,
            entityType: "company",
            entityId: co.id,
            companyId: co.id,
            clientId: data.id,
          });
          qc.invalidateQueries({ queryKey: ["companies"] });
          toast.success(`Client + company created`);
        }
      } else {
        toast.success("Client created");
      }
    }
    qc.invalidateQueries({ queryKey: ["clients"] });
    qc.invalidateQueries({ queryKey: ["client"] });
    qc.invalidateQueries({ queryKey: ["client-return-address"] });
    setSaving(false);
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{client ? "Edit client" : "New client"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Client name"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="rounded-lg border p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="paying-client" className="mb-0">
                  Paying client
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Staff set this at their discretion. It does not check or change a payment.
                </p>
              </div>
              <Switch id="paying-client" checked={isPaying} onCheckedChange={setIsPaying} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="paying-note">Paying note (optional)</Label>
              <Textarea
                id="paying-note"
                value={payingNote}
                onChange={(e) => setPayingNote(e.target.value)}
                rows={2}
                placeholder="Why this client is marked paying"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["prospect", "active", "inactive", "archived"].map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-3 rounded-lg border p-3">
            <div>
              <Label className="mb-0">Mailing address</Label>
              <p className="text-[11px] text-muted-foreground">
                Optional here. Dispute letters are mailed from this address, not from a company
                address. A quote is blocked until it is complete.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Street</Label>
              <Input value={mailLine1} onChange={(e) => setMailLine1(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Line 2</Label>
              <Input value={mailLine2} onChange={(e) => setMailLine2(e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>City</Label>
                <Input value={mailCity} onChange={(e) => setMailCity(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>State</Label>
                <Input value={mailState} onChange={(e) => setMailState(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>ZIP</Label>
                <Input value={mailZip} onChange={(e) => setMailZip(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>

          {!client && (
            <div className="rounded-lg border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="mb-0">Add a company now</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Create this client's first company in the same step
                  </p>
                </div>
                <Switch checked={addCompany} onCheckedChange={setAddCompany} />
              </div>
              {addCompany && (
                <div className="space-y-3 pt-1">
                  <div className="space-y-1.5">
                    <Label>Company legal name</Label>
                    <Input
                      value={coName}
                      onChange={(e) => setCoName(e.target.value)}
                      placeholder="Buzz Genius Inc."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Entity type</Label>
                      <Select value={coEntity} onValueChange={setCoEntity}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ENTITY_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>EIN (optional)</Label>
                      <Input
                        value={coEin}
                        onChange={(e) => setCoEin(e.target.value)}
                        placeholder="99-1234567"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Industry (optional)</Label>
                    <Input
                      value={coIndustry}
                      onChange={(e) => setCoIndustry(e.target.value)}
                      placeholder="Marketing & Advertising"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
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

export function useClientsList() {
  return useQuery({
    queryKey: ["clients-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

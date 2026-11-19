import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity";
import { formatReturnAddress, returnAddressIssue } from "@/lib/credit-mail";

export function clientReturnQueryKey(clientId: string) {
  return ["client-return-address", clientId] as const;
}

export function useClientReturnAddress(clientId: string) {
  return useQuery({
    queryKey: clientReturnQueryKey(clientId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, mailing_line1, mailing_line2, mailing_city, mailing_state, mailing_zip")
        .eq("id", clientId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function ClientMailingAddress({
  clientId,
  onDirtyChange,
}: {
  clientId: string;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const qc = useQueryClient();
  const { data } = useClientReturnAddress(clientId);
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");

  useEffect(() => {
    if (!data || hydrated) return;
    setName(data.name ?? "");
    setLine1(data.mailing_line1 ?? "");
    setLine2(data.mailing_line2 ?? "");
    setCity(data.mailing_city ?? "");
    setState(data.mailing_state ?? "");
    setZip(data.mailing_zip ?? "");
    setHydrated(true);
  }, [data, hydrated]);

  const dirty =
    hydrated &&
    !!data &&
    (name.trim() !== data.name.trim() ||
      line1.trim() !== (data.mailing_line1 ?? "") ||
      line2.trim() !== (data.mailing_line2 ?? "") ||
      city.trim() !== (data.mailing_city ?? "") ||
      state.trim().toUpperCase() !== (data.mailing_state ?? "").trim().toUpperCase() ||
      zip.trim() !== (data.mailing_zip ?? "").trim());

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const save = async () => {
    const next = {
      name: name.trim(),
      mailing_line1: line1.trim() || null,
      mailing_line2: line2.trim() || null,
      mailing_city: city.trim() || null,
      mailing_state: state.trim().toUpperCase() || null,
      mailing_zip: zip.trim() || null,
    };
    const issue = returnAddressIssue({
      name: next.name,
      line1: next.mailing_line1,
      line2: next.mailing_line2,
      city: next.mailing_city,
      state: next.mailing_state,
      zip: next.mailing_zip,
    });
    if (issue) {
      toast.error(`${issue}. The quote stays blocked until this address is complete.`);
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("clients").update(next).eq("id", clientId);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setName(next.name);
    setLine1(next.mailing_line1 ?? "");
    setLine2(next.mailing_line2 ?? "");
    setCity(next.mailing_city ?? "");
    setState(next.mailing_state ?? "");
    setZip(next.mailing_zip ?? "");
    await logActivity({
      action: "client_mailing_address_saved",
      summary: `Saved the mailing address for ${next.name}`,
      entityType: "client",
      entityId: clientId,
      clientId,
    });
    toast.success("Mailing address saved on the client record");
    await qc.invalidateQueries({ queryKey: clientReturnQueryKey(clientId) });
  };

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div>
        <div className="text-sm font-medium">Client mailing address</div>
        <p className="text-xs text-muted-foreground">
          The envelope return address is this client's name and mailing address. A company address
          is not used. Saving writes the client record. A quote copies that address onto the letter.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Name on the envelope" value={name} onChange={setName} />
        <Field label="Street" value={line1} onChange={setLine1} />
        <Field label="Line 2" value={line2} onChange={setLine2} />
        <Field label="City" value={city} onChange={setCity} />
        <Field label="State" value={state} onChange={setState} />
        <Field label="ZIP" value={zip} onChange={setZip} />
      </div>
      <Button size="sm" variant="outline" onClick={save} disabled={saving || !dirty}>
        {saving ? "Saving…" : "Save mailing address"}
      </Button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

export function SavedReturnAddress({
  client,
}: {
  client: {
    name: string;
    mailing_line1: string | null;
    mailing_line2: string | null;
    mailing_city: string | null;
    mailing_state: string | null;
    mailing_zip: string | null;
  } | null;
}) {
  const issue = !client
    ? "The client record is still loading."
    : returnAddressIssue({
        name: client.name,
        line1: client.mailing_line1,
        line2: client.mailing_line2,
        city: client.mailing_city,
        state: client.mailing_state,
        zip: client.mailing_zip,
      });

  return (
    <div className="space-y-1 text-sm">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">
        Return address on this quote
      </div>
      {issue ? (
        <p className="text-destructive">
          {issue}. Add it on the client record before a quote. Nothing is charged and nothing is
          printed.
        </p>
      ) : (
        <p className="whitespace-pre-line">
          {formatReturnAddress({
            name: client?.name,
            line1: client?.mailing_line1,
            line2: client?.mailing_line2,
            city: client?.mailing_city,
            state: client?.mailing_state,
            zip: client?.mailing_zip,
          })}
        </p>
      )}
    </div>
  );
}

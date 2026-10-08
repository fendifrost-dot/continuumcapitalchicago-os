import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { MailingPrice } from "@/components/mailing-price";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/edge-functions";
import { quoteMailing, QuoteError } from "@/lib/credit-mail";
import { useCurrentUser } from "@/lib/use-current-user";

export function CreditFileStaff({ clientId }: { clientId: string }) {
  const { data: user } = useCurrentUser();
  const [sentence, setSentence] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [waitingOn, setWaitingOn] = useState("bureau");
  const [waitingName, setWaitingName] = useState("");
  const [needs, setNeeds] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [pages, setPages] = useState("1");
  const [postage, setPostage] = useState("");
  const [certified, setCertified] = useState("");
  const [receipt, setReceipt] = useState("");
  const [letterHtml, setLetterHtml] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [preparing, setPreparing] = useState(false);

  const { data: publication } = useQuery({
    queryKey: ["staff-credit-file", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_file_publications")
        .select("status_sentence, next_date, waiting_on, waiting_on_name, needs_from_you")
        .eq("client_id", clientId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: audit } = useQuery({
    queryKey: ["staff-credit-audit", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_mail_audit")
        .select("id, action, detail, created_at, actor_id")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!publication) return;
    setSentence((current) => current || publication.status_sentence || "");
    setNextDate((current) => current || publication.next_date || "");
    setWaitingOn(publication.waiting_on || "bureau");
    setWaitingName((current) => current || publication.waiting_on_name || "");
    setNeeds((current) => current || publication.needs_from_you || "");
  }, [publication]);

  const preview = (() => {
    try {
      return quoteMailing({
        pages: Number(pages),
        postageCents: postage === "" ? undefined : Number(postage),
        certifiedCents: certified === "" ? undefined : Number(certified),
        electronicReceiptCents: receipt === "" ? undefined : Number(receipt),
      });
    } catch {
      return null;
    }
  })();

  const publishStatus = async () => {
    const line = (sentence || publication?.status_sentence || "").trim();
    if (!line) {
      toast.error("Write the status line the client will read");
      return;
    }
    setPublishing(true);
    const { error } = await supabase.from("credit_file_publications").upsert(
      {
        client_id: clientId,
        status_sentence: line,
        next_date: (nextDate || publication?.next_date || null) as string | null,
        waiting_on: (waitingOn || publication?.waiting_on || "bureau") as
          "bureau" | "furnisher" | "you",
        waiting_on_name: (waitingName || publication?.waiting_on_name || null) as string | null,
        needs_from_you: (needs || null) as string | null,
        published_by: user?.id ?? null,
        published_at: new Date().toISOString(),
      },
      { onConflict: "client_id" },
    );
    setPublishing(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Published to the client file");
  };

  const readyToMail = async () => {
    setPreparing(true);
    try {
      quoteMailing({
        pages: Number(pages),
        postageCents: postage === "" ? undefined : Number(postage),
        certifiedCents: certified === "" ? undefined : Number(certified),
        electronicReceiptCents: receipt === "" ? undefined : Number(receipt),
      });
    } catch (error) {
      setPreparing(false);
      toast.error(error instanceof QuoteError ? error.message : "Check the quote");
      return;
    }
    const { error } = await invokeEdgeFunction("credit-prepare-mailing", {
      client_id: clientId,
      recipient_name: recipientName,
      recipient_line1: line1,
      recipient_line2: line2 || undefined,
      recipient_city: city,
      recipient_state: state,
      recipient_zip: zip,
      page_count: Number(pages),
      postage_cents: postage === "" ? undefined : Number(postage),
      certified_cents: certified === "" ? undefined : Number(certified),
      electronic_receipt_cents: receipt === "" ? undefined : Number(receipt),
      letter_html: letterHtml,
    });
    setPreparing(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("The client can pay this letter. Nothing has been printed.");
    setLetterHtml("");
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Publish this status to the client</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Status line</Label>
            <Textarea
              value={sentence}
              placeholder={
                publication?.status_sentence ??
                "We mailed Equifax on March 3. They have until April 2."
              }
              onChange={(event) => setSentence(event.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Next date</Label>
              <Input
                type="date"
                value={nextDate}
                onChange={(event) => setNextDate(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Waiting on</Label>
              <Select value={waitingOn} onValueChange={setWaitingOn}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bureau">Bureau</SelectItem>
                  <SelectItem value="furnisher">Furnisher</SelectItem>
                  <SelectItem value="you">The client</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Who, by name</Label>
            <Input
              value={waitingName}
              placeholder={publication?.waiting_on_name ?? "Equifax"}
              onChange={(event) => setWaitingName(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>What we need from them</Label>
            <Input
              value={needs}
              placeholder={publication?.needs_from_you ?? "Leave blank if nothing"}
              onChange={(event) => setNeeds(event.target.value)}
            />
          </div>
          <Button size="sm" onClick={publishStatus} disabled={publishing}>
            {publishing ? "Publishing…" : "Publish this status"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Ready to mail</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Postage lines start at the published Lob rates. Change them if Lob’s quote for this
            letter is different. The $5 handling fee stays. The customer pays before anything
            prints.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Recipient" value={recipientName} onChange={setRecipientName} />
            <Field label="Pages" value={pages} onChange={setPages} />
            <Field label="Street" value={line1} onChange={setLine1} />
            <Field label="Line 2" value={line2} onChange={setLine2} />
            <Field label="City" value={city} onChange={setCity} />
            <Field label="State" value={state} onChange={setState} />
            <Field label="ZIP" value={zip} onChange={setZip} />
            <Field label="Postage cents" value={postage} onChange={setPostage} placeholder="106" />
            <Field
              label="Certified cents"
              value={certified}
              onChange={setCertified}
              placeholder="695"
            />
            <Field label="Receipt cents" value={receipt} onChange={setReceipt} placeholder="291" />
          </div>
          <div className="space-y-1.5">
            <Label>Letter</Label>
            <Textarea
              value={letterHtml}
              onChange={(event) => setLetterHtml(event.target.value)}
              placeholder="The letter the printer will use. The client does not see this text."
              className="min-h-28"
            />
          </div>
          {preview && (
            <MailingPrice
              quote={{
                ...preview,
                page_count: preview.pageCount,
                postage_cents: preview.postageCents,
                certified_cents: preview.certifiedCents,
                electronic_receipt_cents: preview.electronicReceiptCents,
                handling_fee_cents: preview.handlingFeeCents,
                total_cents: preview.totalCents,
              }}
            />
          )}
          <Button size="sm" onClick={readyToMail} disabled={preparing}>
            {preparing ? "Saving…" : "Ready to mail"}
          </Button>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-sm">Mail audit</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {!audit?.length ? (
            <p className="text-muted-foreground">No mail actions yet.</p>
          ) : (
            audit.map((row) => (
              <div key={row.id} className="border-b border-border py-2 last:border-0">
                <div className="font-medium">{row.action.replaceAll("_", " ")}</div>
                <div className="text-muted-foreground">{row.detail}</div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

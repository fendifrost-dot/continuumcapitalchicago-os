import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  ClientMailingAddress,
  SavedReturnAddress,
  useClientReturnAddress,
} from "@/components/client-mailing-address";
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
import {
  FIRST_PAGE_ADDRESS_BLANK_INCHES,
  LOB_INLINE_HTML_MAX,
  MAX_ENCLOSURES,
  PACKET_BUCKET,
  PACKET_MAX_BYTES,
  quoteMailing,
  QuoteError,
  returnAddressIssue,
} from "@/lib/credit-mail";
import { useCurrentUser } from "@/lib/use-current-user";

export function CreditFileStaff({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient();
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
  const [packetFile, setPacketFile] = useState<File | null>(null);
  const [enclosureFiles, setEnclosureFiles] = useState<File[]>([]);
  const [fileKey, setFileKey] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [addressDirty, setAddressDirty] = useState(false);
  const { data: returnClient } = useClientReturnAddress(clientId);

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
        .select("id, action, detail, created_at, actor_id, is_test")
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
          | "bureau"
          | "furnisher"
          | "you",
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

  const addressIssue = !returnClient
    ? "The client record is still loading"
    : returnAddressIssue({
        name: returnClient.name,
        line1: returnClient.mailing_line1,
        line2: returnClient.mailing_line2,
        city: returnClient.mailing_city,
        state: returnClient.mailing_state,
        zip: returnClient.mailing_zip,
      });

  const mailingBody = async () => {
    if (addressDirty) {
      toast.error("Save the mailing address on the client record before preparing the quote.");
      return null;
    }
    if (addressIssue) {
      toast.error(
        `${addressIssue}. Add it on the client record before a quote. Nothing is charged and nothing is printed.`,
      );
      return null;
    }
    if (packetFile && (letterHtml.trim() || enclosureFiles.length > 0)) {
      toast.error(
        "A packet PDF stands alone. Remove the letter text and enclosures, or remove the PDF.",
      );
      return null;
    }
    if (!packetFile && letterHtml.trim().length < 20) {
      toast.error("Add the letter text or upload a packet PDF.");
      return null;
    }
    if (
      !packetFile &&
      enclosureFiles.length === 0 &&
      letterHtml.trim().length > LOB_INLINE_HTML_MAX
    ) {
      toast.error(
        "Inline HTML is limited to 10,000 characters. Upload a packet PDF for a longer letter or for ID and proof of address.",
      );
      return null;
    }
    if (enclosureFiles.length > MAX_ENCLOSURES) {
      toast.error(`A letter can include up to ${MAX_ENCLOSURES} enclosures.`);
      return null;
    }
    const countFromPacket = Boolean(packetFile) || enclosureFiles.length > 0;
    if (!countFromPacket) {
      try {
        quoteMailing({
          pages: Number(pages),
          postageCents: postage === "" ? undefined : Number(postage),
          certifiedCents: certified === "" ? undefined : Number(certified),
          electronicReceiptCents: receipt === "" ? undefined : Number(receipt),
        });
      } catch (error) {
        toast.error(error instanceof QuoteError ? error.message : "Check the quote");
        return null;
      }
    }
    try {
      const packetPath = packetFile ? await stageMailFile(clientId, packetFile) : undefined;
      const enclosurePaths: string[] = [];
      for (const file of enclosureFiles) enclosurePaths.push(await stageMailFile(clientId, file));
      return {
        client_id: clientId,
        recipient_name: recipientName,
        recipient_line1: line1,
        recipient_line2: line2 || undefined,
        recipient_city: city,
        recipient_state: state,
        recipient_zip: zip,
        page_count: countFromPacket ? undefined : Number(pages),
        postage_cents: postage === "" ? undefined : Number(postage),
        certified_cents: certified === "" ? undefined : Number(certified),
        electronic_receipt_cents: receipt === "" ? undefined : Number(receipt),
        letter_html: packetFile ? undefined : letterHtml,
        packet_storage_path: packetPath,
        enclosure_storage_paths: enclosurePaths.length ? enclosurePaths : undefined,
      };
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The file could not be uploaded.");
      return null;
    }
  };

  const readyToMail = async () => {
    setPreparing(true);
    const body = await mailingBody();
    if (!body) {
      setPreparing(false);
      return;
    }
    const { data, error } = await invokeEdgeFunction<{ page_count?: number }>(
      "credit-prepare-mailing",
      body,
    );
    setPreparing(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(
      data?.page_count
        ? `Quoted ${data.page_count} page${data.page_count === 1 ? "" : "s"}. The client can pay this letter. Nothing has been printed.`
        : "The client can pay this letter. Nothing has been printed.",
    );
    setLetterHtml("");
    setPacketFile(null);
    setEnclosureFiles([]);
    setFileKey((current) => current + 1);
    await queryClient.invalidateQueries({ queryKey: ["staff-credit-audit", clientId] });
  };

  const sendSandbox = async () => {
    setTesting(true);
    const body = await mailingBody();
    if (!body) {
      setTesting(false);
      return;
    }
    const { data, error } = await invokeEdgeFunction<{ page_count?: number; sandbox?: boolean }>(
      "credit-test-mailing",
      body,
    );
    setTesting(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(
      data?.sandbox
        ? `Sandbox payment started${data.page_count ? ` for ${data.page_count} pages` : ""}. Lob test mode runs only after Stripe confirms it. Check the mail audit.`
        : "Sandbox payment started. Check the mail audit.",
    );
    setLetterHtml("");
    setPacketFile(null);
    setEnclosureFiles([]);
    setFileKey((current) => current + 1);
    await queryClient.invalidateQueries({ queryKey: ["staff-credit-audit", clientId] });
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
            Postage lines start at the published Lob rates. Change them if Lob's quote for this
            letter is different. The $5 handling fee stays. The customer pays before anything
            prints. The envelope return address is the client, and the letter is not prepared while
            that address is incomplete.
          </p>
          <ClientMailingAddress
            key={clientId}
            clientId={clientId}
            onDirtyChange={setAddressDirty}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Recipient" value={recipientName} onChange={setRecipientName} />
            <Field
              label="Pages"
              value={pages}
              onChange={setPages}
              disabled={Boolean(packetFile) || enclosureFiles.length > 0}
            />
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
              placeholder="The letter the printer will use. The client does not see this text. No Continuum letterhead."
              className="min-h-28"
              disabled={Boolean(packetFile)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Packet PDF</Label>
            <Input
              key={`packet-${fileKey}`}
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => setPacketFile(event.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-muted-foreground">
              One black-and-white US Letter PDF, up to 6 pages. Leave the top{" "}
              {FIRST_PAGE_ADDRESS_BLANK_INCHES} inches of the first page blank so the window can
              show the recipient and the client's return address. Later pages are enclosures such as
              ID and proof of address. Page count and postage come from the PDF.
              {packetFile ? ` Selected ${packetFile.name}.` : ""}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Or letter text plus enclosure files</Label>
            <Input
              key={`enclosures-${fileKey}`}
              type="file"
              accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
              multiple
              disabled={Boolean(packetFile)}
              onChange={(event) => setEnclosureFiles(Array.from(event.target.files ?? []))}
            />
            <p className="text-xs text-muted-foreground">
              Up to {MAX_ENCLOSURES} PDF, JPEG, or PNG files. They are added after the letter text
              on their own pages. The letter is not given a Continuum letterhead.
              {enclosureFiles.length
                ? ` Selected ${enclosureFiles.map((file) => file.name).join(", ")}.`
                : ""}
            </p>
          </div>
          <SavedReturnAddress client={returnClient ?? null} />
          {addressDirty && (
            <p className="text-sm text-destructive">
              Save the mailing address before preparing this quote. Unsaved edits are not copied
              onto the letter.
            </p>
          )}
          {packetFile || enclosureFiles.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Postage uses the PDF page count, at the published per-page rate, once this is saved.
            </p>
          ) : (
            preview && (
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
            )
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={readyToMail}
              disabled={preparing || testing || addressDirty || Boolean(addressIssue)}
            >
              {preparing ? "Saving…" : "Ready to mail"}
            </Button>
          </div>
          <div className="space-y-2 rounded-md border border-dashed border-border p-3">
            <p className="text-sm font-medium">Send test (sandbox)</p>
            <p className="text-xs text-muted-foreground">
              Staff only. This prepares the letter, pays with Stripe's test card, and sends it to
              Lob test mode after Stripe confirms the payment. It is refused when the Stripe key or
              the Lob key is live. The client does not confirm it. The return address stays the
              client's. No live card is charged.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={sendSandbox}
              disabled={preparing || testing || addressDirty || Boolean(addressIssue)}
            >
              {testing ? "Sending test…" : "Send test (sandbox)"}
            </Button>
          </div>
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
                <div className="font-medium">
                  {row.is_test ? "Sandbox. " : ""}
                  {row.action.replaceAll("_", " ")}
                </div>
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
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

async function stageMailFile(clientId: string, file: File): Promise<string> {
  const contentType = contentTypeFor(file);
  if (!contentType) throw new Error("Upload a PDF, JPEG, or PNG.");
  if (file.size > PACKET_MAX_BYTES) throw new Error("Each file must be 20 MB or smaller.");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  const path = `${clientId}/staging/${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from(PACKET_BUCKET).upload(path, file, {
    contentType,
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return path;
}

function contentTypeFor(file: File): string | null {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "application/pdf";
  if (file.type === "image/png" || name.endsWith(".png")) return "image/png";
  if (file.type === "image/jpeg" || name.endsWith(".jpg") || name.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  return null;
}

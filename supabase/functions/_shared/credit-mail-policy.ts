/**
 * Pure rules for the customer credit file and certified-mail rail.
 * No Stripe, Lob, or database calls. The webhook is the only caller that
 * may turn a "submit" decision into a Lob request.
 */

export const HANDLING_FEE_CENTS = 500;

/** Published Lob developer rates after the July 12, 2026 USPS change. */
export const DEFAULT_PAGE_CENTS = 106;
export const DEFAULT_CERTIFIED_CENTS = 695;
export const DEFAULT_ELECTRONIC_RECEIPT_CENTS = 291;

export const MAX_COMPONENT_CENTS = 5_000;
export const MAX_TOTAL_CENTS = 20_000;
export const MAX_PAGES = 6;

/** Lob rejects an inline HTML string longer than this. A URL or PDF is not capped this way. */
export const LOB_INLINE_HTML_MAX = 10_000;

/**
 * Lob prints the recipient and the client's return address in the top window
 * of page 1. `insert_blank_page` would insert an extra sheet and postage for
 * a page that is not in the packet. Packets we render leave the top of page 1
 * blank instead. An uploaded packet PDF must do the same.
 */
export const LOB_ADDRESS_PLACEMENT = "top_first_page" as const;

/** Blank band at the top of page 1, in inches, for the double-window envelope. */
export const FIRST_PAGE_ADDRESS_BLANK_INCHES = 2.75;

export const PACKET_BUCKET = "credit-mail-packets";
export const PACKET_MAX_BYTES = 20 * 1024 * 1024;
export const PACKET_SIGNED_URL_SECONDS = 300;
export const MAX_ENCLOSURES = 5;

export const CUSTOMER_MAILING_COLUMNS = [
  "id",
  "client_id",
  "recipient_name",
  "recipient_line1",
  "recipient_line2",
  "recipient_city",
  "recipient_state",
  "recipient_zip",
  "return_name",
  "return_line1",
  "return_line2",
  "return_city",
  "return_state",
  "return_zip",
  "page_count",
  "postage_cents",
  "certified_cents",
  "electronic_receipt_cents",
  "handling_fee_cents",
  "total_cents",
  "status",
  "customer_sentence",
  "mailed_on",
  "tracking_number",
  "delivered_on",
  "response_due_on",
  "proof_on_file",
  "created_at",
] as const;

/** These never exist on a customer-readable table or response. */
export const FORBIDDEN_CUSTOMER_FIELDS = [
  "raw_line",
  "letter_html",
  "stripe_payment_method_id",
  "stripe_customer_id",
  "stripe_payment_intent_id",
  "lob_letter_id",
  "lob_api_key",
  "packet_storage_path",
  "payment_method",
] as const;

export type MailingStatus =
  | "awaiting_payment"
  | "paid"
  | "printing"
  | "in_transit"
  | "delivered"
  | "payment_failed"
  | "cancelled";

export type WaitingOn = "bureau" | "furnisher" | "you";

export interface QuoteInput {
  pages: number;
  postageCents?: number;
  certifiedCents?: number;
  electronicReceiptCents?: number;
}

export interface MailQuote {
  pageCount: number;
  postageCents: number;
  certifiedCents: number;
  electronicReceiptCents: number;
  handlingFeeCents: number;
  totalCents: number;
}

export class QuoteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuoteError";
  }
}

function money(cents: number, label: string): number {
  if (!Number.isInteger(cents) || cents < 0 || cents > MAX_COMPONENT_CENTS) {
    throw new QuoteError(`${label} is not a valid amount`);
  }
  return cents;
}

export function quoteMailing(input: QuoteInput): MailQuote {
  if (!Number.isInteger(input.pages) || input.pages < 1 || input.pages > MAX_PAGES) {
    throw new QuoteError(`A letter must be 1 to ${MAX_PAGES} pages`);
  }
  const postageCents = money(input.postageCents ?? DEFAULT_PAGE_CENTS * input.pages, "Postage");
  const certifiedCents = money(input.certifiedCents ?? DEFAULT_CERTIFIED_CENTS, "Certified mail");
  const electronicReceiptCents = money(
    input.electronicReceiptCents ?? DEFAULT_ELECTRONIC_RECEIPT_CENTS,
    "Electronic return receipt",
  );
  const handlingFeeCents = HANDLING_FEE_CENTS;
  const totalCents = postageCents + certifiedCents + electronicReceiptCents + handlingFeeCents;
  if (totalCents > MAX_TOTAL_CENTS) throw new QuoteError("This letter quote is above the limit");
  return {
    pageCount: input.pages,
    postageCents,
    certifiedCents,
    electronicReceiptCents,
    handlingFeeCents,
    totalCents,
  };
}

export function formatLongDate(iso: string | null | undefined): string {
  if (!iso) return "a date we will confirm";
  const value = iso.length === 10 ? `${iso}T12:00:00Z` : iso;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "a date we will confirm";
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function letterSentence(input: {
  status: MailingStatus;
  mailedOn?: string | null;
  trackingNumber?: string | null;
  deliveredOn?: string | null;
  responseDueOn?: string | null;
}): string {
  if (input.status === "paid" || input.status === "printing") {
    return "Paid. We're printing this letter.";
  }
  if (input.status === "in_transit") {
    const tracking = input.trackingNumber?.trim();
    const track = tracking ? ` Tracking ${tracking}.` : "";
    return `Mailed ${formatLongDate(input.mailedOn)}.${track}`;
  }
  if (input.status === "delivered") {
    return `Delivered ${formatLongDate(input.deliveredOn)}. Response due ${formatLongDate(input.responseDueOn)}.`;
  }
  return "";
}

/** The one line on Your file. A document request replaces the mailed sentence. */
export function fileSentence(input: {
  statusSentence: string;
  needsFromYou?: string | null;
}): string {
  const need = input.needsFromYou?.trim();
  if (need) return `We need ${need} from you before the next letter.`;
  return input.statusSentence.trim();
}

export function isCustomerLetterStatus(status: MailingStatus): boolean {
  return (
    status === "paid" || status === "printing" || status === "in_transit" || status === "delivered"
  );
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate.slice(0, 10)}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function integrationIdentifier(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let suffix = "";
  for (const byte of bytes) suffix += alphabet[byte % 26];
  return `continuum_certified_mail_${suffix}`;
}

export function sanitizeLetterHtml(html: string): string {
  const stripped = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").trim();
  if (stripped.length < 20 || stripped.length > 100_000) {
    throw new QuoteError("The letter must be between 20 and 100,000 characters");
  }
  if (/<html[\s>]/i.test(stripped)) return stripped;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${stripped}</body></html>`;
}

/** Plain text for a rendered packet. No firm name is added. */
export function letterHtmlToPlainText(html: string): string {
  const named = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|tr|li|blockquote)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, digits: string) => String.fromCodePoint(Number(digits)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)));
  return named
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/[^\n\x20-\x7E\xA0-\xFF]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type MailBodyPlan =
  | { kind: "inline_html" }
  | { kind: "uploaded_pdf" }
  | { kind: "rendered_pdf" };

/**
 * Short HTML still goes to Lob inline. A packet PDF, or a letter plus
 * enclosure files, is stored and sent as a PDF URL. HTML over Lob's inline
 * cap is refused so a long letter is not silently flattened.
 */
export function planMailBody(input: {
  letterHtml: string | null;
  hasPacketPdf: boolean;
  enclosureCount: number;
}): MailBodyPlan {
  if (input.enclosureCount > MAX_ENCLOSURES) {
    throw new QuoteError(`A letter can include up to ${MAX_ENCLOSURES} enclosures.`);
  }
  if (input.hasPacketPdf && (input.enclosureCount > 0 || input.letterHtml)) {
    throw new QuoteError(
      "A packet PDF already includes the letter and any enclosures. Remove the letter text and enclosure files, or remove the PDF.",
    );
  }
  if (input.hasPacketPdf) return { kind: "uploaded_pdf" };
  if (input.enclosureCount > 0) {
    if (!input.letterHtml) throw new QuoteError("Add the letter text before attaching enclosures.");
    return { kind: "rendered_pdf" };
  }
  if (!input.letterHtml) throw new QuoteError("Add the letter text or upload a packet PDF.");
  if (input.letterHtml.length > LOB_INLINE_HTML_MAX) {
    throw new QuoteError(
      "Inline HTML is limited to 10,000 characters. Upload a packet PDF for a longer letter or for ID and proof of address.",
    );
  }
  return { kind: "inline_html" };
}

export function assertStagingPath(clientId: string, path: string): string {
  const trimmed = path.trim();
  if (
    !trimmed ||
    trimmed.includes("..") ||
    trimmed.includes("\\") ||
    trimmed.startsWith("/") ||
    trimmed.includes("//")
  ) {
    throw new QuoteError("The uploaded file path is invalid.");
  }
  const prefix = `${clientId}/staging/`;
  if (!trimmed.startsWith(prefix)) {
    throw new QuoteError("The uploaded file is not in this client's folder.");
  }
  if (!/\.(pdf|png|jpe?g)$/i.test(trimmed)) {
    throw new QuoteError("Upload a PDF, JPEG, or PNG.");
  }
  return trimmed;
}

export function finalPacketPath(clientId: string, mailingId: string): string {
  return `${clientId}/${mailingId}.pdf`;
}

export function lobFileSource(input: {
  packetStoragePath?: string | null;
  letterHtml?: string | null;
}): "packet_url" | "inline_html" {
  if (input.packetStoragePath && input.packetStoragePath.trim()) return "packet_url";
  const html = input.letterHtml ?? "";
  if (html.length >= 20 && html.length <= LOB_INLINE_HTML_MAX) return "inline_html";
  throw new QuoteError("This letter has no file that can be printed.");
}

export type RailMode = "test" | "live" | "absent";

/**
 * Prefix only. Callers must not log or return the key they passed in.
 * An unrecognized secret is treated as live so the sandbox path refuses it.
 */
export function classifyStripeKey(key: string): RailMode {
  const value = key.trim();
  if (value.startsWith("sk_test_") || value.startsWith("rk_test_")) return "test";
  if (value.startsWith("sk_") || value.startsWith("rk_")) return "live";
  return "absent";
}

export function classifyLobKey(key: string): RailMode {
  const value = key.trim();
  if (value.startsWith("test_")) return "test";
  if (value.startsWith("live_")) return "live";
  if (value.length > 0) return "live";
  return "absent";
}

/** Null when both keys are test keys. The message never includes a key. */
export function sandboxRefusal(input: { stripe: RailMode; lob: RailMode }): string | null {
  if (input.stripe === "live" || input.lob === "live") {
    return "Sandbox send is refused while a live payment or mail key is in use.";
  }
  if (input.stripe !== "test" || input.lob !== "test") {
    return "Sandbox send needs a Stripe test key and a Lob test key.";
  }
  return null;
}

export function assertUsAddress(
  input: {
    name: string;
    line1: string;
    city: string;
    state: string;
    zip: string;
  },
  role: "recipient" | "client" = "recipient",
): void {
  if (role === "client") {
    if (input.name.trim().length < 2) throw new QuoteError("Client name is required");
    if (input.line1.trim().length < 4) throw new QuoteError("Client street address is required");
    if (input.city.trim().length < 2) throw new QuoteError("Client city is required");
    if (!/^[A-Z]{2}$/.test(input.state.trim().toUpperCase())) {
      throw new QuoteError("Client state must be two letters");
    }
    if (!/^\d{5}(-\d{4})?$/.test(input.zip.trim())) {
      throw new QuoteError("Client ZIP code is invalid");
    }
    return;
  }
  if (input.name.trim().length < 2) throw new QuoteError("Recipient name is required");
  if (input.line1.trim().length < 4) throw new QuoteError("Street address is required");
  if (input.city.trim().length < 2) throw new QuoteError("City is required");
  if (!/^[A-Z]{2}$/.test(input.state.trim().toUpperCase())) {
    throw new QuoteError("State must be two letters");
  }
  if (!/^\d{5}(-\d{4})?$/.test(input.zip.trim())) throw new QuoteError("ZIP code is invalid");
}

/** Envelope return address. Line 2 may be empty. */
export interface PostalAddress {
  name: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  zip: string;
}

export function postalAddressFrom(input: {
  name?: string | null;
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): PostalAddress {
  return {
    name: (input.name ?? "").trim(),
    line1: (input.line1 ?? "").trim(),
    line2: input.line2?.trim() ? input.line2.trim() : null,
    city: (input.city ?? "").trim(),
    state: (input.state ?? "").trim().toUpperCase(),
    zip: (input.zip ?? "").trim(),
  };
}

/** Null when the address can be printed on an envelope. */
export function returnAddressIssue(input: {
  name?: string | null;
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): string | null {
  const address = postalAddressFrom(input);
  try {
    assertUsAddress(address, "client");
    return null;
  } catch (error) {
    if (error instanceof QuoteError) return error.message;
    return "Client mailing address is incomplete";
  }
}

/**
 * The address copied onto a mailing at quote time. Staff cannot send a
 * different return address in the prepare request.
 */
export function requireClientReturnAddress(client: {
  name?: string | null;
  mailing_line1?: string | null;
  mailing_line2?: string | null;
  mailing_city?: string | null;
  mailing_state?: string | null;
  mailing_zip?: string | null;
}): PostalAddress {
  const address = postalAddressFrom({
    name: client.name,
    line1: client.mailing_line1,
    line2: client.mailing_line2,
    city: client.mailing_city,
    state: client.mailing_state,
    zip: client.mailing_zip,
  });
  const issue = returnAddressIssue(address);
  if (issue) {
    throw new QuoteError(
      `${issue}. Add it on the client record before preparing a quote. Nothing is charged and nothing is printed.`,
    );
  }
  return address;
}

export function formatReturnAddress(input: {
  name?: string | null;
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): string {
  const address = postalAddressFrom(input);
  const lines = [address.name, address.line1];
  if (address.line2) lines.push(address.line2);
  lines.push(`${address.city}, ${address.state} ${address.zip}`);
  return lines.join("\n");
}

export interface StripeEventLike {
  type: string;
  data: { object: Record<string, unknown> };
}

export type FulfillmentDecision =
  | { action: "save_card"; clientId: string | null; setupIntentId: string | null }
  | {
      action: "submit_lob";
      mailingId: string;
      paymentIntentId: string | null;
      amountCents: number | null;
    }
  | { action: "mark_failed"; mailingId: string }
  | { action: "ignore"; reason: string };

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function paymentIntentId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) {
    return asString((value as { id: unknown }).id);
  }
  return null;
}

function metadataOf(object: Record<string, unknown>): Record<string, string> {
  const metadata = object.metadata;
  if (!metadata || typeof metadata !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

/**
 * Lob runs only for a paid letter. Setup-mode checkout saves a card and
 * does not print. Unpaid or failed payments do not print.
 */
export function decideStripeEvent(event: StripeEventLike): FulfillmentDecision {
  const object = event.data?.object ?? {};
  const metadata = metadataOf(object);
  const mailingId = asString(metadata.mailing_id) ?? asString(object.client_reference_id);
  const clientId = asString(metadata.client_id);

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    if (object.mode === "setup") {
      return {
        action: "save_card",
        clientId,
        setupIntentId: asString(object.setup_intent) ?? paymentIntentId(object.setup_intent),
      };
    }
    if (object.payment_status !== "paid") {
      return { action: "ignore", reason: "payment_not_paid" };
    }
    if (!mailingId) return { action: "ignore", reason: "paid_without_letter" };
    const amount = typeof object.amount_total === "number" ? object.amount_total : null;
    return {
      action: "submit_lob",
      mailingId,
      paymentIntentId: paymentIntentId(object.payment_intent),
      amountCents: amount,
    };
  }

  if (event.type === "payment_intent.succeeded") {
    if (!mailingId) return { action: "ignore", reason: "no_mailing" };
    const amount = typeof object.amount === "number" ? object.amount : null;
    return {
      action: "submit_lob",
      mailingId,
      paymentIntentId: asString(object.id),
      amountCents: amount,
    };
  }

  if (event.type === "payment_intent.payment_failed") {
    if (!mailingId) return { action: "ignore", reason: "no_mailing" };
    return { action: "mark_failed", mailingId };
  }

  return { action: "ignore", reason: "unhandled_event" };
}

export function amountsMatch(expectedCents: number, chargedCents: number | null): boolean {
  return chargedCents !== null && chargedCents === expectedCents;
}

export type LobTrackingUpdate =
  | {
      kind: "tracking";
      status: "in_transit" | "delivered" | "printing";
      trackingNumber: string | null;
      deliveredOn: string | null;
      proofOnFile: boolean;
    }
  | { kind: "ignore" };

export function decideLobTracking(
  eventType: string,
  body: Record<string, unknown>,
): LobTrackingUpdate {
  const trackingNumber = asString(body.tracking_number);
  const delivered =
    eventType === "letter.delivered" ||
    eventType === "letter.certified.delivered" ||
    eventType === "letter.return_receipt.created";
  if (delivered) {
    const rawDate = asString(body.date_delivered) ?? asString(body.expected_delivery_date);
    return {
      kind: "tracking",
      status: "delivered",
      trackingNumber,
      deliveredOn: rawDate ? rawDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
      proofOnFile: true,
    };
  }
  if (
    eventType === "letter.in_transit" ||
    eventType === "letter.in_local_area" ||
    eventType === "letter.processed_for_delivery" ||
    eventType === "letter.certified.mailed" ||
    eventType === "letter.rendered_pdf"
  ) {
    return {
      kind: "tracking",
      status: eventType === "letter.rendered_pdf" ? "printing" : "in_transit",
      trackingNumber,
      deliveredOn: null,
      proofOnFile: false,
    };
  }
  return { kind: "ignore" };
}

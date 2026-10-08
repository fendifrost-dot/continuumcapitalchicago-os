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

export const CUSTOMER_MAILING_COLUMNS = [
  "id",
  "client_id",
  "recipient_name",
  "recipient_line1",
  "recipient_line2",
  "recipient_city",
  "recipient_state",
  "recipient_zip",
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

export function assertUsAddress(input: {
  name: string;
  line1: string;
  city: string;
  state: string;
  zip: string;
}): void {
  if (input.name.trim().length < 2) throw new QuoteError("Recipient name is required");
  if (input.line1.trim().length < 4) throw new QuoteError("Street address is required");
  if (input.city.trim().length < 2) throw new QuoteError("City is required");
  if (!/^[A-Z]{2}$/.test(input.state.trim().toUpperCase())) {
    throw new QuoteError("State must be two letters");
  }
  if (!/^\d{5}(-\d{4})?$/.test(input.zip.trim())) throw new QuoteError("ZIP code is invalid");
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

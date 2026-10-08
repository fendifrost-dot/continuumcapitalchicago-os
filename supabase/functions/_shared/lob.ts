/**
 * Lob submit. Import this only from the Stripe webhook (and the tracking
 * webhook). A charge handler must not call it.
 */

export interface LobAddress {
  name: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  zip: string;
}

export interface LobLetterResult {
  id: string;
  trackingNumber: string | null;
  expectedDeliveryDate: string | null;
  url: string | null;
}

function fromAddress(): LobAddress | null {
  const name = Deno.env.get("LOB_FROM_NAME") ?? "";
  const line1 = Deno.env.get("LOB_FROM_LINE1") ?? "";
  const city = Deno.env.get("LOB_FROM_CITY") ?? "";
  const state = Deno.env.get("LOB_FROM_STATE") ?? "";
  const zip = Deno.env.get("LOB_FROM_ZIP") ?? "";
  if (!name || !line1 || !city || !state || !zip) return null;
  return {
    name,
    line1,
    line2: Deno.env.get("LOB_FROM_LINE2") || null,
    city,
    state,
    zip,
  };
}

export function lobConfigured(): boolean {
  const key = Deno.env.get("LOB_API_KEY") ?? "";
  return (key.startsWith("test_") || key.startsWith("live_")) && fromAddress() !== null;
}

export async function submitCertifiedLetter(input: {
  mailingId: string;
  to: LobAddress;
  html: string;
}): Promise<LobLetterResult> {
  const key = Deno.env.get("LOB_API_KEY") ?? "";
  const from = fromAddress();
  if (!key || !from) throw new Error("Lob is not configured");

  const body = {
    description: `Certified dispute letter ${input.mailingId}`,
    to: {
      name: input.to.name,
      address_line1: input.to.line1,
      address_line2: input.to.line2 || undefined,
      address_city: input.to.city,
      address_state: input.to.state,
      address_zip: input.to.zip,
      address_country: "US",
    },
    from: {
      name: from.name,
      address_line1: from.line1,
      address_line2: from.line2 || undefined,
      address_city: from.city,
      address_state: from.state,
      address_zip: from.zip,
      address_country: "US",
    },
    file: input.html,
    color: false,
    use_type: "operational",
    extra_service: "certified_return_receipt",
    mail_type: "usps_first_class",
  };

  const response = await fetch("https://api.lob.com/v1/letters", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${key}:`)}`,
      "Content-Type": "application/json",
      "Idempotency-Key": input.mailingId,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof payload?.error?.message === "string"
        ? payload.error.message
        : "Lob rejected the letter";
    throw new Error(message);
  }

  return {
    id: String(payload.id ?? ""),
    trackingNumber: typeof payload.tracking_number === "string" ? payload.tracking_number : null,
    expectedDeliveryDate:
      typeof payload.expected_delivery_date === "string" ? payload.expected_delivery_date : null,
    url: typeof payload.url === "string" ? payload.url : null,
  };
}

export async function verifyLobSignature(rawBody: string, header: string | null): Promise<boolean> {
  const secret = Deno.env.get("LOB_WEBHOOK_SECRET") ?? "";
  if (!secret || !header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key, value];
    }),
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${rawBody}`),
  );
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++)
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return mismatch === 0;
}

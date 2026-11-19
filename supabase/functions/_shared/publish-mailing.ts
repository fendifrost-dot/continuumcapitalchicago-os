import { createServiceClient } from "./client.ts";
import { readLetterPacket, renderLetterPacket } from "./credit-mail-packet.ts";
import {
  MAX_ENCLOSURES,
  PACKET_BUCKET,
  PACKET_MAX_BYTES,
  QuoteError,
  assertStagingPath,
  assertUsAddress,
  finalPacketPath,
  planMailBody,
  quoteMailing,
  requireClientReturnAddress,
  sanitizeLetterHtml,
} from "./credit-mail-policy.ts";

type Admin = ReturnType<typeof createServiceClient>;

export interface PublishedMailing {
  id: string;
  total_cents: number;
  postage_cents: number;
  certified_cents: number;
  electronic_receipt_cents: number;
  handling_fee_cents: number;
  page_count: number;
}

export async function publishPreparedMailing(input: {
  admin: Admin;
  actorId: string;
  body: Record<string, unknown>;
  isTest: boolean;
}): Promise<
  { ok: true; mailing: PublishedMailing } | { ok: false; error: string; status: number }
> {
  const { admin, actorId, body, isTest } = input;
  const clientId = typeof body.client_id === "string" ? body.client_id.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId)) {
    return { ok: false, error: "client_id is required", status: 400 };
  }

  const state = String(body.recipient_state ?? "")
    .trim()
    .toUpperCase();
  assertUsAddress({
    name: String(body.recipient_name ?? ""),
    line1: String(body.recipient_line1 ?? ""),
    city: String(body.recipient_city ?? ""),
    state,
    zip: String(body.recipient_zip ?? ""),
  });

  const cleanup: string[] = [];
  try {
    const loaded = await loadPacketInputs(admin, clientId, body, cleanup);
    const letterHtml =
      typeof body.letter_html === "string" && body.letter_html.trim()
        ? sanitizeLetterHtml(body.letter_html)
        : null;
    return await publishLoadedMailing({
      admin,
      actorId,
      body,
      isTest,
      clientId,
      state,
      letterHtml,
      loaded,
    });
  } finally {
    if (cleanup.length) await admin.storage.from(PACKET_BUCKET).remove(cleanup);
  }
}

async function publishLoadedMailing(input: {
  admin: Admin;
  actorId: string;
  body: Record<string, unknown>;
  isTest: boolean;
  clientId: string;
  state: string;
  letterHtml: string | null;
  loaded: { packet: Uint8Array | null; enclosures: Uint8Array[] };
}): Promise<
  { ok: true; mailing: PublishedMailing } | { ok: false; error: string; status: number }
> {
  const { admin, actorId, body, isTest, clientId, state, letterHtml, loaded } = input;
  const plan = planMailBody({
    letterHtml,
    hasPacketPdf: loaded.packet !== null,
    enclosureCount: loaded.enclosures.length,
  });

  let pdfBytes: Uint8Array | null = null;
  let pageCount: number;
  if (plan.kind === "uploaded_pdf" && loaded.packet) {
    pageCount = (await readLetterPacket(loaded.packet)).pageCount;
    pdfBytes = loaded.packet;
  } else if (plan.kind === "rendered_pdf" && letterHtml) {
    pdfBytes = await renderLetterPacket({ html: letterHtml, enclosures: loaded.enclosures });
    pageCount = (await readLetterPacket(pdfBytes)).pageCount;
  } else {
    pageCount = Number(body.page_count);
  }

  const quote = quoteMailing({
    pages: pageCount,
    postageCents: optionalCents(body.postage_cents),
    certifiedCents: optionalCents(body.certified_cents),
    electronicReceiptCents: optionalCents(body.electronic_receipt_cents),
  });

  const { data: client, error: clientError } = await admin
    .from("clients")
    .select("id, name, mailing_line1, mailing_line2, mailing_city, mailing_state, mailing_zip")
    .eq("id", clientId)
    .maybeSingle();
  if (clientError || !client) return { ok: false, error: "Client not found", status: 404 };

  const returnAddress = requireClientReturnAddress(client);
  const { data: mailing, error: insertError } = await admin
    .from("credit_mailings")
    .insert({
      client_id: clientId,
      recipient_name: String(body.recipient_name).trim(),
      recipient_line1: String(body.recipient_line1).trim(),
      recipient_line2: body.recipient_line2 ? String(body.recipient_line2).trim() : null,
      recipient_city: String(body.recipient_city).trim(),
      recipient_state: state,
      recipient_zip: String(body.recipient_zip).trim(),
      return_name: returnAddress.name,
      return_line1: returnAddress.line1,
      return_line2: returnAddress.line2,
      return_city: returnAddress.city,
      return_state: returnAddress.state,
      return_zip: returnAddress.zip,
      page_count: quote.pageCount,
      postage_cents: quote.postageCents,
      certified_cents: quote.certifiedCents,
      electronic_receipt_cents: quote.electronicReceiptCents,
      handling_fee_cents: quote.handlingFeeCents,
      total_cents: quote.totalCents,
      status: "awaiting_payment",
      customer_sentence: "",
      is_test: isTest,
      packet_storage_path: null,
    })
    .select(
      "id, total_cents, postage_cents, certified_cents, electronic_receipt_cents, handling_fee_cents, page_count",
    )
    .single();
  if (insertError || !mailing)
    return { ok: false, error: "Could not publish the mailing", status: 500 };

  let storedPath: string | null = null;
  if (pdfBytes) {
    const path = finalPacketPath(clientId, mailing.id);
    storedPath = path;
    const { error: uploadError } = await admin.storage.from(PACKET_BUCKET).upload(path, pdfBytes, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (uploadError) {
      await admin.from("credit_mailings").delete().eq("id", mailing.id);
      return { ok: false, error: "The packet could not be stored.", status: 500 };
    }
    const { error: pathError } = await admin
      .from("credit_mailings")
      .update({ packet_storage_path: path })
      .eq("id", mailing.id);
    if (pathError) {
      await admin.storage.from(PACKET_BUCKET).remove([path]);
      await admin.from("credit_mailings").delete().eq("id", mailing.id);
      return { ok: false, error: "The packet could not be stored.", status: 500 };
    }
  }

  const { error: fulfillError } = await admin.from("credit_mailing_fulfillment").insert({
    mailing_id: mailing.id,
    letter_html: letterHtml,
    released_by: actorId,
  });
  if (fulfillError) {
    if (storedPath) await admin.storage.from(PACKET_BUCKET).remove([storedPath]);
    await admin.from("credit_mailings").delete().eq("id", mailing.id);
    return { ok: false, error: "Could not store the letter", status: 500 };
  }

  await admin.from("credit_mail_audit").insert({
    mailing_id: mailing.id,
    client_id: clientId,
    actor_id: actorId,
    action: "ready_to_mail",
    is_test: isTest,
    detail: isTest
      ? "Staff published a sandbox quote. The envelope return address is the client's mailing address copied onto this letter. Nothing is printed from this step, and the client is not asked to confirm."
      : "Staff published a quote. The envelope return address is the client's mailing address copied onto this letter. Nothing is charged and nothing is printed.",
  });

  return { ok: true, mailing };
}

function optionalCents(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

async function loadPacketInputs(
  admin: Admin,
  clientId: string,
  body: Record<string, unknown>,
  cleanup: string[],
): Promise<{ packet: Uint8Array | null; enclosures: Uint8Array[] }> {
  const path = typeof body.packet_storage_path === "string" ? body.packet_storage_path : "";
  const base64 = typeof body.packet_pdf_base64 === "string" ? body.packet_pdf_base64 : "";
  if (path && base64)
    throw new QuoteError("Send the packet PDF once, not as both a file and text.");

  const enclosurePaths = stringList(body.enclosure_storage_paths);
  const enclosureBase64 = base64List(body.enclosures_base64);
  if (enclosurePaths.length + enclosureBase64.length > MAX_ENCLOSURES) {
    throw new QuoteError(`A letter can include up to ${MAX_ENCLOSURES} enclosures.`);
  }

  let packet: Uint8Array | null = null;
  if (path) {
    const staging = assertStagingPath(clientId, path);
    if (!staging.toLowerCase().endsWith(".pdf")) throw new QuoteError("The packet must be a PDF.");
    cleanup.push(staging);
    packet = await downloadObject(admin, staging);
  } else if (base64) {
    packet = decodeBase64(base64, "The packet PDF");
    if (!isPdf(packet)) throw new QuoteError("The packet must be a PDF.");
  }

  const enclosures: Uint8Array[] = [];
  for (const enclosurePath of enclosurePaths) {
    const staging = assertStagingPath(clientId, enclosurePath);
    cleanup.push(staging);
    enclosures.push(await downloadObject(admin, staging));
  }
  for (const item of enclosureBase64) enclosures.push(item);
  return { packet, enclosures };
}

function stringList(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new QuoteError("Enclosure files were not sent correctly.");
  }
  return value;
}

function base64List(value: unknown): Uint8Array[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new QuoteError("Enclosure files were not sent correctly.");
  return value.map((item, index) => {
    if (
      !item ||
      typeof item !== "object" ||
      typeof (item as { data?: unknown }).data !== "string"
    ) {
      throw new QuoteError("Enclosure files were not sent correctly.");
    }
    return decodeBase64((item as { data: string }).data, `Enclosure ${index + 1}`);
  });
}

async function downloadObject(admin: Admin, path: string): Promise<Uint8Array> {
  const { data, error } = await admin.storage.from(PACKET_BUCKET).download(path);
  if (error || !data) throw new QuoteError("The uploaded file could not be read. Upload it again.");
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (bytes.byteLength < 8 || bytes.byteLength > PACKET_MAX_BYTES) {
    throw new QuoteError("The uploaded file is empty or larger than 20 MB.");
  }
  return bytes;
}

function decodeBase64(value: string, label: string): Uint8Array {
  const cleaned = value.replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
  if (cleaned.length < 8 || cleaned.length > Math.ceil(PACKET_MAX_BYTES * 1.4)) {
    throw new QuoteError(`${label} is empty or larger than 20 MB.`);
  }
  let binary: string;
  try {
    binary = atob(cleaned);
  } catch {
    throw new QuoteError(`${label} is not valid.`);
  }
  if (binary.length > PACKET_MAX_BYTES) throw new QuoteError(`${label} is larger than 20 MB.`);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function isPdf(bytes: Uint8Array): boolean {
  return (
    bytes.length > 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  );
}

import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

import {
  FIRST_PAGE_ADDRESS_BLANK_INCHES,
  MAX_PAGES,
  QuoteError,
  letterHtmlToPlainText,
} from "./credit-mail-policy.ts";

const LETTER_WIDTH = 612;
const LETTER_HEIGHT = 792;
const SIDE_MARGIN = 54;
const BOTTOM_MARGIN = 54;
const LATER_TOP = 54;
const SIZE_TOLERANCE = 2;

/** Top of the content band. Page 0 leaves the window blank; later pages do not. */
export function contentTop(pageIndex: number): number {
  const blank = pageIndex === 0 ? FIRST_PAGE_ADDRESS_BLANK_INCHES * 72 : LATER_TOP;
  return LETTER_HEIGHT - blank;
}

export async function readLetterPacket(bytes: Uint8Array): Promise<{ pageCount: number }> {
  let pdf: PDFDocument;
  try {
    pdf = await PDFDocument.load(bytes);
  } catch {
    throw new QuoteError("The packet is not a readable PDF.");
  }
  const pages = pdf.getPages();
  if (pages.length < 1 || pages.length > MAX_PAGES) {
    throw new QuoteError(`A letter must be 1 to ${MAX_PAGES} pages`);
  }
  for (const page of pages) {
    const { width, height } = page.getSize();
    if (
      Math.abs(width - LETTER_WIDTH) > SIZE_TOLERANCE ||
      Math.abs(height - LETTER_HEIGHT) > SIZE_TOLERANCE
    ) {
      throw new QuoteError("Every packet page must be US Letter, 8.5 by 11 inches.");
    }
  }
  return { pageCount: pages.length };
}

/**
 * Letter text, then one letter page per enclosure. Black text on white.
 * Lob's color flag prints the file in black and white. No letterhead is drawn.
 */
export async function renderLetterPacket(input: {
  html: string;
  enclosures: Uint8Array[];
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  drawPlainText(pdf, font, letterHtmlToPlainText(input.html));
  for (const bytes of input.enclosures) {
    await appendEnclosure(pdf, bytes);
  }
  if (pdf.getPageCount() < 1 || pdf.getPageCount() > MAX_PAGES) {
    throw new QuoteError(`A letter must be 1 to ${MAX_PAGES} pages`);
  }
  return pdf.save();
}

function drawPlainText(pdf: PDFDocument, font: PDFFont, text: string) {
  const size = 11;
  const leading = 15;
  const maxWidth = LETTER_WIDTH - SIDE_MARGIN * 2;
  const lines = wrapParagraphs(text, font, size, maxWidth);
  if (lines.every((line) => line.length === 0)) {
    throw new QuoteError("The letter has no printable text.");
  }
  let page = pdf.addPage([LETTER_WIDTH, LETTER_HEIGHT]);
  let pageIndex = 0;
  let y = contentTop(pageIndex) - size;
  for (const line of lines) {
    if (y < BOTTOM_MARGIN) {
      if (pdf.getPageCount() >= MAX_PAGES) {
        throw new QuoteError(`A letter must be 1 to ${MAX_PAGES} pages`);
      }
      page = pdf.addPage([LETTER_WIDTH, LETTER_HEIGHT]);
      pageIndex += 1;
      y = contentTop(pageIndex) - size;
    }
    if (line.length > 0) {
      page.drawText(line, { x: SIDE_MARGIN, y, size, font, color: rgb(0, 0, 0) });
    }
    y -= leading;
  }
}

function wrapParagraphs(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      for (const piece of splitWord(word, font, size, maxWidth)) {
        const next = current ? `${current} ${piece}` : piece;
        if (font.widthOfTextAtSize(next, size) <= maxWidth) {
          current = next;
        } else {
          if (current) lines.push(current);
          current = piece;
        }
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function splitWord(word: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (font.widthOfTextAtSize(word, size) <= maxWidth) return [word];
  const pieces: string[] = [];
  let current = "";
  for (const char of word) {
    const next = current + char;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) current = next;
    else {
      if (current) pieces.push(current);
      current = char;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

async function appendEnclosure(pdf: PDFDocument, bytes: Uint8Array) {
  if (isPdf(bytes)) {
    const source = await PDFDocument.load(bytes);
    const indices = source.getPages().map((_, index) => index);
    if (indices.length === 0) throw new QuoteError("An enclosure PDF has no pages.");
    const embedded = await pdf.embedPdf(source, indices);
    for (const page of embedded) {
      placeOnLetterPage(pdf, (letter) => {
        const margin = 36;
        const maxW = LETTER_WIDTH - margin * 2;
        const maxH = LETTER_HEIGHT - margin * 2;
        const scale = Math.min(maxW / page.width, maxH / page.height);
        const width = page.width * scale;
        const height = page.height * scale;
        letter.drawPage(page, {
          x: (LETTER_WIDTH - width) / 2,
          y: (LETTER_HEIGHT - height) / 2,
          width,
          height,
        });
      });
    }
    return;
  }
  if (isPng(bytes) || isJpeg(bytes)) {
    const image = isPng(bytes) ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    placeOnLetterPage(pdf, (letter) => {
      const margin = 36;
      const maxW = LETTER_WIDTH - margin * 2;
      const maxH = LETTER_HEIGHT - margin * 2;
      const scale = Math.min(maxW / image.width, maxH / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      letter.drawImage(image, {
        x: (LETTER_WIDTH - width) / 2,
        y: (LETTER_HEIGHT - height) / 2,
        width,
        height,
      });
    });
    return;
  }
  throw new QuoteError("Enclosures must be a PDF, JPEG, or PNG.");
}

function placeOnLetterPage(
  pdf: PDFDocument,
  draw: (page: ReturnType<PDFDocument["addPage"]>) => void,
) {
  if (pdf.getPageCount() >= MAX_PAGES) {
    throw new QuoteError(`A letter must be 1 to ${MAX_PAGES} pages`);
  }
  draw(pdf.addPage([LETTER_WIDTH, LETTER_HEIGHT]));
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

function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.length > 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

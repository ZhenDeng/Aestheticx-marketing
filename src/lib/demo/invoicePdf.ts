// Client-side GST tax invoice PDF (14/07 feedback). Layout follows the ATO's
// "Example 2: tax invoice for a sale of $1,000 or more" (ato.gov.au → GST → Tax
// invoices) — the stricter form, valid for lesser amounts too: the words TAX INVOICE,
// the seller's identity and ABN, the BUYER's identity, the issue date, each line item
// with its GST-inclusive price and GST shown, the total amount payable, and the
// statement "The total price includes GST". Rendered with the shared hand-rolled
// single-font writer (directionPdf.ts), so demo AND live export identically without a
// server round-trip. Pure — no React/Firebase.
import type { Invoice, InvoiceLine, InvoiceParty } from "./invoicing";
import { formatAUD, resolveInvoiceKind } from "./invoicing";
import { formatDocDate } from "./direction";
import {
  BOTTOM_LIMIT,
  CONTENT_WIDTH,
  DirectionWriter,
  GOLD,
  INK,
  MARGIN,
  SOFT,
  buildPdfFile,
  type Rgb,
} from "./directionPdf";

/** "INV-XXXXXXXX" — mirrors the backend's numbering (first 8 of the id, uppercased). */
export function invoiceNumber(invoiceId: string): string {
  const clean = invoiceId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return `INV-${clean.slice(0, 8) || "0"}`;
}

/** "20/6/2026" from an ISO day — the item-line date on the invoice. */
export function invoiceLineDate(dateISO: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateISO);
  if (!m) return dateISO;
  return `${Number(m[3])}/${Number(m[2])}/${Number(m[1])}`;
}

/** The item description the owner specified: "'date' – 'patient name' treatment authorisation". */
export function invoiceLineDescription(line: InvoiceLine): string {
  return `${invoiceLineDate(line.dateISO)} – ${line.patientName || "Patient"} treatment authorisation`;
}

/** One line per comma group — "a, b, c" → ["a","b","c"] (17/07 feedback: addresses stack
 *  vertically, never merge into one row). Only a comma FOLLOWED BY whitespace separates,
 *  so numeric commas ("Suite 1,200") stay intact. No commas → one line; empty → none. */
export function addressLines(address: string | undefined): string[] {
  return (address ?? "").split(/,\s+/).map((s) => s.trim()).filter(Boolean);
}

export interface TaxInvoiceModel {
  number: string;
  issuedText: string; // "14 Jul 2026"
  periodLabel: string;
  issuer: InvoiceParty;
  billTo: InvoiceParty;
  // 17/07 feedback: the vertical identity blocks, pre-assembled so the renderer is a
  // dumb line printer and the splitting stays unit-testable.
  sellerLead: string; // practitioner name, else trading name — the block always leads with an identity
  sellerBusiness: string | null; // trading name when distinct from the lead, else null
  sellerDetails: string[]; // "ABN …" (em-dash fallback — ATO-required), address lines, email; absent lines omitted
  toName: string; // bill-to person name, else business name
  /** Business detail rows under the bill-to name (a service-fee invoice stacks the
   *  clinic's ABN); client bill-to blocks carry no ABN row at all — the em-dash
   *  fallback is a SELLER requirement. Empty on legacy authorisation invoices. */
  toDetails: string[];
  toAddressLines: string[]; // bill-to address, one line per comma group
  lines: { description: string; qty: string; unit: string; gst: string; total: string }[];
  subtotalText: string;
  gstText: string;
  totalText: string;
  /** Non-taxable gift-credit note rendered as a final spanning grid row with dashed
   *  numeric cells (spec: patient-wallet) — present only on top-up invoices with a gift. */
  footnote?: string;
}

/** Pure assembly — resolved parties come from the invoice snapshot (the caller falls
 *  back to live business-entity/account data for legacy invoices without one). */
export function buildTaxInvoiceModel(invoice: Invoice, issuer: InvoiceParty, billTo: InvoiceParty): TaxInvoiceModel {
  const sellerLead = issuer.name || issuer.businessName || "—";
  const kind = resolveInvoiceKind(invoice);
  const giftCents = kind === "top-up" ? invoice.giftCents ?? 0 : 0;
  return {
    number: invoiceNumber(invoice.id),
    issuedText: formatDocDate(invoice.createdAt),
    periodLabel: invoice.periodLabel,
    issuer,
    billTo,
    sellerLead,
    sellerBusiness: issuer.businessName && issuer.businessName !== sellerLead ? issuer.businessName : null,
    sellerDetails: [
      `ABN ${issuer.abn || "—"}`,
      ...addressLines(issuer.address),
      ...(issuer.email ? [issuer.email] : []),
    ],
    toName: billTo.name || billTo.businessName || "—",
    // The buyer's ABN wherever the buyer HAS one (22/07 feedback: "invoice 上面没有买方 abn").
    // Previously service-fee only, which silently dropped it from authorisation invoices — the
    // doctor→clinic monthly bill, just as B2B as a service fee. A client bill-to is a patient
    // and carries none, so this stays empty there; unlike the seller's, a buyer ABN gets no
    // em-dash fallback — that placeholder is an ATO requirement on the SELLER alone.
    toDetails: billTo.abn ? [`ABN ${billTo.abn}`] : [],
    toAddressLines: addressLines(billTo.address),
    lines: invoice.lines.map((l) => ({
      // Matrix lines carry their own description/qty/unit (GST-inclusive retail);
      // authorisation lines keep the owner's date–patient phrasing with qty 1.
      description: l.description ?? invoiceLineDescription(l),
      qty: String(l.qty ?? 1),
      unit: formatAUD(l.unitCents ?? l.feeCents),
      gst: formatAUD(l.gstCents),
      total: formatAUD(l.feeCents + l.gstCents),
    })),
    subtotalText: formatAUD(invoice.subtotalCents),
    gstText: formatAUD(invoice.gstCents),
    totalText: formatAUD(invoice.totalCents),
    ...(giftCents > 0
      ? {
          footnote: `Promotional Gift Credit Applied: ${formatAUD(giftCents)} (Non-Taxable). Total Wallet Value Loaded: ${formatAUD(invoice.totalCreditCents ?? invoice.totalCents + giftCents)}.`,
        }
      : {}),
  };
}

// ——— Items table geometry (design-ui.md §6: bordered table, full content width) ———
const COLUMNS = [
  { label: "DESCRIPTION", fraction: 0.55, align: "left" as const },
  { label: "QTY", fraction: 0.08, align: "right" as const },
  { label: "UNIT", fraction: 0.13, align: "right" as const },
  { label: "GST", fraction: 0.11, align: "right" as const },
  { label: "AMOUNT", fraction: 0.13, align: "right" as const },
];
const COL_X = COLUMNS.map((_, i) =>
  MARGIN + COLUMNS.slice(0, i).reduce((sum, c) => sum + c.fraction, 0) * CONTENT_WIDTH);
const COL_W = COLUMNS.map((c) => c.fraction * CONTENT_WIDTH);
const CELL_PAD_X = 6;
const CELL_PAD_Y = 5;
const DESC_SIZE = 10; // body description
const NUM_SIZE = 9.5; // numeric cells + totals rows
const LINE = 1.15; // the writer's line-height factor
const HEADER_BAND_H = 8 * LINE + CELL_PAD_Y * 2;
const HEAVY = 1; // header/frame rule weight; interior rules are the writer's 0.5 default

/** GOLD uppercase header band bounded by heavier rules; leaves the cursor under the band. */
function drawTableHeader(writer: DirectionWriter): void {
  const top = writer.currentY();
  writer.hline(MARGIN, MARGIN + CONTENT_WIDTH, { width: HEAVY });
  writer.setY(top + CELL_PAD_Y);
  for (const [i, col] of COLUMNS.entries()) {
    writer.textAt(col.label, 8, GOLD, COL_X[i] + CELL_PAD_X, {
      width: COL_W[i] - CELL_PAD_X * 2,
      align: col.align,
      charSpace: 1,
    });
  }
  writer.setY(top + HEADER_BAND_H);
  writer.hline(MARGIN, MARGIN + CONTENT_WIDTH, { width: HEAVY });
}

/** Outer frame + column separators for the table segment [top, bottom] on this page. */
function closeTableFrame(writer: DirectionWriter, top: number, bottom: number): void {
  writer.rect(MARGIN, top, CONTENT_WIDTH, bottom - top, { width: HEAVY });
  for (const x of COL_X.slice(1)) writer.vline(x, top, bottom);
}

// Header metadata block geometry (17/07 feedback: DATE ISSUED + INVOICE NUMBER sit in the
// top-right corner whitespace, right-aligned against the margin like a ledger).
const META_W = 180;
const META_X = MARGIN + CONTENT_WIDTH - META_W;

export function renderTaxInvoicePdf(model: TaxInvoiceModel): Uint8Array {
  const writer = new DirectionWriter();

  // ——— Header band: title left, metadata top-right, sharing the top edge ———
  const headerTop = writer.currentY();
  // ATO requirement 1: the document says what it is.
  writer.text("TAX INVOICE", 23, INK);
  const titleBottom = writer.currentY();

  let metaY = headerTop; // top-aligned with the title — the block fills the corner whitespace
  const metaLine = (text: string, size: number, color: Rgb, opts: { charSpace?: number } = {}): void => {
    writer.setY(metaY);
    writer.textAt(text, size, color, META_X, { width: META_W, align: "right", ...opts });
    metaY += size * LINE + 2;
  };
  metaLine("DATE ISSUED", 8, GOLD, { charSpace: 1 });
  metaLine(model.issuedText, 11.5, INK);
  metaY += 6;
  metaLine("INVOICE NUMBER", 8, GOLD, { charSpace: 1 });
  metaLine(model.number, 11.5, INK);
  metaLine(model.periodLabel, 9, SOFT);

  // The cursor resumes below whichever column ran deeper — the blocks never collide.
  writer.setY(Math.max(titleBottom, metaY) + 6);

  // ——— Seller block (requirements 2-3): one line per element, no comma-joins ———
  writer.text(model.sellerLead, 12.5, INK);
  if (model.sellerBusiness) writer.text(model.sellerBusiness, 10.5, INK);
  for (const detail of model.sellerDetails) writer.text(detail, 10, SOFT);
  writer.moveDown(0.9);

  // ——— TO block: buyer identity (the ≥ $1,000 requirement Example 2 adds) with the
  // address split across lines (requirement 4's issue date lives in the header now) ———
  writer.text("TO", 8, GOLD, { charSpace: 1 });
  writer.moveDown(0.15);
  writer.text(model.toName, 11.5, INK);
  for (const detail of model.toDetails) writer.text(detail, 10, SOFT);
  for (const line of model.toAddressLines) writer.text(line, 10, SOFT);

  // Items (requirement 5): bordered table, one row per authorisation — description
  // wrapped inside its column, qty always 1 (per-script invoicing), numerals
  // right-aligned, GST and the GST-inclusive amount shown per line (Example 2).
  writer.moveDown(0.6);
  // Never orphan a header band at the page bottom: if the band plus one minimal row
  // can't fit (a long TO/seller block parked the cursor low), start the table on a
  // fresh page instead of framing an empty band.
  const minRowH = NUM_SIZE * LINE + CELL_PAD_Y * 2;
  if (writer.currentY() + HEADER_BAND_H + minRowH > BOTTOM_LIMIT) writer.newPage();
  let segTop = writer.currentY(); // top of the frame segment on the current page
  drawTableHeader(writer);
  for (const line of model.lines) {
    const descLines = writer.cellLines(line.description, DESC_SIZE, COL_W[0] - CELL_PAD_X * 2);
    const rowH = Math.max(descLines.length * DESC_SIZE * LINE, NUM_SIZE * LINE) + CELL_PAD_Y * 2;
    if (writer.currentY() + rowH > BOTTOM_LIMIT) {
      // Close the frame at the row boundary and continue under a fresh header band.
      closeTableFrame(writer, segTop, writer.currentY());
      writer.newPage();
      segTop = writer.currentY();
      drawTableHeader(writer);
    }
    const rowTop = writer.currentY();
    for (const [i, text] of descLines.entries()) {
      writer.setY(rowTop + CELL_PAD_Y + i * DESC_SIZE * LINE);
      writer.textAt(text, DESC_SIZE, INK, COL_X[0] + CELL_PAD_X, { width: COL_W[0] - CELL_PAD_X * 2 });
    }
    writer.setY(rowTop + CELL_PAD_Y + (DESC_SIZE - NUM_SIZE) * 0.72); // share the description baseline
    const cells: { value: string; color: Rgb }[] = [
      { value: line.qty, color: SOFT },
      { value: line.unit, color: SOFT },
      { value: line.gst, color: SOFT },
      { value: line.total, color: INK }, // AMOUNT carries the weight
    ];
    for (const [i, cell] of cells.entries()) {
      writer.textAt(cell.value, NUM_SIZE, cell.color, COL_X[i + 1] + CELL_PAD_X, {
        width: COL_W[i + 1] - CELL_PAD_X * 2,
        align: "right",
      });
    }
    writer.setY(rowTop + rowH);
    writer.hline(MARGIN, MARGIN + CONTENT_WIDTH); // 0.5pt SOFT row rule
  }
  if (model.footnote) {
    // Non-taxable gift note: a spanning row inside the grid — the text wraps in the
    // description column and every numeric cell dashes out, so the framed totals
    // visibly exclude it (spec: patient-wallet).
    const noteLines = writer.cellLines(model.footnote, NUM_SIZE, COL_W[0] - CELL_PAD_X * 2);
    const rowH = Math.max(noteLines.length * NUM_SIZE * LINE, NUM_SIZE * LINE) + CELL_PAD_Y * 2;
    if (writer.currentY() + rowH > BOTTOM_LIMIT) {
      closeTableFrame(writer, segTop, writer.currentY());
      writer.newPage();
      segTop = writer.currentY();
      drawTableHeader(writer);
    }
    const rowTop = writer.currentY();
    for (const [i, text] of noteLines.entries()) {
      writer.setY(rowTop + CELL_PAD_Y + i * NUM_SIZE * LINE);
      writer.textAt(text, NUM_SIZE, SOFT, COL_X[0] + CELL_PAD_X, { width: COL_W[0] - CELL_PAD_X * 2 });
    }
    writer.setY(rowTop + CELL_PAD_Y);
    for (let i = 1; i < COLUMNS.length; i++) {
      writer.textAt("\u2014", NUM_SIZE, SOFT, COL_X[i] + CELL_PAD_X, { width: COL_W[i] - CELL_PAD_X * 2, align: "right" });
    }
    writer.setY(rowTop + rowH);
  }
  closeTableFrame(writer, segTop, writer.currentY());

  // Totals (requirements 6-7): right-aligned mini-table, then the framed TOTAL band —
  // the rule-weight hierarchy carries the eye to the amount payable.
  const totalsW = 200;
  const totalsX = MARGIN + CONTENT_WIDTH - totalsW;
  const totalsRowH = NUM_SIZE * LINE + 4;
  const bandH = 8 * LINE + 16 * LINE + CELL_PAD_Y * 2 + 4;
  writer.setY(writer.currentY() + 12);
  if (writer.currentY() + totalsRowH * 2 + 6 + bandH > BOTTOM_LIMIT) writer.newPage();
  for (const row of [
    { label: "Subtotal (excl. GST)", value: model.subtotalText },
    { label: "GST (10%)", value: model.gstText },
  ]) {
    writer.textAt(row.label, NUM_SIZE, SOFT, totalsX, { width: totalsW });
    writer.textAt(row.value, NUM_SIZE, INK, totalsX, { width: totalsW, align: "right" });
    writer.setY(writer.currentY() + totalsRowH);
  }
  writer.setY(writer.currentY() + 6);
  const bandTop = writer.currentY();
  writer.rect(totalsX, bandTop, totalsW, bandH, { width: HEAVY });
  writer.setY(bandTop + CELL_PAD_Y);
  writer.textAt("TOTAL AMOUNT PAYABLE", 8, GOLD, totalsX + CELL_PAD_X + 2, {
    width: totalsW - (CELL_PAD_X + 2) * 2,
    charSpace: 1,
  });
  writer.setY(bandTop + CELL_PAD_Y + 8 * LINE + 4);
  writer.textAt(model.totalText, 16, INK, totalsX + CELL_PAD_X + 2, {
    width: totalsW - (CELL_PAD_X + 2) * 2,
    align: "right",
  });
  writer.setY(bandTop + bandH);

  // The Example 2 taxable-sale statement (requirement 7), kept verbatim.
  writer.setY(writer.currentY() + 14);
  writer.text("The total price includes GST.", 10, INK);

  return buildPdfFile(writer.pages.map((ops) => ops.join("\n")));
}

/** Download name, e.g. "AestheticX-TaxInvoice-INV-ABC123.pdf". */
export function taxInvoicePdfFilename(invoiceId: string): string {
  return `AestheticX-TaxInvoice-${invoiceNumber(invoiceId)}.pdf`;
}

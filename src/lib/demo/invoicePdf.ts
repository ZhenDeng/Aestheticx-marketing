// Client-side GST tax invoice PDF (14/07 feedback). Layout follows the ATO's
// "Example 2: tax invoice for a sale of $1,000 or more" (ato.gov.au → GST → Tax
// invoices) — the stricter form, valid for lesser amounts too: the words TAX INVOICE,
// the seller's identity and ABN, the BUYER's identity, the issue date, each line item
// with its GST-inclusive price and GST shown, the total amount payable, and the
// statement "The total price includes GST". Rendered with the shared hand-rolled
// single-font writer (directionPdf.ts), so demo AND live export identically without a
// server round-trip. Pure — no React/Firebase.
import type { Invoice, InvoiceLine, InvoiceParty } from "./invoicing";
import { formatAUD } from "./invoicing";
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
  field,
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

export interface TaxInvoiceModel {
  number: string;
  issuedText: string; // "14 Jul 2026"
  periodLabel: string;
  issuer: InvoiceParty;
  billTo: InvoiceParty;
  lines: { description: string; unit: string; gst: string; total: string }[];
  subtotalText: string;
  gstText: string;
  totalText: string;
}

/** Pure assembly — resolved parties come from the invoice snapshot (the caller falls
 *  back to live business-entity/account data for legacy invoices without one). */
export function buildTaxInvoiceModel(invoice: Invoice, issuer: InvoiceParty, billTo: InvoiceParty): TaxInvoiceModel {
  return {
    number: invoiceNumber(invoice.id),
    issuedText: formatDocDate(invoice.createdAt),
    periodLabel: invoice.periodLabel,
    issuer,
    billTo,
    lines: invoice.lines.map((l) => ({
      description: invoiceLineDescription(l),
      unit: formatAUD(l.feeCents),
      gst: formatAUD(l.gstCents),
      total: formatAUD(l.feeCents + l.gstCents),
    })),
    subtotalText: formatAUD(invoice.subtotalCents),
    gstText: formatAUD(invoice.gstCents),
    totalText: formatAUD(invoice.totalCents),
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

export function renderTaxInvoicePdf(model: TaxInvoiceModel): Uint8Array {
  const writer = new DirectionWriter();

  // ATO requirement 1: the document says what it is.
  writer.text("TAX INVOICE", 23, INK);
  writer.moveDown(0.4);

  // Seller identity + ABN (requirements 2-3).
  writer.text(model.issuer.businessName || "—", 13, INK);
  writer.text(`ABN ${model.issuer.abn || "—"}`, 10, SOFT);
  writer.moveDown(0.8);

  // Buyer identity (the ≥ $1,000 requirement Example 2 adds) + issue date (requirement 4).
  field(writer, "To", [model.billTo.businessName || "—", model.billTo.address ?? ""].filter(Boolean).join(", "));
  field(writer, "Date issued", model.issuedText);
  field(writer, "Invoice number", `${model.number} · ${model.periodLabel}`);

  // Items (requirement 5): bordered table, one row per authorisation — description
  // wrapped inside its column, qty always 1 (per-script invoicing), numerals
  // right-aligned, GST and the GST-inclusive amount shown per line (Example 2).
  writer.moveDown(0.6);
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
      { value: "1", color: SOFT },
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

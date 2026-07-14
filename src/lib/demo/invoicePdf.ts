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
import { DirectionWriter, GOLD, INK, SOFT, buildPdfFile, field } from "./directionPdf";

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

  // Items (requirement 5): description + quantity + price, with GST shown per line
  // (Example 2 shows GST included in each line item).
  writer.moveDown(0.4);
  writer.text("DESCRIPTION OF SUPPLY", 9, GOLD, { charSpace: 1 });
  writer.moveDown(0.3);
  for (const line of model.lines) {
    writer.text(line.description, 10.5, INK);
    writer.text(`1 × ${line.unit} + GST ${line.gst} = ${line.total} incl. GST`, 9.5, SOFT);
    writer.moveDown(0.3);
  }

  // Totals + the Example 2 taxable-sale statement (requirements 6-7).
  writer.moveDown(0.6);
  field(writer, "Subtotal (excl. GST)", model.subtotalText);
  field(writer, "GST (10%)", model.gstText);
  writer.text("TOTAL AMOUNT PAYABLE", 9, GOLD, { charSpace: 1 });
  writer.text(model.totalText, 16, INK);
  writer.moveDown(0.5);
  writer.text("The total price includes GST.", 10, INK);

  return buildPdfFile(writer.pages.map((ops) => ops.join("\n")));
}

/** Download name, e.g. "AestheticX-TaxInvoice-INV-ABC123.pdf". */
export function taxInvoicePdfFilename(invoiceId: string): string {
  return `AestheticX-TaxInvoice-${invoiceNumber(invoiceId)}.pdf`;
}

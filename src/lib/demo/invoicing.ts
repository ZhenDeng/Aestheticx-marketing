// Per-script invoicing — money math in integer cents, ported verbatim from the
// backend invoicing.ts so demo totals match server-computed totals.
import type { Identity } from "./types";

export const DEFAULT_SCRIPT_PRICE_CENTS = 2500;
export const GST_RATE = 0.1;

export interface InvoiceAuthInput { id: string; dateISO: string; patientName: string; }
export interface InvoiceLine { authorisationID: string; dateISO: string; patientName: string; feeCents: number; gstCents: number; }
export interface ComputedInvoice { lines: InvoiceLine[]; subtotalCents: number; gstCents: number; totalCents: number; }

export interface Invoice {
  id: string;
  doctorID: string;
  counterpartyID: string;
  counterpartyType: "nurse" | "clinic";
  periodLabel: string;
  lines: InvoiceLine[];
  subtotalCents: number;
  gstCents: number;
  totalCents: number;
  authorisationIDs: string[];
  pdfFileId?: string;
  createdAt: number;
}

export function computeInvoice(input: {
  pricePerScriptCents: number;
  gstRate: number;
  authorisations: InvoiceAuthInput[];
}): ComputedInvoice {
  if (!(input.pricePerScriptCents > 0)) throw new Error("price per script must be a positive amount of cents");
  const lines: InvoiceLine[] = input.authorisations.map((a) => ({
    authorisationID: a.id,
    dateISO: a.dateISO,
    patientName: a.patientName,
    feeCents: input.pricePerScriptCents,
    gstCents: Math.round(input.pricePerScriptCents * input.gstRate),
  }));
  const subtotalCents = lines.reduce((s, l) => s + l.feeCents, 0);
  const gstCents = lines.reduce((s, l) => s + l.gstCents, 0);
  return { lines, subtotalCents, gstCents, totalCents: subtotalCents + gstCents };
}

export interface BillableAuthRow { id: string; counterpartyID: string; monthKey: string; invoiced: boolean; }

export function selectableForInvoice<T extends BillableAuthRow>(
  auths: T[], filter: { counterpartyID: string; monthKey: string },
): T[] {
  return auths.filter(
    (a) => a.counterpartyID === filter.counterpartyID && a.monthKey === filter.monthKey && !a.invoiced,
  );
}

export function formatAUD(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString("en-US");
  const c = String(abs % 100).padStart(2, "0");
  return `${sign}$${dollars}.${c}`;
}

// Invoices the identity may see (mirrors the backend invoices read rules).
export function invoicesFor(invoices: Invoice[], identity: Identity): Invoice[] {
  if (identity.role === "doctor") return invoices.filter((i) => i.doctorID === identity.user.id);
  const clinicId = identity.context.kind === "clinic" ? identity.context.clinic.id : null;
  return invoices.filter((i) =>
    i.counterpartyType === "clinic"
      ? clinicId !== null && i.counterpartyID === clinicId
      : i.counterpartyType === "nurse" && i.counterpartyID === identity.user.id,
  );
}

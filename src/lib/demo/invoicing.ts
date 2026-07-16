// Per-script invoicing — money math in integer cents, ported verbatim from the
// backend invoicing.ts so demo totals match server-computed totals.
import type { Identity } from "./types";

export const DEFAULT_SCRIPT_PRICE_CENTS = 2500;
export const GST_RATE = 0.1;

export interface InvoiceAuthInput { id: string; dateISO: string; patientName: string; }
export interface InvoiceLine { authorisationID: string; dateISO: string; patientName: string; feeCents: number; gstCents: number; }
export interface ComputedInvoice { lines: InvoiceLine[]; subtotalCents: number; gstCents: number; totalCents: number; }

// Issuer / bill-to identity snapshotted onto an invoice at generation time (Tier 3 #4). The backend
// sources business name + ABN from each party's Business Entity (contact from users/clinics) and
// freezes them here, so the invoice is self-describing and its ABN doesn't drift if an entity is
// later edited. Legacy invoices (pre-#4) carry no snapshot → undefined.
export interface InvoiceParty {
  businessName: string;
  abn: string;
  email: string;
  address?: string;
}

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
  // Payment status (Tier 3 #6). paid defaults false at issue; the doctor marks it paid when the
  // counterparty settles, recording when + who.
  paid: boolean;
  paidAt?: number;
  markedBy?: string;
  // Tier 3 #4: the issuer (doctor) and bill-to (counterparty) identity as of generation (undefined on legacy invoices).
  issuer?: InvoiceParty;
  billTo?: InvoiceParty;
}

export function computeInvoice(input: {
  pricePerScriptCents: number;
  gstRate: number;
  authorisations: InvoiceAuthInput[];
}): ComputedInvoice {
  if (!(input.pricePerScriptCents > 0)) throw new Error("price per script must be a positive amount of cents");
  if (input.authorisations.length === 0) throw new Error("an invoice needs at least one authorisation");
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

// A billable "script" = one approved authorisation REQUEST. 15/07 feedback: an invoice counts
// per authorisation/script, not per medication item — "if the nurse submits multiple items in one
// go, it is one script containing multiple medications". approveRequest fans a request into one
// authorisation doc per item; this regroups those items back to one script per requestID, keeping
// every member authorisation id so generation can flag them all invoiced while pricing once.
export interface BillableItemRow {
  id: string;
  requestID: string;
  counterpartyID: string;
  counterpartyType: "nurse" | "clinic";
  monthKey: string;
  dateISO: string;
  patientName: string;
  invoiced: boolean;
}
export interface BillableScriptRow {
  requestID: string;
  counterpartyID: string;
  counterpartyType: "nurse" | "clinic";
  monthKey: string;
  dateISO: string;
  patientName: string;
  authIDs: string[];
}
export function scriptsFromBillable(rows: BillableItemRow[]): BillableScriptRow[] {
  const byRequest = new Map<string, BillableScriptRow>();
  for (const r of rows) {
    const existing = byRequest.get(r.requestID);
    if (existing) { existing.authIDs.push(r.id); continue; }
    byRequest.set(r.requestID, {
      requestID: r.requestID,
      counterpartyID: r.counterpartyID,
      counterpartyType: r.counterpartyType,
      monthKey: r.monthKey,
      dateISO: r.dateISO,
      patientName: r.patientName,
      authIDs: [r.id],
    });
  }
  return [...byRequest.values()];
}

/** 16/07 feedback: the generate panel selects at SCRIPT grain (checkbox per script) —
 *  expand the ticked scripts back to their member item-authorisation ids for generation.
 *  Deselected scripts stay un-invoiced and selectable later. */
export function authIDsForSelectedScripts(scripts: BillableScriptRow[], selectedRequestIDs: ReadonlySet<string>): string[] {
  return scripts.filter((s) => selectedRequestIDs.has(s.requestID)).flatMap((s) => s.authIDs);
}

export function formatAUD(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  // "en-US" grouping (comma thousands) is deterministic across runtimes and matches
  // AUD conventions; we format manually rather than via Intl currency to avoid ICU variance.
  const dollars = Math.floor(abs / 100).toLocaleString("en-US");
  const c = String(abs % 100).padStart(2, "0");
  return `${sign}$${dollars}.${c}`;
}

// Invoices the identity may see (mirrors the backend invoices read rules).
// Non-doctors see clinic-typed invoices for their clinic (clinicAdmin always acts in
// clinic context here) or nurse-typed invoices addressed to their own user id.
export function invoicesFor(invoices: Invoice[], identity: Identity): Invoice[] {
  if (identity.role === "doctor") return invoices.filter((i) => i.doctorID === identity.user.id);
  const clinicId = identity.context.kind === "clinic" ? identity.context.clinic.id : null;
  return invoices.filter((i) =>
    i.counterpartyType === "clinic"
      ? clinicId !== null && i.counterpartyID === clinicId
      : i.counterpartyType === "nurse" && i.counterpartyID === identity.user.id,
  );
}

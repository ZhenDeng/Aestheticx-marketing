// Per-script invoicing — money math in integer cents, ported verbatim from the
// backend invoicing.ts so demo totals match server-computed totals.
import type { Identity, PatientOwner } from "./types";

export const DEFAULT_SCRIPT_PRICE_CENTS = 2500;
export const GST_RATE = 0.1;

export interface InvoiceAuthInput { id: string; dateISO: string; patientName: string; }
// `feeCents` is the line's NET (GST-exclusive) total; `gstCents` its GST portion — so
// fee + gst is the amount payable for the line under both conventions (exclusive script
// billing and GST-inclusive retail). Matrix lines additionally carry a free-text
// description, quantity, and the GST-inclusive unit price for grid display; legacy
// authorisation lines leave them unset (qty is always 1, description derives from
// date + patient).
export interface InvoiceLine {
  authorisationID: string;
  dateISO: string;
  patientName: string;
  feeCents: number;
  gstCents: number;
  description?: string;
  qty?: number;
  unitCents?: number;
}
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
  /** The practitioner's personal name (17/07 feedback: seller block leads "Dr Jenn Lee"
   *  above the trading name). Absent on clinics and on legacy snapshots. */
  name?: string;
}

// The billing-matrix invoice streams (change: multi-tenant-billing-matrix). A stored
// invoice without `kind` predates the matrix and is an authorisation invoice — resolve
// through resolveInvoiceKind, never read `kind` raw.
export type InvoiceKind = "authorisation" | "client-sale" | "service-fee" | "top-up";

export function resolveInvoiceKind(invoice: Invoice): InvoiceKind {
  return invoice.kind ?? "authorisation";
}

export interface Invoice {
  id: string;
  doctorID: string;
  counterpartyID: string;
  // "client" only on matrix invoices billed to a patient (counterpartyID = patient id);
  // authorisation invoices stay "nurse" | "clinic".
  counterpartyType: "nurse" | "clinic" | "client";
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
  // --- Billing-matrix fields (undefined on authorisation invoices) ---
  // Matrix invoices leave the legacy doctor-centric fields inert (doctorID = "") and
  // describe their parties here + in the frozen issuer/billTo snapshots instead.
  kind?: InvoiceKind;
  /** The silo that issued a matrix invoice (practitioner uid or clinic id). */
  issuerRef?: PatientOwner;
  /** The client billed on a client-sale / top-up invoice. */
  patientID?: string;
  /** Service-fee invoices are queued as drafts for the practitioner to finalize. */
  draft?: boolean;
  /** Links the split-billing pair (and wallet entries) born from one checkout/top-up. */
  checkoutID?: string;
  /** Top-up invoices: the promotional (non-taxable) portion and the total wallet credit. */
  giftCents?: number;
  totalCreditCents?: number;
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

// --- GST-inclusive retail math (spec: client-checkout / patient-wallet) ---
// B2C amounts (price-list retail, top-up paid amounts) are what the client actually
// pays: GST component = round(inclusive/11) per line, net = inclusive − GST. This keeps
// the template's "The total price includes GST" statement literally true for the
// matrix streams, while script billing keeps its exclusive computeInvoice convention.
export interface InclusiveLineInput { id: string; description: string; qty: number; unitCents: number; }

export function computeInclusiveTotals(inputs: InclusiveLineInput[]): ComputedInvoice {
  if (inputs.length === 0) throw new Error("an invoice needs at least one line");
  const lines: InvoiceLine[] = inputs.map((l) => {
    if (!Number.isInteger(l.qty) || l.qty <= 0) throw new Error("line quantity must be a positive integer");
    if (!Number.isInteger(l.unitCents) || l.unitCents <= 0) throw new Error("line unit price must be a positive amount of cents");
    const inclusive = l.qty * l.unitCents;
    const gstCents = Math.round(inclusive / 11);
    return {
      authorisationID: l.id,
      dateISO: "",
      patientName: "",
      feeCents: inclusive - gstCents,
      gstCents,
      description: l.description,
      qty: l.qty,
      unitCents: l.unitCents,
    };
  });
  const subtotalCents = lines.reduce((s, l) => s + l.feeCents, 0);
  const gstCents = lines.reduce((s, l) => s + l.gstCents, 0);
  return { lines, subtotalCents, gstCents, totalCents: subtotalCents + gstCents };
}

// --- Manual client-invoice math (spec: manual client invoicing, 2026-07-24) ---
// A practitioner hand-types each line's description and price. Two per-invoice options
// mirror the retail conventions already in this file: "GST included" is the inclusive
// convention (gst = round(amount/11), like computeInclusiveTotals); "GST on top" is the
// exclusive one (gst = round(amount*0.1), like computeInvoice/createServiceInvoice); no
// GST leaves the line untaxed. Money stays integer cents.
export interface ManualLineInput { id: string; description: string; amountCents: number; }
export interface ManualGstOptions { chargeGst: boolean; gstIncluded: boolean; }

export function computeManualInvoice(inputs: ManualLineInput[], opts: ManualGstOptions): ComputedInvoice {
  if (inputs.length === 0) throw new Error("an invoice needs at least one line");
  const lines: InvoiceLine[] = inputs.map((l) => {
    if (!Number.isInteger(l.amountCents) || l.amountCents <= 0) {
      throw new Error("line amount must be a positive amount of cents");
    }
    let feeCents: number;
    let gstCents: number;
    if (!opts.chargeGst) {
      feeCents = l.amountCents;
      gstCents = 0;
    } else if (opts.gstIncluded) {
      gstCents = Math.round(l.amountCents / 11);
      feeCents = l.amountCents - gstCents;
    } else {
      feeCents = l.amountCents;
      gstCents = Math.round(l.amountCents * GST_RATE);
    }
    return {
      authorisationID: l.id,
      dateISO: "",
      patientName: "",
      feeCents,
      gstCents,
      description: l.description,
      qty: 1,
      unitCents: l.amountCents, // the typed figure — gross when inclusive, net when on-top
    };
  });
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
// Authorisation invoices keep the pre-matrix behavior exactly: doctors see what they
// issued; non-doctors see clinic-typed invoices for their clinic (clinicAdmin always
// acts in clinic context here) or nurse-typed invoices addressed to their own user id.
// Matrix invoices are direction-scoped (delta spec: invoicing): visible to their ISSUER
// silo — practitioner-issued documents follow the person (both identities), clinic-issued
// documents follow clinic context — and, once no longer draft, to the BILL-TO
// counterparty (a clinic receiving a service-fee invoice). Drafts stay issuer-only.
export function invoicesFor(invoices: Invoice[], identity: Identity): Invoice[] {
  const clinicId = identity.context.kind === "clinic" ? identity.context.clinic.id : null;
  return invoices.filter((i) => {
    if (resolveInvoiceKind(i) === "authorisation") {
      if (identity.role === "doctor") return i.doctorID === identity.user.id;
      return i.counterpartyType === "clinic"
        ? clinicId !== null && i.counterpartyID === clinicId
        : i.counterpartyType === "nurse" && i.counterpartyID === identity.user.id;
    }
    const issuer = i.issuerRef;
    const kind = resolveInvoiceKind(i);
    let isIssuer = false;
    if (issuer !== undefined) {
      if (issuer.kind === "clinic") {
        isIssuer = issuer.id === clinicId;
      } else if (issuer.id === identity.user.id) {
        // Practitioner-issued documents: SERVICE FEES are the practitioner's own
        // earnings from clinic work and follow the person across identities (a
        // clinic-only nurse must see and finalize her drafts). CLIENT documents
        // (sales/top-ups) belong to the silo that owns the client — the independent
        // book — and carry client PII, so the same user's clinic identity is not the
        // issuer (isolation doctrine, mirrors patientAccessLevel's owner check).
        isIssuer = kind === "service-fee" || identity.context.kind === "independent";
      }
    }
    if (isIssuer) return true;
    if (i.draft) return false;
    return i.counterpartyType === "clinic" && clinicId !== null && i.counterpartyID === clinicId;
  });
}

"use client";

import { httpsCallable } from "firebase/functions";
import { functions } from "./client";

export async function setScriptPrice(counterpartyID: string, priceCents: number): Promise<void> {
  await httpsCallable(functions(), "setScriptPrice")({ counterpartyId: counterpartyID, priceCents });
}

export interface GenerateInvoiceArgs {
  counterpartyID: string;
  counterpartyType: "nurse" | "clinic";
  periodLabel: string;
  authorisationIDs: string[];
}

export async function generateInvoice(args: GenerateInvoiceArgs): Promise<string> {
  const res = await httpsCallable(functions(), "generateInvoice")({
    counterpartyId: args.counterpartyID,
    counterpartyType: args.counterpartyType,
    periodLabel: args.periodLabel,
    authorisationIds: args.authorisationIDs,
  });
  return (res.data as { invoiceId?: string }).invoiceId ?? "";
}

export async function markInvoicePaid(invoiceID: string): Promise<void> {
  await httpsCallable(functions(), "markInvoicePaid")({ invoiceId: invoiceID });
}

export interface CreateServiceInvoiceArgs {
  clinicID: string;
  issuerRole: "nurse" | "doctor";
  lines: { description: string; amountCents: number }[];
  chargeGst: boolean;
  gstIncluded: boolean;
}

// Manual practitioner→clinic service invoice (spec: manual-service-invoicing; backend
// PR ZhenDeng/Aestheticx#115). The backend validates membership and freezes both
// business-entity snapshots server-side. The GST toggles default server-side to the
// original exclusive convention, so an older backend simply ignores them.
export async function createServiceInvoice(args: CreateServiceInvoiceArgs): Promise<string> {
  const res = await httpsCallable(functions(), "createServiceInvoice")({
    clinicId: args.clinicID,
    issuerRole: args.issuerRole,
    lines: args.lines,
    chargeGst: args.chargeGst,
    gstIncluded: args.gstIncluded,
  });
  return (res.data as { invoiceId?: string }).invoiceId ?? "";
}

// 16/07 feedback enhancement 2: delete an invoice to correct an error — the backend
// transactionally removes the doc and returns its member authorisations to un-invoiced.
// 02/08: matrix records (client invoices, service fees) are deletable by their issuer
// silo too — ownership is enforced per-invoice inside the callable's transaction.
export async function deleteInvoice(invoiceID: string): Promise<void> {
  await httpsCallable(functions(), "deleteInvoice")({ invoiceId: invoiceID });
}

export interface CreateClientInvoiceArgs {
  patientID: string;
  lines: { description: string; amountCents: number }[];
  chargeGst: boolean;
  gstIncluded: boolean;
  appointmentID?: string;
}

// Manual client invoice as a stored record (02/08 feedback: issued client invoices must
// be re-downloadable and deletable, not one-shot PDFs). The backend validates access via
// the client's owning silo and freezes the issuer/bill-to snapshots server-side.
export async function createClientInvoice(args: CreateClientInvoiceArgs): Promise<string> {
  const res = await httpsCallable(functions(), "createClientInvoice")({
    patientId: args.patientID,
    lines: args.lines,
    chargeGst: args.chargeGst,
    gstIncluded: args.gstIncluded,
    ...(args.appointmentID ? { appointmentId: args.appointmentID } : {}),
  });
  return (res.data as { invoiceId?: string }).invoiceId ?? "";
}

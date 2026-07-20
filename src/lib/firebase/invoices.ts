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
}

// Manual practitioner→clinic service invoice (spec: manual-service-invoicing; backend
// PR ZhenDeng/Aestheticx#115). The backend validates membership and freezes both
// business-entity snapshots server-side.
export async function createServiceInvoice(args: CreateServiceInvoiceArgs): Promise<string> {
  const res = await httpsCallable(functions(), "createServiceInvoice")({
    clinicId: args.clinicID,
    issuerRole: args.issuerRole,
    lines: args.lines,
  });
  return (res.data as { invoiceId?: string }).invoiceId ?? "";
}

// 16/07 feedback enhancement 2: delete an invoice to correct an error — the backend
// transactionally removes the doc and returns its member authorisations to un-invoiced.
export async function deleteInvoice(invoiceID: string): Promise<void> {
  await httpsCallable(functions(), "deleteInvoice")({ invoiceId: invoiceID });
}

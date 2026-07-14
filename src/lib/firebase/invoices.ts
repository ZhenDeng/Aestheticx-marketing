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

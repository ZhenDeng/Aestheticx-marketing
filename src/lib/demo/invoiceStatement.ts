// Monthly statement of ISSUED invoice records (02/08 feedback): at month's end the
// practitioner sends out a list of every archived invoice of each type plus the total.
// Deleted invoices are gone from the store entirely, so "not deleted" is simply
// "present". Pure module — the billing page renders it and hands off CSV/email.
import type { Identity } from "./types";
import {
  formatAUD,
  isMatrixIssuer,
  resolveInvoiceKind,
  type Invoice,
  type InvoiceKind,
} from "./invoicing";
import { monthKey, monthLabel } from "./billing";
import { invoiceNumber } from "./invoicePdf";

export const STATEMENT_KIND_LABEL: Record<InvoiceKind, string> = {
  "client-invoice": "Client invoices",
  "service-fee": "Service fees",
  "client-sale": "Client sales",
  "top-up": "Top-ups",
  authorisation: "Authorisation invoices",
};

// Client-facing records lead; the legacy authorisation stream closes the statement.
const GROUP_ORDER: InvoiceKind[] = ["client-invoice", "service-fee", "client-sale", "top-up", "authorisation"];

/** Invoices ISSUED by this identity (not merely visible to it): authorisation invoices
 *  the doctor generated; matrix records whose issuing silo is the active identity.
 *  Drafts are excluded — they were never sent to anyone. */
export function issuedInvoices(invoices: Invoice[], identity: Identity): Invoice[] {
  return invoices.filter((i) => {
    if (i.draft) return false;
    if (resolveInvoiceKind(i) === "authorisation") {
      return identity.role === "doctor" && i.doctorID === identity.user.id;
    }
    return isMatrixIssuer(i, identity);
  });
}

export interface StatementGroup {
  kind: InvoiceKind;
  label: string;
  invoices: Invoice[];
  totalCents: number;
}

export interface MonthlyStatement {
  monthKey: string;
  groups: StatementGroup[];
  count: number;
  totalCents: number;
}

/** Months (UTC "YYYY-MM", newest first) in which this identity issued anything. */
export function statementMonths(invoices: Invoice[], identity: Identity): string[] {
  const keys = new Set(issuedInvoices(invoices, identity).map((i) => monthKey(i.createdAt)));
  return [...keys].sort().reverse();
}

/** Everything this identity issued in the month, grouped per invoice type with a
 *  per-type and overall total. */
export function monthlyStatement(invoices: Invoice[], identity: Identity, mk: string): MonthlyStatement {
  const inMonth = issuedInvoices(invoices, identity).filter((i) => monthKey(i.createdAt) === mk);
  const groups = GROUP_ORDER.flatMap((kind): StatementGroup[] => {
    const list = inMonth
      .filter((i) => resolveInvoiceKind(i) === kind)
      .sort((a, b) => a.createdAt - b.createdAt);
    if (list.length === 0) return [];
    return [{
      kind,
      label: STATEMENT_KIND_LABEL[kind],
      invoices: list,
      totalCents: list.reduce((s, i) => s + i.totalCents, 0),
    }];
  });
  return {
    monthKey: mk,
    groups,
    count: inMonth.length,
    totalCents: groups.reduce((s, g) => s + g.totalCents, 0),
  };
}

function dollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function isoDayOf(millis: number): string {
  return new Date(millis).toISOString().slice(0, 10);
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
}

/** The statement as a spreadsheet-friendly CSV (money in dollars; totals row last). */
export function statementCsv(statement: MonthlyStatement): string {
  const rows: string[][] = [["Type", "Date", "Invoice no", "Billed to", "Subtotal", "GST", "Total", "Status"]];
  for (const g of statement.groups) {
    for (const i of g.invoices) {
      rows.push([
        g.label,
        isoDayOf(i.createdAt),
        invoiceNumber(i.id),
        i.billTo?.businessName ?? "",
        dollars(i.subtotalCents),
        dollars(i.gstCents),
        dollars(i.totalCents),
        i.paid ? "Paid" : "Unpaid",
      ]);
    }
  }
  rows.push(["Total", "", "", `${statement.count} invoice(s)`, "", "", dollars(statement.totalCents), ""]);
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}

export function statementCsvFilename(mk: string): string {
  return `invoice-summary-${mk}.csv`;
}

export function statementEmailSubject(mk: string): string {
  return `Invoice summary — ${monthLabel(mk)}`;
}

/** Plain-text body for the month-end hand-off to the practitioner's own mail app
 *  (same doctrine as the per-invoice email: nothing is auto-sent by the server). */
export function statementEmailBody(statement: MonthlyStatement): string {
  const lines: string[] = [`Invoice summary — ${monthLabel(statement.monthKey)}`, ""];
  for (const g of statement.groups) {
    lines.push(`${g.label} (${g.invoices.length}) — ${formatAUD(g.totalCents)}`);
    for (const i of g.invoices) {
      lines.push(`  ${invoiceNumber(i.id)} · ${isoDayOf(i.createdAt)} · ${i.billTo?.businessName || "—"} · ${formatAUD(i.totalCents)}${i.paid ? " · paid" : ""}`);
    }
    lines.push("");
  }
  lines.push(`Total: ${statement.count} invoice(s) · ${formatAUD(statement.totalCents)}`);
  return lines.join("\n");
}

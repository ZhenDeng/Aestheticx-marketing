// Monthly statement of issued invoice records (02/08 feedback): per-type list + totals
// for everything the identity ISSUED in a month; deleted records simply aren't there.
import { describe, it, expect } from "vitest";
import { issuedInvoices, monthlyStatement, statementCsv, statementEmailBody, statementMonths } from "@/lib/demo/invoiceStatement";
import type { Invoice } from "@/lib/demo/invoicing";
import type { Identity } from "@/lib/demo/types";

const JUNE_10 = Date.UTC(2026, 5, 10);
const JUNE_20 = Date.UTC(2026, 5, 20);
const JULY_02 = Date.UTC(2026, 6, 2);

const sarah: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "independent" } };
const admin: Identity = { user: { id: "u-admin", name: "Ava Admin" }, role: "clinicAdmin", context: { kind: "clinic", clinic: { id: "clinic-lumiere", name: "Lumière" } } };

function invoice(over: Partial<Invoice>): Invoice {
  return {
    id: "inv-x", doctorID: "", counterpartyID: "p1", counterpartyType: "client",
    periodLabel: "2026-06-10", lines: [], subtotalCents: 10000, gstCents: 1000, totalCents: 11000,
    authorisationIDs: [], createdAt: JUNE_10, paid: false,
    kind: "client-invoice", issuerRef: { kind: "nurse", id: "u-sarah" }, patientID: "p1",
    billTo: { businessName: "Mia Park", abn: "", email: "mia@example.com" },
    ...over,
  };
}

const invoices: Invoice[] = [
  invoice({ id: "inv-1" }),                                                                 // June client invoice
  invoice({ id: "inv-2", createdAt: JUNE_20, totalCents: 5500, subtotalCents: 5000, gstCents: 500, paid: true }),
  invoice({ id: "inv-3", createdAt: JULY_02 }),                                             // July — other month
  invoice({ id: "inv-4", kind: "service-fee", counterpartyType: "clinic", counterpartyID: "clinic-lumiere", totalCents: 115500, billTo: { businessName: "Lumière", abn: "82601443218", email: "c@x.au" } }),
  invoice({ id: "inv-5", kind: "service-fee", draft: true }),                               // draft — never sent
  invoice({ id: "inv-6", issuerRef: { kind: "nurse", id: "u-other" } }),                    // someone else's
  invoice({ id: "inv-7", issuerRef: { kind: "clinic", id: "clinic-lumiere" } }),            // clinic-issued
];

describe("issuedInvoices", () => {
  it("keeps only the identity's issued, non-draft records", () => {
    const ids = issuedInvoices(invoices, sarah).map((i) => i.id);
    expect(ids).toEqual(["inv-1", "inv-2", "inv-3", "inv-4"]);
  });

  it("clinic context sees clinic-issued records, not the member's independent book", () => {
    expect(issuedInvoices(invoices, admin).map((i) => i.id)).toEqual(["inv-7"]);
  });
});

describe("monthlyStatement", () => {
  it("groups the month per type with per-type and overall totals", () => {
    const st = monthlyStatement(invoices, sarah, "2026-06");
    expect(st.groups.map((g) => g.kind)).toEqual(["client-invoice", "service-fee"]);
    expect(st.groups[0].invoices.map((i) => i.id)).toEqual(["inv-1", "inv-2"]);
    expect(st.groups[0].totalCents).toBe(16500);
    expect(st.groups[1].totalCents).toBe(115500);
    expect(st.count).toBe(3);
    expect(st.totalCents).toBe(16500 + 115500);
  });

  it("another month only carries that month's records; an empty month is empty", () => {
    expect(monthlyStatement(invoices, sarah, "2026-07").groups[0].invoices.map((i) => i.id)).toEqual(["inv-3"]);
    expect(monthlyStatement(invoices, sarah, "2026-01").count).toBe(0);
  });

  it("statementMonths lists issue months, newest first", () => {
    expect(statementMonths(invoices, sarah)).toEqual(["2026-07", "2026-06"]);
  });
});

describe("statement exports", () => {
  it("CSV carries one row per invoice plus a totals row, money in dollars", () => {
    const csv = statementCsv(monthlyStatement(invoices, sarah, "2026-06"));
    const rows = csv.split("\r\n");
    expect(rows[0]).toBe("Type,Date,Invoice no,Billed to,Subtotal,GST,Total,Status");
    expect(rows).toHaveLength(1 + 3 + 1);
    expect(rows[1]).toContain("Client invoices,2026-06-10,INV-");
    expect(rows[1]).toContain("Mia Park,100.00,10.00,110.00,Unpaid");
    expect(rows[2]).toContain("55.00,Paid");
    expect(rows[4]).toContain("Total,,,3 invoice(s),,,1320.00,");
  });

  it("CSV escapes commas/quotes in party names", () => {
    const st = monthlyStatement([invoice({ billTo: { businessName: 'Lee, "Jenn"', abn: "", email: "" } })], sarah, "2026-06");
    expect(statementCsv(st)).toContain('"Lee, ""Jenn"""');
  });

  it("email body lists each record and closes with the total", () => {
    const body = statementEmailBody(monthlyStatement(invoices, sarah, "2026-06"));
    expect(body).toContain("Invoice summary — June 2026");
    expect(body).toContain("Client invoices (2) — $165.00");
    expect(body).toContain("Service fees (1) — $1,155.00");
    expect(body).toContain("Total: 3 invoice(s) · $1,320.00");
  });
});

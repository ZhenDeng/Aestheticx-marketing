// The tax-invoice PDF's GST statement is conditional (spec: manual client invoicing, 2026-07-24):
// present when GST is charged, omitted for a no-GST invoice (which must not claim registration).
import { describe, expect, it } from "vitest";
import { buildTaxInvoiceModel } from "../invoicePdf";
import type { Invoice, InvoiceParty } from "../invoicing";

const issuer: InvoiceParty = { businessName: "Voss Aesthetics", abn: "51824753556", email: "" };
const billTo: InvoiceParty = { businessName: "Claire Donovan", abn: "", email: "" };

function invoice(gstCents: number): Invoice {
  return {
    id: "inv-1", doctorID: "", counterpartyID: "p1", counterpartyType: "client",
    periodLabel: "2026-07-24",
    lines: [{ authorisationID: "l1", dateISO: "", patientName: "", feeCents: 10000, gstCents, description: "Treatment", qty: 1, unitCents: 10000 }],
    subtotalCents: 10000, gstCents, totalCents: 10000 + gstCents, authorisationIDs: [],
    createdAt: 0, paid: false, kind: "client-invoice",
  };
}

describe("buildTaxInvoiceModel — GST statement", () => {
  it("states the total includes GST when GST is charged", () => {
    expect(buildTaxInvoiceModel(invoice(1000), issuer, billTo).taxStatement).toBe("The total price includes GST.");
  });
  it("omits the statement when no GST is charged", () => {
    expect(buildTaxInvoiceModel(invoice(0), issuer, billTo).taxStatement).toBeNull();
  });
});

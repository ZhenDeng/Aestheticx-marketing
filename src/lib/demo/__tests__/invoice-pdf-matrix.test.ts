// Matrix invoice kinds through the verified tax-invoice template (delta spec: invoicing —
// "Checkout-generated documents follow the structured tax-invoice layout").
import { describe, expect, it } from "vitest";
import { buildTaxInvoiceModel, renderTaxInvoicePdf } from "@/lib/demo/invoicePdf";
import { computeInclusiveTotals, type Invoice, type InvoiceParty } from "@/lib/demo/invoicing";
import { LUMIERE } from "@/lib/demo/accounts";

const sarahParty: InvoiceParty = { businessName: "Sarah Chen Aesthetics", abn: "12 345 678 901", email: "sarah@aesthetics.au", name: "Sarah Chen" };
const clinicParty: InvoiceParty = { businessName: "Lumière Clinic Pty Ltd", abn: "82 601 443 218", email: "accounts@lumiere.au", address: "2 Notts Ave, Bondi Beach NSW 2026" };
const clientParty: InvoiceParty = { businessName: "Claire Donovan", abn: "", email: "claire@example.com", address: "8 Beach Rd, Bondi NSW 2026" };

function matrixInvoice(over: Partial<Invoice>): Invoice {
  const computed = computeInclusiveTotals([{ id: "top-up", description: "Account top-up — pre-payment", qty: 1, unitCents: 400000 }]);
  return {
    id: "inv-topup-1", doctorID: "", counterpartyID: "p-claire", counterpartyType: "client",
    periodLabel: "2026-06-26", ...computed, authorisationIDs: [], createdAt: Date.UTC(2026, 5, 26), paid: true,
    kind: "top-up", issuerRef: { kind: "nurse", id: "u-sarah" }, patientID: "p-claire",
    giftCents: 100000, totalCreditCents: 500000, issuer: sarahParty, billTo: clientParty,
    ...over,
  };
}

// Decode every PDF text op ("(escaped) Tj") back to plain text for containment asserts.
function pdfText(bytes: Uint8Array): string {
  const raw = new TextDecoder("latin1").decode(bytes);
  return [...raw.matchAll(/\((?:[^()\\]|\\.)*\)\s*Tj/g)]
    .map((m) => m[0].replace(/\)\s*Tj$/, "").slice(1).replace(/\\([()\\])/g, "$1"))
    .join("\n");
}

describe("matrix line rendering", () => {
  it("uses the line's own description and quantity instead of the authorisation phrasing", () => {
    const inv = matrixInvoice({});
    const model = buildTaxInvoiceModel(inv, sarahParty, clientParty);
    expect(model.lines[0].description).toBe("Account top-up — pre-payment");
    expect(model.lines[0].qty).toBe("1");
  });

  it("renders a checkout quantity > 1 in the QTY column", () => {
    const computed = computeInclusiveTotals([{ id: "pl", description: "Anti-wrinkle — per area", qty: 3, unitCents: 45000 }]);
    const inv = matrixInvoice({ kind: "client-sale", giftCents: undefined, totalCreditCents: undefined, ...computed });
    const model = buildTaxInvoiceModel(inv, clinicParty, clientParty);
    expect(model.lines[0].qty).toBe("3");
    // Unit column shows the GST-inclusive unit price, amount the extended total.
    expect(model.lines[0].unit).toBe("$450.00");
    expect(model.lines[0].total).toBe("$1,350.00");
  });
});

describe("gift-credit footnote (spec: patient-wallet — GST-compliant top-up tax invoice)", () => {
  it("adds the non-taxable footnote naming gift and total wallet value", () => {
    const model = buildTaxInvoiceModel(matrixInvoice({}), sarahParty, clientParty);
    expect(model.footnote).toBe("Promotional Gift Credit Applied: $1,000.00 (Non-Taxable). Total Wallet Value Loaded: $5,000.00.");
  });

  it("omits the footnote when no gift applies", () => {
    const model = buildTaxInvoiceModel(matrixInvoice({ giftCents: 0, totalCreditCents: 400000 }), sarahParty, clientParty);
    expect(model.footnote).toBeUndefined();
  });

  it("renders the footnote row in the PDF with dashed numeric columns and paid-only totals", () => {
    const text = pdfText(renderTaxInvoicePdf(buildTaxInvoiceModel(matrixInvoice({}), sarahParty, clientParty)));
    expect(text).toContain("Promotional Gift Credit Applied: $1,000.00");
    expect(text).toContain("Total Wallet Value Loaded: $5,000.00");
    expect(text).toContain("$4,000.00"); // the paid-only TOTAL AMOUNT PAYABLE
    expect(text).not.toContain("$5,000.00 Tj"); // the gift never lands in a numeric cell
    expect(text).toContain("The total price includes GST.");
  });
});

describe("bill-to blocks by party type", () => {
  it("service-fee invoices stack the clinic's name, ABN, and address in the TO block", () => {
    const inv = matrixInvoice({
      kind: "service-fee", counterpartyID: LUMIERE.id, counterpartyType: "clinic",
      giftCents: undefined, totalCreditCents: undefined, issuer: sarahParty, billTo: clinicParty,
    });
    const model = buildTaxInvoiceModel(inv, sarahParty, clinicParty);
    expect(model.toName).toBe("Lumière Clinic Pty Ltd");
    expect(model.toDetails).toEqual(["ABN 82 601 443 218"]);
    expect(model.toAddressLines).toEqual(["2 Notts Ave", "Bondi Beach NSW 2026"]);
  });

  it("client bill-to blocks carry no ABN row at all", () => {
    const model = buildTaxInvoiceModel(matrixInvoice({}), sarahParty, clientParty);
    expect(model.toName).toBe("Claire Donovan");
    expect(model.toDetails).toEqual([]);
    const text = pdfText(renderTaxInvoicePdf(model));
    // The only ABN line is the seller's.
    expect(text.match(/ABN /g)?.length).toBe(1);
  });

  it("authorisation invoices state the buyer's ABN too — they are as B2B as a service fee", () => {
    // 22/07 feedback: the doctor's monthly clinic bill omitted it because the ABN row was
    // gated on kind === "service-fee".
    const inv = matrixInvoice({ kind: undefined, issuerRef: undefined, patientID: undefined, giftCents: undefined, totalCreditCents: undefined, counterpartyType: "clinic", counterpartyID: LUMIERE.id });
    const model = buildTaxInvoiceModel(inv, sarahParty, clinicParty);
    expect(model.toDetails).toEqual(["ABN 82 601 443 218"]);
    expect(model.footnote).toBeUndefined();
    const text = pdfText(renderTaxInvoicePdf(model));
    expect(text.match(/ABN /g)?.length).toBe(2); // the seller's and the buyer's
  });

  it("omits the buyer ABN row when the buyer has none — no em-dash placeholder", () => {
    // The em-dash fallback is an ATO requirement on the SELLER; inventing one for a buyer
    // would imply an ABN was sought and missing rather than not applicable.
    const model = buildTaxInvoiceModel(matrixInvoice({}), sarahParty, { ...clinicParty, abn: "" });
    expect(model.toDetails).toEqual([]);
  });
});

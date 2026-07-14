// Tax-invoice PDF (14/07 feedback) — ATO Example 2 layout: TAX INVOICE wording, seller
// identity + ABN, BUYER identity, issue date, per-line GST-inclusive pricing, total
// payable, and "The total price includes GST".
import { describe, expect, it } from "vitest";
import {
  buildTaxInvoiceModel,
  invoiceLineDate,
  invoiceLineDescription,
  invoiceNumber,
  renderTaxInvoicePdf,
  taxInvoicePdfFilename,
} from "@/lib/demo/invoicePdf";
import { invoicePartiesFor, invoicePartyFor, emptyState, generateInvoice, setScriptPrice, submitRequest, approveRequest } from "@/lib/demo/backend";
import { computeInvoice, GST_RATE, type Invoice, type InvoiceParty } from "@/lib/demo/invoicing";
import { buildSeedState, SEED_NOW } from "@/lib/demo/seed";
import { DEMO_ACCOUNTS, LUMIERE } from "@/lib/demo/accounts";
import type { Identity, MedicationItem } from "@/lib/demo/types";

const issuer: InvoiceParty = { businessName: "Voss Aesthetics", abn: "51 824 753 556", email: "" };
const billTo: InvoiceParty = { businessName: "Lumière Clinic Pty Ltd", abn: "82 601 443 218", email: "accounts@lumiere.au", address: "2 Notts Ave, Bondi Beach NSW 2026" };

function invoice(over: Partial<Invoice> = {}): Invoice {
  const computed = computeInvoice({
    pricePerScriptCents: 2500,
    gstRate: GST_RATE,
    authorisations: [
      { id: "a1", dateISO: "2026-06-20", patientName: "Amara Boyd" },
      { id: "a2", dateISO: "2026-06-01", patientName: "Claire Donovan" },
    ],
  });
  return {
    id: "inv-7", doctorID: "u-voss", counterpartyID: LUMIERE.id, counterpartyType: "clinic",
    periodLabel: "June 2026", ...computed, authorisationIDs: ["a1", "a2"],
    createdAt: Date.UTC(2026, 6, 14, 2, 0), paid: false, issuer, billTo, ...over,
  };
}

describe("line formatting", () => {
  it("formats the owner's description: 'date – patient treatment authorisation'", () => {
    expect(invoiceLineDescription({ authorisationID: "a", dateISO: "2026-06-20", patientName: "Amara Boyd", feeCents: 2500, gstCents: 250 }))
      .toBe("20/6/2026 – Amara Boyd treatment authorisation");
    expect(invoiceLineDate("2026-01-05")).toBe("5/1/2026");
  });
  it("numbers and names the file from the invoice id", () => {
    expect(invoiceNumber("inv-7")).toBe("INV-INV7");
    expect(taxInvoicePdfFilename("inv-7")).toBe("AestheticX-TaxInvoice-INV-INV7.pdf");
  });
});

describe("buildTaxInvoiceModel", () => {
  it("carries every ATO Example 2 element with GST shown per line", () => {
    const m = buildTaxInvoiceModel(invoice(), issuer, billTo);
    expect(m.issuer.abn).toBe("51 824 753 556");
    expect(m.billTo.businessName).toBe("Lumière Clinic Pty Ltd");
    expect(m.issuedText).toBe("14 Jul 2026");
    expect(m.lines[0]).toEqual({
      description: "20/6/2026 – Amara Boyd treatment authorisation",
      unit: "$25.00", gst: "$2.50", total: "$27.50",
    });
    // $25 + 10% GST per authorisation: 2 lines → $50 + $5 = $55.
    expect(m.subtotalText).toBe("$50.00");
    expect(m.gstText).toBe("$5.00");
    expect(m.totalText).toBe("$55.00");
  });
});

describe("renderTaxInvoicePdf", () => {
  it("produces a PDF whose text stream carries the Example 2 layout", () => {
    const bytes = renderTaxInvoicePdf(buildTaxInvoiceModel(invoice(), issuer, billTo));
    const file = new TextDecoder("latin1").decode(bytes);
    expect(file.startsWith("%PDF-1.4")).toBe(true);
    for (const needle of [
      "TAX INVOICE",
      "Voss Aesthetics", "ABN 51 824 753 556",
      "Lumi\xe8re Clinic Pty Ltd, 2 Notts Ave, Bondi Beach NSW 2026", // buyer identity + address
      "14 Jul 2026", "INV-INV7",
      "20/6/2026 \x96 Amara Boyd treatment authorisation", // en dash → WinAnsi 0x96
      "1 \xd7 $25.00 + GST $2.50 = $27.50 incl. GST",
      "GST \\(10%\\)", // parens are PDF-string-escaped in the stream
      "TOTAL AMOUNT PAYABLE", "$55.00",
      "The total price includes GST.",
    ]) {
      expect(file).toContain(needle);
    }
  });
});

describe("invoice party resolution + demo snapshot", () => {
  const med: MedicationItem = { name: "Profhilo", dosage: "2", category: "skinBooster", unit: "millilitres", areas: [], route: "subcutaneous" };
  const sarahClinic: Identity = DEMO_ACCOUNTS[0].identities[1];
  const voss: Identity = DEMO_ACCOUNTS[2].identities[0];

  it("resolves parties from active business entities, name-falling-back to accounts", () => {
    const seeded = buildSeedState();
    expect(invoicePartyFor(seeded, "doctor", "u-voss")).toEqual({ businessName: "Voss Aesthetics", abn: "51824753556", email: "" });
    // The seeded clinic entity deliberately has a blank ABN (the admin-editor demo gap).
    expect(invoicePartyFor(seeded, "clinic", LUMIERE.id).businessName).toBe("Lumière");
    expect(invoicePartyFor(emptyState(), "nurse", "u-sarah").businessName).toBe("Sarah Chen");
  });

  it("demo generateInvoice freezes issuer/billTo snapshots (backend Tier 3 #4 parity)", () => {
    let state = buildSeedState();
    const patient = Object.values(state.patients).find((p) => p.owner.kind === "clinic");
    if (!patient) throw new Error("no clinic patient");
    const submitted = submitRequest(state, { patientID: patient.id, doctorID: "u-voss", items: [med], identity: sarahClinic }, SEED_NOW);
    const approved = approveRequest(submitted.state, submitted.request.id, voss, SEED_NOW);
    state = setScriptPrice(approved.state, "u-voss", LUMIERE.id, 3000);
    const { invoice: inv, state: after } = generateInvoice(
      state,
      { doctorID: "u-voss", counterpartyID: LUMIERE.id, counterpartyType: "clinic", periodLabel: "June 2026", authIDs: approved.granted.map((a) => a.id) },
      voss, SEED_NOW,
    );
    expect(inv.issuer?.businessName).toBe("Voss Aesthetics");
    expect(inv.billTo?.businessName).toBe("Lumière");
    expect(inv.lines[0].feeCents).toBe(3000); // doctor-set price honoured
    expect(invoicePartiesFor(after, inv).issuer.businessName).toBe("Voss Aesthetics");
    // Legacy invoice without snapshots resolves at render time.
    expect(invoicePartiesFor(after, { ...inv, issuer: undefined, billTo: undefined }).billTo.businessName).toBe("Lumière");
  });
});

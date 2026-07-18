// Tax-invoice PDF (14/07 feedback) — ATO Example 2 layout: TAX INVOICE wording, seller
// identity + ABN, BUYER identity, issue date, per-line GST-inclusive pricing, total
// payable, and "The total price includes GST".
import { describe, expect, it } from "vitest";
import {
  addressLines,
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

describe("addressLines", () => {
  it("splits an address into one line per comma group", () => {
    expect(addressLines("Internal Clinic, Chatswood Westfield, Chatswood NSW 2067"))
      .toEqual(["Internal Clinic", "Chatswood Westfield", "Chatswood NSW 2067"]);
    expect(addressLines("12 Hall St")).toEqual(["12 Hall St"]); // no commas → single line
    expect(addressLines(" a ,  , b ")).toEqual(["a", "b"]); // trims, drops empties
    expect(addressLines(undefined)).toEqual([]);
    expect(addressLines("")).toEqual([]);
  });

  it("keeps numeric commas intact — only a comma followed by whitespace separates", () => {
    expect(addressLines("Suite 1,200 George St, Sydney NSW 2000"))
      .toEqual(["Suite 1,200 George St", "Sydney NSW 2000"]);
  });
});

// 17/07 feedback: the model pre-assembles the vertical blocks so the renderer is a
// dumb line printer — seller lead / trading name / detail lines, TO name + address lines.
describe("buildTaxInvoiceModel blocks", () => {
  it("assembles the seller block: name, trading name, ABN, address, email — one line each", () => {
    const m = buildTaxInvoiceModel(
      invoice(),
      { ...issuer, name: "Dr Elena Voss", address: "88 Oxford St, Paddington NSW 2021", email: "voss@example.com" },
      billTo,
    );
    expect(m.sellerLead).toBe("Dr Elena Voss");
    expect(m.sellerBusiness).toBe("Voss Aesthetics");
    expect(m.sellerDetails).toEqual([
      "ABN 51 824 753 556",
      "88 Oxford St",
      "Paddington NSW 2021",
      "voss@example.com",
    ]);
  });

  it("promotes the trading name to the lead and omits absent lines on a legacy snapshot", () => {
    const m = buildTaxInvoiceModel(invoice(), issuer, billTo); // no name/address/email
    expect(m.sellerLead).toBe("Voss Aesthetics");
    expect(m.sellerBusiness).toBeNull();
    expect(m.sellerDetails).toEqual(["ABN 51 824 753 556"]);
  });

  it("keeps the ABN line visible as an em dash when blank (ATO-required element)", () => {
    const m = buildTaxInvoiceModel(invoice(), { businessName: "X", abn: "", email: "" }, billTo);
    expect(m.sellerDetails).toEqual(["ABN —"]);
  });

  it("assembles the TO block: recipient name, then the address split across lines", () => {
    const m = buildTaxInvoiceModel(invoice(), issuer, billTo);
    expect(m.toName).toBe("Lumière Clinic Pty Ltd");
    expect(m.toAddressLines).toEqual(["2 Notts Ave", "Bondi Beach NSW 2026"]);
  });

  it("prefers the bill-to person name and tolerates a missing address", () => {
    const m = buildTaxInvoiceModel(invoice(), issuer, { businessName: "Sarah Chen Aesthetics", abn: "", email: "", name: "Sarah Chen" });
    expect(m.toName).toBe("Sarah Chen");
    expect(m.toAddressLines).toEqual([]);
  });

  it("never prints the identity twice when name equals business name", () => {
    const m = buildTaxInvoiceModel(invoice(), { businessName: "Sarah Chen", abn: "", email: "", name: "Sarah Chen" }, billTo);
    expect(m.sellerLead).toBe("Sarah Chen");
    expect(m.sellerBusiness).toBeNull();
  });

  it("leads with an em dash when a party is entirely empty", () => {
    const empty = { businessName: "", abn: "", email: "" };
    const m = buildTaxInvoiceModel(invoice(), empty, empty);
    expect(m.sellerLead).toBe("—");
    expect(m.toName).toBe("—");
    expect(() => renderTaxInvoicePdf(m)).not.toThrow();
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
      qty: "1", unit: "$25.00", gst: "$2.50", total: "$27.50",
    });
    // $25 + 10% GST per authorisation: 2 lines → $50 + $5 = $55.
    expect(m.subtotalText).toBe("$50.00");
    expect(m.gstText).toBe("$5.00");
    expect(m.totalText).toBe("$55.00");
  });
});

describe("renderTaxInvoicePdf", () => {
  const render = (inv: Invoice = invoice()): string =>
    new TextDecoder("latin1").decode(renderTaxInvoicePdf(buildTaxInvoiceModel(inv, issuer, billTo)));
  /** Per-page content streams (uncompressed, so directly greppable). */
  const streams = (file: string): string[] =>
    Array.from(file.matchAll(/stream\n([\s\S]*?)\nendstream/g), (m) => m[1]);
  /** Tm x-coordinates of every glyph run whose literal string is exactly `text`. */
  const tmXs = (file: string, text: string): number[] =>
    Array.from(
      file.matchAll(new RegExp(`1 0 0 1 ([\\d.]+) [\\d.]+ Tm \\(${text.replace(/[$().]/g, "\\$&")}\\) Tj`, "g")),
      (m) => Number(m[1]),
    );

  it("produces a PDF whose text stream carries every ATO Example 2 element", () => {
    const file = render();
    expect(file.startsWith("%PDF-1.4")).toBe(true);
    for (const needle of [
      "TAX INVOICE",
      "Voss Aesthetics", "ABN 51 824 753 556",
      "(Lumi\xe8re Clinic Pty Ltd) Tj", // buyer identity — its own line now
      "14 Jul 2026", "INV-INV7",
      "20/6/2026 \x96 Amara Boyd treatment authorisation", // en dash → WinAnsi 0x96
      "($25.00) Tj", "($2.50) Tj", "($27.50) Tj", // unit / GST / GST-inclusive amount cells
      "GST \\(10%\\)", // parens are PDF-string-escaped in the stream
      "TOTAL AMOUNT PAYABLE", "$55.00",
      "The total price includes GST.",
    ]) {
      expect(file).toContain(needle);
    }
  });

  // ——— 17/07 feedback: header metadata top-right, vertical identity blocks ———

  /** Tm y-coordinates (PDF bottom-up: larger = higher on the page) for glyph runs of `text`. */
  const tmYs = (file: string, text: string): number[] =>
    Array.from(
      file.matchAll(new RegExp(`1 0 0 1 [\\d.]+ ([\\d.]+) Tm \\(${text.replace(/[$().]/g, "\\$&")}\\) Tj`, "g")),
      (m) => Number(m[1]),
    );

  it("positions DATE ISSUED and INVOICE NUMBER in the top-right corner, title at the left margin", () => {
    const file = render();
    expect(tmXs(file, "TAX INVOICE")[0]).toBe(56); // title anchored at the left margin
    // Right-aligned metadata: labels and values all land in the right half of the page.
    for (const text of ["DATE ISSUED", "INVOICE NUMBER", "14 Jul 2026", "INV-INV7", "June 2026"]) {
      const xs = tmXs(file, text);
      expect(xs.length, text).toBeGreaterThan(0);
      expect(Math.min(...xs), text).toBeGreaterThan(297.64); // page midline
    }
    // Top-aligned with the title band: the first kicker's baseline sits ABOVE the 23pt
    // title's baseline — the metadata block fills the corner whitespace, not the line below.
    expect(tmYs(file, "DATE ISSUED")[0]).toBeGreaterThan(tmYs(file, "TAX INVOICE")[0]);
  });

  it("wraps an unbroken long token (email) instead of overflowing the page edge", () => {
    const longEmail = `${"billing-and-accounts-receivable".repeat(4)}@example.com`; // ≈ 700pt at 10pt — wider than the 483pt content width
    const m = buildTaxInvoiceModel(invoice(), { ...issuer, email: longEmail }, billTo);
    const file = new TextDecoder("latin1").decode(renderTaxInvoicePdf(m));
    // The token is split across runs: no single glyph run carries the full string…
    expect(file).not.toContain(`(${longEmail}) Tj`);
    // …and nothing was dropped (the tail of the address survives).
    expect(file).toContain("@example.com");
  });

  it("never draws an orphan table-header band without at least one row under it", () => {
    // Sweep seller-block heights across the page boundary so some N parks the cursor
    // in the orphan window (band fits, no row does) — the guard must hold for all.
    for (let n = 45; n <= 68; n += 1) {
      const m = buildTaxInvoiceModel(
        invoice(),
        { ...issuer, address: Array.from({ length: n }, (_, i) => `Line ${i + 1}`).join(", ") },
        billTo,
      );
      const file = new TextDecoder("latin1").decode(renderTaxInvoicePdf(m));
      for (const s of streams(file)) {
        if (s.includes("(DESCRIPTION) Tj")) {
          expect(s, `seller block of ${n} lines`).toContain("treatment authorisation");
        }
      }
    }
  });

  it("renders the seller block one line per element at the left margin", () => {
    const rich = buildTaxInvoiceModel(
      invoice(),
      { ...issuer, name: "Dr Elena Voss", address: "88 Oxford St, Paddington NSW 2021", email: "voss@example.com" },
      billTo,
    );
    const file = new TextDecoder("latin1").decode(renderTaxInvoicePdf(rich));
    for (const line of ["Dr Elena Voss", "Voss Aesthetics", "ABN 51 824 753 556", "88 Oxford St", "Paddington NSW 2021", "voss@example.com"]) {
      expect(file).toContain(`(${line}) Tj`); // own glyph run — no comma-joins
      expect(tmXs(file, line)[0], line).toBe(56); // left margin
    }
  });

  it("renders the TO block with the name and address on separate lines, never merged", () => {
    const file = render();
    expect(file).toContain("(TO) Tj");
    for (const line of ["Lumi\xe8re Clinic Pty Ltd", "2 Notts Ave", "Bondi Beach NSW 2026"]) {
      expect(file).toContain(`(${line}) Tj`);
    }
    expect(file).not.toContain("Lumi\xe8re Clinic Pty Ltd, 2 Notts Ave"); // the old single-row clump
  });

  it("draws the bordered table: column headers, frame/rule ops, qty 1 per script", () => {
    const file = render();
    for (const label of ["DESCRIPTION", "QTY", "UNIT", "GST", "AMOUNT"]) {
      expect(file).toContain(`(${label}) Tj`);
    }
    expect(file).toContain(" re S"); // outer frame + TOTAL band rectangles
    expect(file).toContain(" l S"); // horizontal rules + column separators
    expect(file).toContain("(1) Tj"); // per-script invoicing: qty is always 1
  });

  it("right-aligns the numeric cells within their columns", () => {
    const file = render();
    const [unitX] = tmXs(file, "$25.00");
    const [gstX] = tmXs(file, "$2.50");
    const [amountX] = tmXs(file, "$27.50");
    // Right alignment puts each value at (column right edge − text width), so the
    // three cells land at strictly increasing x, all right of the description column.
    expect(unitX).toBeGreaterThan(56 + 483.28 * 0.55);
    expect(gstX).toBeGreaterThan(unitX);
    expect(amountX).toBeGreaterThan(gstX);
  });

  it("wraps a long description inside its column instead of spilling across the table", () => {
    const base = invoice();
    const file = render({
      ...base,
      lines: [{ ...base.lines[0], patientName: "Alexandrina Wolstenholme-Featherstonehaugh of Bondi Peninsula" }],
    });
    // The row wrapped: the full description is never a single glyph run…
    expect(file).not.toContain("Peninsula treatment authorisation) Tj");
    // …but nothing was dropped.
    expect(file).toContain("authorisation");
    expect(file).toContain("Peninsula");
  });

  it("paginates a 40-line invoice and re-draws the header band on the next page", () => {
    const auths = Array.from({ length: 40 }, (_, i) => ({ id: `a${i}`, dateISO: "2026-06-20", patientName: `Patient ${i + 1}` }));
    const computed = computeInvoice({ pricePerScriptCents: 2500, gstRate: GST_RATE, authorisations: auths });
    const file = render(invoice({ ...computed, authorisationIDs: auths.map((a) => a.id) }));
    const pageCount = (file.match(/\/Type \/Page \/Parent/g) || []).length;
    expect(pageCount).toBeGreaterThanOrEqual(2);
    const pagesWithHeader = streams(file).filter((s) => s.includes("(DESCRIPTION) Tj"));
    expect(pagesWithHeader.length).toBe(pageCount); // header band repeats on every table page
    expect(file).toContain("Patient 40 treatment authorisation"); // last row survived the break
    expect(file).toContain("The total price includes GST."); // footer still lands after the table
  });
});

describe("invoice party resolution + demo snapshot", () => {
  const med: MedicationItem = { name: "Profhilo", dosage: "2", category: "skinBooster", unit: "millilitres", areas: [], route: "subcutaneous" };
  const sarahClinic: Identity = DEMO_ACCOUNTS[0].identities[1];
  const voss: Identity = DEMO_ACCOUNTS[2].identities[0];

  it("resolves parties from active business entities, name-falling-back to accounts", () => {
    const seeded = buildSeedState();
    expect(invoicePartyFor(seeded, "doctor", "u-voss").businessName).toBe("Voss Aesthetics");
    expect(invoicePartyFor(seeded, "doctor", "u-voss").abn).toBe("51824753556");
    // The seeded clinic entity deliberately has a blank ABN (the admin-editor demo gap).
    expect(invoicePartyFor(seeded, "clinic", LUMIERE.id).businessName).toBe("Lumière");
    expect(invoicePartyFor(emptyState(), "nurse", "u-sarah").businessName).toBe("Sarah Chen");
  });

  // 17/07 feedback: the seller/TO blocks need person name, address, and email lines —
  // fill them from hydrated state where knowable (snapshots still win for live invoices).
  it("enriches parties with person name, address, and email where knowable", () => {
    const seeded = buildSeedState();
    const doctor = invoicePartyFor(seeded, "doctor", "u-voss");
    expect(doctor.name).toBe("Dr Elena Voss");
    expect(doctor.businessName).toBe("Voss Aesthetics");
    // Profile address is blank for Voss — the principal place of practice stands in.
    expect(doctor.address).toBe("A. Voss Medical, 88 Oxford St, Paddington NSW 2021");
    const clinic = invoicePartyFor(seeded, "clinic", LUMIERE.id);
    expect(clinic.name).toBeUndefined(); // a clinic has no person line
    expect(clinic.address).toBe("2 Notts Ave, Bondi Beach NSW 2026");
    const nurse = invoicePartyFor(seeded, "nurse", "u-sarah");
    expect(nurse.name).toBe("Sarah Chen");
    // Nurse address = active premise, name-first so the TO block splits into location lines.
    expect(nurse.address).toBe("Sarah Chen Aesthetics, 12 Hall St, Bondi Beach NSW 2026");
  });

  it("keeps absent data empty rather than fabricated", () => {
    const p = invoicePartyFor(emptyState(), "nurse", "u-sarah");
    expect(p.address).toBeUndefined();
    expect(p.email).toBe("");
  });

  // Engineer review 17/07: the seller address on a distributed financial document is the
  // BUSINESS address — the principal place of practice outranks the personal profile address.
  it("prefers the doctor's principal place of practice over the profile address", () => {
    const seeded = buildSeedState();
    const state = {
      ...seeded,
      profileByUser: {
        ...seeded.profileByUser,
        "u-voss": { ...seeded.profileByUser["u-voss"], address: "7 Home St, St Kilda VIC 3182" },
      },
    };
    expect(invoicePartyFor(state, "doctor", "u-voss").address)
      .toBe("A. Voss Medical, 88 Oxford St, Paddington NSW 2021");
  });

  it("falls back to the nurse's profile address when no premise exists", () => {
    const seeded = buildSeedState();
    const state = {
      ...seeded,
      profileByUser: {
        ...seeded.profileByUser,
        "u-sarah": { ...seeded.profileByUser["u-sarah"], premises: [], address: "3/21 Crown St, Surry Hills NSW 2010" },
      },
    };
    expect(invoicePartyFor(state, "nurse", "u-sarah").address).toBe("3/21 Crown St, Surry Hills NSW 2010");
  });

  it("resolves no address for a clinic that is not the demo cast's", () => {
    expect(invoicePartyFor(buildSeedState(), "clinic", "clinic-other").address).toBeUndefined();
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

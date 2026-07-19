// Money math for the billing matrix (spec: client-checkout / patient-wallet).
// B2C retail amounts are GST-INCLUSIVE: the priced amount is what the client pays,
// GST component = round(total/11). The B2B service-fee stream keeps the existing
// exclusive computeInvoice convention.
import { describe, expect, it } from "vitest";
import { computeInclusiveTotals, resolveInvoiceKind, type Invoice } from "../invoicing";

describe("computeInclusiveTotals", () => {
  it("splits a single GST-inclusive amount into net + GST (paid $4,000 → GST $363.64)", () => {
    const r = computeInclusiveTotals([{ id: "l1", description: "Account top-up", qty: 1, unitCents: 400000 }]);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].gstCents).toBe(36364); // round(400000/11)
    expect(r.lines[0].feeCents).toBe(363636); // net = inclusive − GST
    expect(r.subtotalCents).toBe(363636);
    expect(r.gstCents).toBe(36364);
    expect(r.totalCents).toBe(400000); // client pays exactly the inclusive amount
  });

  it("multiplies quantity before splitting GST", () => {
    const r = computeInclusiveTotals([{ id: "l1", description: "Anti-wrinkle area", qty: 3, unitCents: 33000 }]);
    expect(r.totalCents).toBe(99000);
    expect(r.lines[0].gstCents).toBe(9000); // round(99000/11)
    expect(r.lines[0].feeCents).toBe(90000);
    expect(r.lines[0].qty).toBe(3);
    expect(r.lines[0].unitCents).toBe(33000);
  });

  it("sums multiple lines and keeps per-line rounding consistent (total = Σ inclusive amounts)", () => {
    const r = computeInclusiveTotals([
      { id: "a", description: "Consult", qty: 1, unitCents: 15000 },
      { id: "b", description: "Skin serum", qty: 2, unitCents: 9500 },
    ]);
    expect(r.totalCents).toBe(15000 + 19000);
    expect(r.gstCents).toBe(Math.round(15000 / 11) + Math.round(19000 / 11));
    expect(r.subtotalCents).toBe(r.totalCents - r.gstCents);
  });

  it("rejects empty input and non-positive amounts", () => {
    expect(() => computeInclusiveTotals([])).toThrow();
    expect(() => computeInclusiveTotals([{ id: "x", description: "bad", qty: 0, unitCents: 100 }])).toThrow();
    expect(() => computeInclusiveTotals([{ id: "x", description: "bad", qty: 1, unitCents: 0 }])).toThrow();
    expect(() => computeInclusiveTotals([{ id: "x", description: "bad", qty: 1.5, unitCents: 100 }])).toThrow();
  });
});

describe("resolveInvoiceKind", () => {
  const base = {
    id: "inv-1", doctorID: "u-doc", counterpartyID: "u-nurse", counterpartyType: "nurse",
    periodLabel: "July 2026", lines: [], subtotalCents: 0, gstCents: 0, totalCents: 0,
    authorisationIDs: [], createdAt: 0, paid: false,
  } as unknown as Invoice;

  it("treats a legacy invoice without kind as an authorisation invoice", () => {
    expect(resolveInvoiceKind(base)).toBe("authorisation");
  });

  it("returns the stored kind for matrix invoices", () => {
    expect(resolveInvoiceKind({ ...base, kind: "client-sale" })).toBe("client-sale");
    expect(resolveInvoiceKind({ ...base, kind: "service-fee" })).toBe("service-fee");
    expect(resolveInvoiceKind({ ...base, kind: "top-up" })).toBe("top-up");
  });
});

import { describe, it, expect } from "vitest";
import {
  computeInvoice, selectableForInvoice, formatAUD, invoicesFor, DEFAULT_SCRIPT_PRICE_CENTS, GST_RATE,
} from "@/lib/demo/invoicing";
import type { Invoice } from "@/lib/demo/invoicing";
import type { Identity } from "@/lib/demo/types";

describe("computeInvoice", () => {
  it("computes per-line fee + GST and totals (one $25 script)", () => {
    const r = computeInvoice({ pricePerScriptCents: DEFAULT_SCRIPT_PRICE_CENTS, gstRate: GST_RATE,
      authorisations: [{ id: "a1", dateISO: "2026-06-26", patientName: "Mara Boyd" }] });
    expect(r.subtotalCents).toBe(2500);
    expect(r.gstCents).toBe(250);
    expect(r.totalCents).toBe(2750);
    expect(r.lines[0].authorisationID).toBe("a1");
  });
  it("sums multiple lines", () => {
    const r = computeInvoice({ pricePerScriptCents: 2500, gstRate: GST_RATE,
      authorisations: [{ id: "a", dateISO: "d", patientName: "n" }, { id: "b", dateISO: "d", patientName: "n" }] });
    expect(r.totalCents).toBe(5500);
  });
  it("throws on a non-positive price", () => {
    expect(() => computeInvoice({ pricePerScriptCents: 0, gstRate: GST_RATE, authorisations: [] })).toThrow();
  });
});

describe("selectableForInvoice", () => {
  it("keeps same-counterparty, same-month, un-invoiced", () => {
    const auths = [
      { id: "a", counterpartyID: "c1", monthKey: "2026-06", invoiced: false },
      { id: "b", counterpartyID: "c1", monthKey: "2026-06", invoiced: true },
      { id: "c", counterpartyID: "c2", monthKey: "2026-06", invoiced: false },
      { id: "d", counterpartyID: "c1", monthKey: "2026-05", invoiced: false },
    ];
    expect(selectableForInvoice(auths, { counterpartyID: "c1", monthKey: "2026-06" }).map((a) => a.id)).toEqual(["a"]);
  });
});

describe("formatAUD", () => {
  it("formats cents as AUD", () => {
    expect(formatAUD(2750)).toBe("$27.50");
    expect(formatAUD(123456)).toBe("$1,234.56");
    expect(formatAUD(0)).toBe("$0.00");
  });
});

describe("invoicesFor", () => {
  const inv = (over: Partial<Invoice>): Invoice => ({
    id: "i", doctorID: "u-voss", counterpartyID: "clinic-lumiere", counterpartyType: "clinic",
    periodLabel: "June 2026", lines: [], subtotalCents: 2500, gstCents: 250, totalCents: 2750,
    authorisationIDs: ["a"], createdAt: 1, ...over,
  });
  const doctor: Identity = { user: { id: "u-voss", name: "V" }, role: "doctor", context: { kind: "independent" } };
  const admin: Identity = { user: { id: "u-ava", name: "A" }, role: "clinicAdmin", context: { kind: "clinic", clinic: { id: "clinic-lumiere", name: "Lumière" } } };
  it("scopes by doctor and by clinic counterparty", () => {
    expect(invoicesFor([inv({})], doctor)).toHaveLength(1);
    expect(invoicesFor([inv({})], admin)).toHaveLength(1);
    expect(invoicesFor([inv({ counterpartyID: "other" })], admin)).toHaveLength(0);
  });
});

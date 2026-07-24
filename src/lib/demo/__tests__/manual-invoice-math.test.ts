// Manual client-invoice GST math (spec: manual client invoicing, 2026-07-24).
import { describe, expect, it } from "vitest";
import { computeManualInvoice } from "../invoicing";

const line = (amountCents: number, id = "l1", description = "Treatment") => ({ id, description, amountCents });

describe("computeManualInvoice", () => {
  it("no GST: gst is zero, total equals the sum of amounts", () => {
    const r = computeManualInvoice([line(10000)], { chargeGst: false, gstIncluded: false });
    expect(r.gstCents).toBe(0);
    expect(r.subtotalCents).toBe(10000);
    expect(r.totalCents).toBe(10000);
    expect(r.lines[0].gstCents).toBe(0);
    expect(r.lines[0].feeCents).toBe(10000);
    expect(r.lines[0].unitCents).toBe(10000);
    expect(r.lines[0].qty).toBe(1);
    expect(r.lines[0].description).toBe("Treatment");
  });

  it("GST included: gst = round(amount/11), net = amount - gst, total = amount", () => {
    const r = computeManualInvoice([line(11000)], { chargeGst: true, gstIncluded: true });
    expect(r.gstCents).toBe(1000);
    expect(r.subtotalCents).toBe(10000);
    expect(r.totalCents).toBe(11000);
    expect(r.lines[0].unitCents).toBe(11000); // the typed (gross) figure shows as unit
  });

  it("GST on top: net = amount, gst = round(amount*0.1), total = amount*1.1", () => {
    const r = computeManualInvoice([line(10000)], { chargeGst: true, gstIncluded: false });
    expect(r.gstCents).toBe(1000);
    expect(r.subtotalCents).toBe(10000);
    expect(r.totalCents).toBe(11000);
    expect(r.lines[0].unitCents).toBe(10000);
  });

  it("sums and rounds per line across multiple lines", () => {
    const r = computeManualInvoice(
      [line(9999, "a"), line(1, "b", "Other")],
      { chargeGst: true, gstIncluded: false },
    );
    expect(r.subtotalCents).toBe(10000);
    expect(r.gstCents).toBe(Math.round(9999 * 0.1) + Math.round(1 * 0.1)); // 1000 + 0 = 1000
    expect(r.totalCents).toBe(11000);
  });

  it("rejects an empty set and non-positive / non-integer amounts", () => {
    expect(() => computeManualInvoice([], { chargeGst: true, gstIncluded: true })).toThrow();
    expect(() => computeManualInvoice([line(0)], { chargeGst: false, gstIncluded: false })).toThrow();
    expect(() => computeManualInvoice([line(-5)], { chargeGst: false, gstIncluded: false })).toThrow();
    expect(() => computeManualInvoice([line(10.5)], { chargeGst: false, gstIncluded: false })).toThrow();
  });
});

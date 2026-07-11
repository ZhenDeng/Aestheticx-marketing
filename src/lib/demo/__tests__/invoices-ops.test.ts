import { describe, it, expect } from "vitest";
import { emptyState, submitRequest, approveRequest, setScriptPrice, generateInvoice, markInvoicePaid, billableAuthorisations } from "@/lib/demo/backend";
import type { DemoState, Identity, Patient } from "@/lib/demo/types";

const NOW = Date.UTC(2026, 5, 26);
const voss: Identity = { user: { id: "u-voss", name: "Dr Elena Voss" }, role: "doctor", context: { kind: "independent" } };
const sarah: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "independent" } };
function patient(id: string): Patient {
  return { id, givenName: "Mara", lastName: "Boyd", dateOfBirth: { year: 1990, month: 1, day: 1 },
    gender: "F", address: "x", phone: "x", email: "x", allergies: "x", currentMedications: "x",
    owner: { kind: "nurse", id: "u-sarah" }, prescribingDoctorIDs: [] };
}
function approved(): DemoState {
  let s: DemoState = { ...emptyState(), patients: { p1: patient("p1") } };
  const r = submitRequest(s, { patientID: "p1", doctorID: "u-voss",
    items: [{ name: "Profhilo", dosage: "2", category: "skinBooster", unit: "millilitres", areas: [] }], identity: sarah }, NOW);
  s = approveRequest(r.state, r.request.id, voss, NOW).state;
  return s;
}

describe("setScriptPrice", () => {
  it("stores a per-counterparty price", () => {
    const s = setScriptPrice(emptyState(), "u-voss", "u-sarah", 3000);
    expect(s.scriptPricing["u-voss_u-sarah"]).toBe(3000);
  });
  it("rejects a non-positive price", () => {
    expect(() => setScriptPrice(emptyState(), "u-voss", "u-sarah", 0)).toThrow();
  });
});

describe("billableAuthorisations", () => {
  it("lists the doctor's approved un-invoiced auths with counterparty + month", () => {
    const rows = billableAuthorisations(approved(), "u-voss");
    expect(rows).toHaveLength(1);
    expect(rows[0].counterpartyID).toBe("u-sarah");
    expect(rows[0].counterpartyType).toBe("nurse");
    expect(rows[0].monthKey).toBe("2026-06");
    expect(rows[0].invoiced).toBe(false);
    expect(rows[0].patientName).toContain("Mara");
  });
});

describe("generateInvoice", () => {
  it("computes totals, records the invoice, and marks the auths invoiced", () => {
    const s0 = approved();
    const authID = billableAuthorisations(s0, "u-voss")[0].id;
    const { state, invoice } = generateInvoice(s0, {
      doctorID: "u-voss", counterpartyID: "u-sarah", counterpartyType: "nurse",
      periodLabel: "June 2026", authIDs: [authID],
    }, voss, NOW);
    expect(invoice.totalCents).toBe(2750); // $25 + 10% GST
    expect(state.invoices).toHaveLength(1);
    expect(state.invoices[0].paid).toBe(false); // starts unpaid (Tier 3 #6)
    expect(state.authorisations[authID].invoiced).toBe(true);
    expect(billableAuthorisations(state, "u-voss")).toHaveLength(0); // dropped from billable
  });
  it("uses a per-counterparty price override", () => {
    const s = setScriptPrice(approved(), "u-voss", "u-sarah", 4000);
    const authID = billableAuthorisations(s, "u-voss")[0].id;
    const { invoice } = generateInvoice(s, { doctorID: "u-voss", counterpartyID: "u-sarah", counterpartyType: "nurse", periodLabel: "June 2026", authIDs: [authID] }, voss, NOW);
    expect(invoice.subtotalCents).toBe(4000);
    expect(invoice.totalCents).toBe(4400);
  });
  it("throws when nothing is selectable", () => {
    expect(() => generateInvoice(approved(), { doctorID: "u-voss", counterpartyID: "u-sarah", counterpartyType: "nurse", periodLabel: "x", authIDs: ["nope"] }, voss, NOW)).toThrow();
  });
});

describe("markInvoicePaid (Tier 3 #6)", () => {
  function withInvoice(): { state: DemoState; invoiceID: string } {
    const s0 = approved();
    const authID = billableAuthorisations(s0, "u-voss")[0].id;
    const { state, invoice } = generateInvoice(s0, {
      doctorID: "u-voss", counterpartyID: "u-sarah", counterpartyType: "nurse", periodLabel: "June 2026", authIDs: [authID],
    }, voss, NOW);
    return { state, invoiceID: invoice.id };
  }

  it("marks the invoice paid, recording when and who", () => {
    const { state, invoiceID } = withInvoice();
    const paidAtNow = NOW + 5000;
    const next = markInvoicePaid(state, invoiceID, voss, paidAtNow);
    const inv = next.invoices.find((i) => i.id === invoiceID)!;
    expect(inv.paid).toBe(true);
    expect(inv.paidAt).toBe(paidAtNow);
    expect(inv.markedBy).toBe("u-voss");
    // writes a §21 audit entry
    expect(Object.values(next.auditLogByID).some((e) => e.action === "invoice_marked_paid" && e.targetID === invoiceID)).toBe(true);
  });

  it("refuses a non-doctor (only the issuing doctor may mark paid)", () => {
    const { state, invoiceID } = withInvoice();
    expect(() => markInvoicePaid(state, invoiceID, sarah, NOW)).toThrow();
  });

  it("refuses a different doctor", () => {
    const { state, invoiceID } = withInvoice();
    const other: Identity = { ...voss, user: { id: "u-okafor", name: "Dr Okafor" } };
    expect(() => markInvoicePaid(state, invoiceID, other, NOW)).toThrow();
  });

  it("throws for an unknown invoice", () => {
    expect(() => markInvoicePaid(emptyState(), "nope", voss, NOW)).toThrow();
  });

  it("is idempotent — re-marking an already-paid invoice is a no-op (no overwrite, no duplicate audit)", () => {
    const { state, invoiceID } = withInvoice();
    const once = markInvoicePaid(state, invoiceID, voss, NOW + 1000);
    const twice = markInvoicePaid(once, invoiceID, voss, NOW + 9999);
    expect(twice).toBe(once); // same reference — untouched
    const inv = twice.invoices.find((i) => i.id === invoiceID)!;
    expect(inv.paidAt).toBe(NOW + 1000); // NOT overwritten by the second call
    expect(Object.values(twice.auditLogByID).filter((e) => e.action === "invoice_marked_paid" && e.targetID === invoiceID)).toHaveLength(1);
  });
});

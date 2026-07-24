// Manual client invoice reducer (spec: manual client invoicing, 2026-07-24).
import { describe, expect, it } from "vitest";
import { BackendError, buildClientInvoice, createClientInvoice } from "../backend";
import { resolveInvoiceKind } from "../invoicing";
import { buildSeedState, SEED_NOW } from "../seed";
import { LUMIERE } from "../accounts";
import { fullName, type DemoState, type Identity, type Patient } from "../types";

const sarahIndependent: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "independent" } };
const sarahClinic: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "clinic", clinic: LUMIERE } };
const ruby: Identity = { user: { id: "u-ruby", name: "Ruby Walsh" }, role: "nurse", context: { kind: "clinic", clinic: LUMIERE } };

function findPatient(state: DemoState, name: string): Patient {
  const p = Object.values(state.patients).find((x) => fullName(x) === name);
  if (!p) throw new Error(`seed patient ${name} missing`);
  return p;
}

const lines = [{ description: "Anti-wrinkle treatment", amountCents: 33000 }];

describe("createClientInvoice", () => {
  it("issues a client-invoice from the OWNING silo, billed to the patient, GST included", () => {
    const state = buildSeedState();
    const claire = findPatient(state, "Claire Donovan"); // nurse:u-sarah owned
    const { state: next, invoice } = createClientInvoice(
      state, { patientID: claire.id, lines, chargeGst: true, gstIncluded: true }, sarahIndependent, SEED_NOW,
    );
    expect(next.invoices.length).toBe(state.invoices.length + 1);
    expect(resolveInvoiceKind(invoice)).toBe("client-invoice");
    expect(invoice.counterpartyType).toBe("client");
    expect(invoice.issuerRef).toEqual({ kind: "nurse", id: "u-sarah" });
    expect(invoice.patientID).toBe(claire.id);
    expect(invoice.billTo?.businessName).toBe("Claire Donovan");
    expect(invoice.doctorID).toBe("");
    expect(invoice.gstIncluded).toBe(true);
    expect(invoice.totalCents).toBe(33000);          // inclusive: total = typed amount
    expect(invoice.gstCents).toBe(Math.round(33000 / 11));
    expect(invoice.lines[0].description).toBe("Anti-wrinkle treatment");
  });

  it("issues from the CLINIC when the patient is clinic-owned (issuer = owner, not operator)", () => {
    const state = buildSeedState();
    const amara = findPatient(state, "Amara Boyd"); // clinic:LUMIERE owned
    const { invoice } = createClientInvoice(
      state, { patientID: amara.id, lines, chargeGst: true, gstIncluded: false }, sarahClinic, SEED_NOW,
    );
    expect(invoice.issuerRef).toEqual({ kind: "clinic", id: LUMIERE.id });
    expect(invoice.totalCents).toBe(33000 + Math.round(33000 * 0.1)); // on-top
    expect(invoice.kind).toBe("client-invoice");
  });

  it("records the appointment link and a client_invoice_issued audit entry", () => {
    const state = buildSeedState();
    const claire = findPatient(state, "Claire Donovan");
    const { state: next, invoice } = createClientInvoice(
      state, { patientID: claire.id, lines, chargeGst: false, gstIncluded: false, appointmentID: "appt-xyz" }, sarahIndependent, SEED_NOW,
    );
    expect(invoice.appointmentID).toBe("appt-xyz");
    expect(invoice.gstCents).toBe(0);
    expect(Object.values(next.auditLogByID).some((e) => e.action === "client_invoice_issued")).toBe(true);
  });

  it("refuses a viewer with no commercial access and an empty/invalid line set", () => {
    const state = buildSeedState();
    const claire = findPatient(state, "Claire Donovan");
    expect(() => createClientInvoice(state, { patientID: claire.id, lines, chargeGst: false, gstIncluded: false }, ruby, SEED_NOW)).toThrow(BackendError);
    expect(() => createClientInvoice(state, { patientID: claire.id, lines: [], chargeGst: false, gstIncluded: false }, sarahIndependent, SEED_NOW)).toThrow(BackendError);
    expect(() => createClientInvoice(state, { patientID: claire.id, lines: [{ description: " ", amountCents: 100 }], chargeGst: false, gstIncluded: false }, sarahIndependent, SEED_NOW)).toThrow(BackendError);
  });

  it("buildClientInvoice mints an invoice WITHOUT mutating state (live PDF path)", () => {
    const state = buildSeedState();
    const claire = findPatient(state, "Claire Donovan");
    const before = state.invoices.length;
    const invoice = buildClientInvoice(state, { patientID: claire.id, lines, chargeGst: true, gstIncluded: true }, sarahIndependent, SEED_NOW);
    expect(invoice.id).toBeTruthy();
    expect(state.invoices.length).toBe(before); // pure — no append
  });
});

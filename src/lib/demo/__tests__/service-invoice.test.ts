// Manual service invoices (spec: manual-service-invoicing, 20/07 feedback): an employee
// practitioner issues a service-fee invoice to their clinic with handwritten line items;
// business identities are stamped automatically; GST-exclusive B2B math.
import { describe, expect, it } from "vitest";
import { BackendError, createServiceInvoice, isoDay } from "../backend";
import { invoicesFor, resolveInvoiceKind } from "../invoicing";
import { buildTaxInvoiceModel } from "../invoicePdf";
import { buildSeedState, SEED_NOW } from "../seed";
import { LUMIERE } from "../accounts";
import type { CooperationRelationship, DemoState, Identity } from "../types";

const sarahClinic: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "clinic", clinic: LUMIERE } };
const sarahIndependent: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "independent" } };
const voss: Identity = { user: { id: "u-voss", name: "Dr Elena Voss" }, role: "doctor", context: { kind: "independent" } };
const ava: Identity = { user: { id: "u-ava", name: "Ava Lim" }, role: "clinicAdmin", context: { kind: "clinic", clinic: LUMIERE } };

const LINES = [
  { description: "Cosmetic nursing services — June", amountCents: 100000 },
  { description: "Travel", amountCents: 5000 },
];

function withDoctorClinicRel(state: DemoState, kinds: CooperationRelationship["relationshipKinds"]): DemoState {
  const rel: CooperationRelationship = {
    id: `u-voss_clinic_${LUMIERE.id}`,
    doctorID: "u-voss",
    doctorName: "Dr Elena Voss",
    counterpartyType: "clinic",
    counterpartyID: LUMIERE.id,
    counterpartyName: LUMIERE.name,
    relationshipKinds: kinds,
    status: "active",
    authRequestsAllowed: true,
    invoiceApplies: true,
    priceCentsOverride: null,
    createdAt: 0,
    updatedAt: 0,
  };
  return { ...state, cooperationRelationshipsByID: { ...state.cooperationRelationshipsByID, [rel.id]: rel } };
}

describe("createServiceInvoice — happy path", () => {
  it("an employed nurse issues a final service-fee invoice with GST-exclusive math and stamped parties", () => {
    const state = buildSeedState();
    const next = createServiceInvoice(state, { clinicID: LUMIERE.id, lines: LINES }, sarahClinic, SEED_NOW);
    const invoice = next.invoices[next.invoices.length - 1];

    expect(resolveInvoiceKind(invoice)).toBe("service-fee");
    expect(invoice.draft).toBeFalsy();
    expect(invoice.paid).toBe(false);
    expect(invoice.counterpartyType).toBe("clinic");
    expect(invoice.counterpartyID).toBe(LUMIERE.id);
    expect(invoice.issuerRef).toEqual({ kind: "nurse", id: "u-sarah" });
    expect(invoice.doctorID).toBe(""); // matrix invoices leave the legacy field inert
    expect(invoice.periodLabel).toBe(isoDay(SEED_NOW));

    // GST-exclusive: 10% on top of each handwritten amount.
    expect(invoice.subtotalCents).toBe(105000);
    expect(invoice.gstCents).toBe(10500);
    expect(invoice.totalCents).toBe(115500);
    expect(invoice.lines).toHaveLength(2);
    expect(invoice.lines[0]).toMatchObject({ description: LINES[0].description, qty: 1, unitCents: 100000, feeCents: 100000, gstCents: 10000 });

    // Parties are stamped from current business entities, never typed by hand.
    expect(invoice.issuer?.businessName).toBe("Sarah Chen"); // no entity yet → display-label fallback
    expect(invoice.billTo?.businessName).toBe("Lumière");

    // Audit trail records the issue.
    const entry = Object.values(next.auditLogByID).find((e) => e.action === "service_invoice_issued");
    expect(entry?.targetID).toBe(invoice.id);
  });

  it("membership follows the account, not the active identity: the same nurse may issue from her independent identity", () => {
    const state = buildSeedState();
    const next = createServiceInvoice(state, { clinicID: LUMIERE.id, lines: LINES }, sarahIndependent, SEED_NOW);
    expect(next.invoices[next.invoices.length - 1].issuerRef).toEqual({ kind: "nurse", id: "u-sarah" });
  });

  it("a doctor with an active employee-kind relationship may issue to that clinic", () => {
    const state = withDoctorClinicRel(buildSeedState(), ["employee", "prescriber"]);
    const next = createServiceInvoice(state, { clinicID: LUMIERE.id, lines: LINES }, voss, SEED_NOW);
    const invoice = next.invoices[next.invoices.length - 1];
    expect(invoice.issuerRef).toEqual({ kind: "doctor", id: "u-voss" });
    expect(invoice.issuer?.businessName).toBe("Voss Aesthetics");
  });
});

describe("createServiceInvoice — permissions", () => {
  it("rejects a doctor whose clinic relationship is prescriber-only", () => {
    const state = withDoctorClinicRel(buildSeedState(), ["prescriber"]);
    expect(() => createServiceInvoice(state, { clinicID: LUMIERE.id, lines: LINES }, voss, SEED_NOW)).toThrow(BackendError);
  });

  it("rejects a practitioner with no membership of the target clinic", () => {
    const state = buildSeedState();
    expect(() => createServiceInvoice(state, { clinicID: "clinic-elsewhere", lines: LINES }, sarahClinic, SEED_NOW)).toThrow(BackendError);
  });

  it("rejects non-practitioner roles — a clinic cannot invoice itself", () => {
    const state = buildSeedState();
    expect(() => createServiceInvoice(state, { clinicID: LUMIERE.id, lines: LINES }, ava, SEED_NOW)).toThrow(BackendError);
  });
});

describe("createServiceInvoice — line validation", () => {
  it.each([
    ["no lines", []],
    ["blank description", [{ description: "   ", amountCents: 1000 }]],
    ["zero amount", [{ description: "Services", amountCents: 0 }]],
    ["negative amount", [{ description: "Services", amountCents: -100 }]],
    ["fractional cents", [{ description: "Services", amountCents: 10.5 }]],
  ])("rejects %s", (_label, lines) => {
    const state = buildSeedState();
    expect(() => createServiceInvoice(state, { clinicID: LUMIERE.id, lines }, sarahClinic, SEED_NOW)).toThrow(BackendError);
  });
});

describe("createServiceInvoice — visibility and rendering", () => {
  it("the invoice appears for the issuer under both identities and for the clinic, not for others", () => {
    const state = buildSeedState();
    const next = createServiceInvoice(state, { clinicID: LUMIERE.id, lines: LINES }, sarahClinic, SEED_NOW);
    const invoice = next.invoices[next.invoices.length - 1];
    expect(invoicesFor(next.invoices, sarahClinic)).toContain(invoice);
    expect(invoicesFor(next.invoices, sarahIndependent)).toContain(invoice);
    expect(invoicesFor(next.invoices, ava)).toContain(invoice); // billed clinic, final ⇒ visible
    const ruby: Identity = { user: { id: "u-ruby", name: "Ruby Walsh" }, role: "nurse", context: { kind: "independent" } };
    expect(invoicesFor(next.invoices, ruby)).not.toContain(invoice);
  });

  it("the tax-invoice PDF model carries the handwritten descriptions", () => {
    const state = buildSeedState();
    const next = createServiceInvoice(state, { clinicID: LUMIERE.id, lines: LINES }, sarahClinic, SEED_NOW);
    const invoice = next.invoices[next.invoices.length - 1];
    const model = buildTaxInvoiceModel(invoice, invoice.issuer!, invoice.billTo!);
    const flat = JSON.stringify(model);
    expect(flat).toContain("Cosmetic nursing services — June");
    expect(flat).toContain("Travel");
  });
});

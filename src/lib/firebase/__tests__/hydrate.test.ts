import { describe, it, expect } from "vitest";
import { assembleState, type HydrationRows } from "@/lib/firebase/hydrate";

const rows: HydrationRows = {
  patients: [
    { id: "p1", data: { ownerType: "clinic", ownerId: "clinic-lumiere", givenName: "Amara", lastName: "Boyd", dateOfBirth: "1991-03-12", prescribingDoctorIds: [] } },
  ],
  notesByPatient: { p1: [{ id: "n1", data: { kind: "general", body: "hi", createdAt: 1 } }] },
  authorisations: [
    { id: "a1", data: { requestId: "r1", patientId: "p1", doctorId: "u-voss", nurseId: "u-sarah", clinicId: "clinic-lumiere", repeatsRemaining: 4, expiresAtMillis: 1800000000000, medication: { name: "Letybo", category: "neurotoxin", unit: "units", areas: ["Forehead"] } } },
  ],
  requests: [
    { id: "r2", data: { patientId: "p1", nurseId: "u-sarah", nurseName: "Sarah Chen", doctorId: "u-voss", status: "pending", createdAt: 2, items: [] } },
  ],
  appointments: [
    { id: "ap1", data: { type: "treatment", ownerId: "clinic-lumiere", dateISO: "2026-06-26", startMinute: 540, endMinute: 570, status: "confirmed" } },
  ],
  formsByPatient: { p1: [{ id: "fm1", data: { template: "antiwrinkleConsent", channel: "onDevice", signedAt: 3, intro: "i", clauses: ["c"], answers: [] } }] },
  billingEvents: [{ id: "ev1", data: { requestId: "r2", patientId: "p1", doctorId: "u-voss", counterpartyType: "clinic", counterpartyId: "clinic-lumiere", monthKey: "2026-06", createdAt: 5 } }],
  invoices: [{ id: "inv1", data: { doctorId: "u-voss", counterpartyId: "clinic-lumiere", counterpartyType: "clinic", periodLabel: "June 2026", lines: [{ authorisationId: "a1", dateISO: "2026-06-26", patientName: "Mara", feeCents: 2500, gstCents: 250 }], subtotalCents: 2500, gstCents: 250, totalCents: 2750, authorisationIds: ["a1"], pdfFileId: "invoices/u-voss/inv1.pdf", createdAt: 6 } }],
  scriptPricing: [{ id: "u-voss_clinic-lumiere", data: { doctorId: "u-voss", counterpartyId: "clinic-lumiere", priceCents: 3000 } }],
};

describe("assembleState", () => {
  it("builds a DemoState keyed by id with nested notes", () => {
    const state = assembleState(rows);
    expect(Object.keys(state.patients)).toEqual(["p1"]);
    expect(state.notesByPatient.p1).toHaveLength(1);
    expect(state.authorisations.a1.repeatsRemaining).toBe(4);
    expect(state.requests.r2.status).toBe("pending");
    expect(state.appointments.ap1.startMinute).toBe(540);
    expect(state.ledger).toHaveLength(1);
    expect(state.ledger[0].counterpartyType).toBe("clinic");
    expect(state.ledger[0].counterpartyID).toBe("clinic-lumiere");
    expect(state.ledger[0].patientID).toBe("p1");
    expect(state.ledger[0].monthKey).toBe("2026-06");
    expect(state.invoices).toHaveLength(1);
    expect(state.invoices[0].totalCents).toBe(2750);
    expect(state.scriptPricing["u-voss_clinic-lumiere"]).toBe(3000);
    expect(state.usages).toEqual([]);
    expect(state.formsByPatient.p1).toHaveLength(1);
  });
});

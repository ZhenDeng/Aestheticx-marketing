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
};

describe("assembleState", () => {
  it("builds a DemoState keyed by id with nested notes", () => {
    const state = assembleState(rows);
    expect(Object.keys(state.patients)).toEqual(["p1"]);
    expect(state.notesByPatient.p1).toHaveLength(1);
    expect(state.authorisations.a1.repeatsRemaining).toBe(4);
    expect(state.requests.r2.status).toBe("pending");
    expect(state.appointments.ap1.startMinute).toBe(540);
    expect(state.ledger).toEqual([]);
    expect(state.usages).toEqual([]);
  });
});

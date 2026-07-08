import { describe, it, expect } from "vitest";
import type { MedicationItem, ProductCategory, EmergencyAuthorisation } from "@/lib/demo/types";
import {
  emergencyKindsFor,
  isReversibleFiller,
  applyEmergencyAuthorisations,
  activeEmergencyAuthorisationsForPatient,
} from "@/lib/demo/emergency";
import { emptyState } from "@/lib/demo/backend";

function med(category: ProductCategory): MedicationItem {
  return { name: "X", dosage: "", category, unit: "units", areas: [] };
}

describe("isReversibleFiller", () => {
  it("is true only for HA fillers", () => {
    expect(isReversibleFiller(med("haFiller"))).toBe(true);
    expect(isReversibleFiller(med("collagenStimulator"))).toBe(false);
    expect(isReversibleFiller(med("skinBooster"))).toBe(false);
    expect(isReversibleFiller(med("neurotoxin"))).toBe(false);
    expect(isReversibleFiller(med("other"))).toBe(false);
  });
});

describe("emergencyKindsFor", () => {
  it("always includes adrenaline", () => {
    expect(emergencyKindsFor([med("neurotoxin")])).toEqual(["adrenaline"]);
  });
  it("adds hyaluronidase when any item is an HA filler", () => {
    expect(emergencyKindsFor([med("neurotoxin"), med("haFiller")])).toEqual(["adrenaline", "hyaluronidase"]);
  });
  it("does not add hyaluronidase for biostimulators or skin boosters", () => {
    expect(emergencyKindsFor([med("collagenStimulator"), med("skinBooster")])).toEqual(["adrenaline"]);
  });
});

const T0 = Date.UTC(2026, 0, 1);
const T1 = Date.UTC(2026, 2, 1);
const EXP0 = Date.UTC(2027, 0, 1);
const EXP1 = Date.UTC(2027, 2, 1);

function apply(
  existing: Record<string, EmergencyAuthorisation>,
  over: Partial<Parameters<typeof applyEmergencyAuthorisations>[1]> = {},
) {
  return applyEmergencyAuthorisations(existing, {
    patientID: "p1", doctorID: "d1", doctorName: "Dr Voss",
    kinds: ["adrenaline"], sourceAuthIDs: ["a1"], now: T0, expiresAt: EXP0, ...over,
  });
}

describe("applyEmergencyAuthorisations", () => {
  it("creates a record with createdAt = now on first issue", () => {
    const next = apply({});
    const rec = next["p1_d1_adrenaline"];
    expect(rec).toMatchObject({ patientID: "p1", doctorID: "d1", kind: "adrenaline", createdAt: T0, refreshedAt: T0, expiresAt: EXP0 });
    expect(rec.sourceAuthorisationIDs).toEqual(["a1"]);
  });

  it("refreshes the same id without duplicating (createdAt preserved, expiry bumped, sources unioned)", () => {
    const first = apply({});
    const second = apply(first, { now: T1, expiresAt: EXP1, sourceAuthIDs: ["a2"] });
    expect(Object.keys(second)).toEqual(["p1_d1_adrenaline"]); // still one
    const rec = second["p1_d1_adrenaline"];
    expect(rec.createdAt).toBe(T0);       // preserved
    expect(rec.refreshedAt).toBe(T1);     // bumped
    expect(rec.expiresAt).toBe(EXP1);     // bumped
    expect(rec.sourceAuthorisationIDs.sort()).toEqual(["a1", "a2"]);
  });

  it("keeps a different doctor's record separate", () => {
    const first = apply({});
    const both = apply(first, { doctorID: "d2", doctorName: "Dr Lee" });
    expect(Object.keys(both).sort()).toEqual(["p1_d1_adrenaline", "p1_d2_adrenaline"]);
  });

  it("writes one record per kind", () => {
    const next = apply({}, { kinds: ["adrenaline", "hyaluronidase"] });
    expect(Object.keys(next).sort()).toEqual(["p1_d1_adrenaline", "p1_d1_hyaluronidase"]);
  });

  it("does not mutate the input map", () => {
    const existing = {};
    apply(existing);
    expect(existing).toEqual({});
  });
});

function stateWithEmergencies(...recs: EmergencyAuthorisation[]) {
  return { ...emptyState(), emergencyAuthorisationsByID: Object.fromEntries(recs.map((r) => [r.id, r])) };
}
function rec(over: Partial<EmergencyAuthorisation>): EmergencyAuthorisation {
  return { id: "x", patientID: "p1", doctorID: "d1", doctorName: "Dr Voss", kind: "adrenaline", createdAt: T0, refreshedAt: T0, expiresAt: EXP0, sourceAuthorisationIDs: [], ...over };
}

describe("activeEmergencyAuthorisationsForPatient", () => {
  it("returns only non-expired records for the patient, adrenaline first", () => {
    const state = stateWithEmergencies(
      rec({ id: "p1_d1_hyaluronidase", kind: "hyaluronidase", expiresAt: EXP0 }),
      rec({ id: "p1_d1_adrenaline", kind: "adrenaline", expiresAt: EXP0 }),
      rec({ id: "p1_d1_expired", kind: "adrenaline", expiresAt: T0 }),      // expired at now
      rec({ id: "p2_d1_adrenaline", patientID: "p2", kind: "adrenaline" }), // other patient
    );
    const active = activeEmergencyAuthorisationsForPatient(state, "p1", T1);
    expect(active.map((e) => e.kind)).toEqual(["adrenaline", "hyaluronidase"]);
  });
});

// Visibility integration for the isolation guard (spec: client-data-isolation).
// canViewPatient = clinical view (patientPermissions) OR commercial access (isolation
// guard) — so a collaborating doctor sees the clinic's client book, while every seeded
// persona keeps exactly the reach it had before the matrix change.
import { describe, expect, it } from "vitest";
import { canViewPatient, patientAccessLevel } from "../isolation";
import { visiblePatients } from "../backend";
import { buildSeedState } from "../seed";
import { LUMIERE } from "../accounts";
import { fullName, type Identity } from "../types";

const sarahIndependent: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "independent" } };
const sarahClinic: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "clinic", clinic: LUMIERE } };
const voss: Identity = { user: { id: "u-voss", name: "Dr Elena Voss" }, role: "doctor", context: { kind: "independent" } };
const ava: Identity = { user: { id: "u-ava", name: "Ava Lim" }, role: "clinicAdmin", context: { kind: "clinic", clinic: LUMIERE } };

function names(patients: { givenName: string; lastName: string }[]): string[] {
  return patients.map((p) => `${p.givenName} ${p.lastName}`);
}

describe("seeded personas keep their intended reach", () => {
  const state = buildSeedState();

  it("independent Sarah sees her own client but no doctor-owned client", () => {
    const seen = names(visiblePatients(state, sarahIndependent));
    expect(seen).toContain("Claire Donovan"); // nurse-owned by Sarah
    expect(seen).not.toContain("Grace Huang"); // doctor-owned by Voss
  });

  it("clinic Sarah and Ava see the clinic-owned client", () => {
    expect(names(visiblePatients(state, sarahClinic))).toContain("Amara Boyd");
    expect(names(visiblePatients(state, ava))).toContain("Amara Boyd");
  });

  it("Ava does not see independent books", () => {
    const seen = names(visiblePatients(state, ava));
    expect(seen).not.toContain("Claire Donovan");
    expect(seen).not.toContain("Grace Huang");
  });

  it("Voss sees his own client and clinic clients he collaborates with or prescribes for", () => {
    const seen = names(visiblePatients(state, voss));
    expect(seen).toContain("Grace Huang");
    expect(seen).toContain("Amara Boyd");
  });
});

describe("collaborating doctor visibility (commercial, not prescriber-based)", () => {
  it("a doctor with an active cooperation relationship can view a clinic client they never prescribed for", () => {
    const state = buildSeedState();
    // A fresh clinic client with no prescribing/reviewer relationship to Voss at all.
    const p = {
      id: "p-new-clinic", givenName: "Nova", lastName: "Client",
      dateOfBirth: { day: 2, month: 2, year: 1992 }, gender: "F", address: "", phone: "0400", email: "",
      allergies: "", currentMedications: "", owner: { kind: "clinic" as const, id: LUMIERE.id }, prescribingDoctorIDs: [],
    };
    const withPatient = { ...state, patients: { ...state.patients, [p.id]: p } };
    expect(patientAccessLevel(withPatient, voss, p)).toBe("collaborator");
    expect(canViewPatient(withPatient, voss, p)).toBe(true);
    expect(names(visiblePatients(withPatient, voss))).toContain("Nova Client");
    // …while an unrelated independent nurse still cannot.
    expect(canViewPatient(withPatient, sarahIndependent, p)).toBe(false);
    const seenBySarah = visiblePatients(withPatient, sarahIndependent);
    expect(seenBySarah.map(fullName)).not.toContain("Nova Client");
  });
});

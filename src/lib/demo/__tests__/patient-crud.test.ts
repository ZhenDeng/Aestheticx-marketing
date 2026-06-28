import { describe, it, expect } from "vitest";
import type { DemoState, Identity, Patient } from "@/lib/demo/types";
import { emptyDraft } from "@/lib/demo/types";
import {
  emptyState, missingFields, canCreatePatient, createPatient,
  updatePatient, deletePatient, mergePatients,
} from "@/lib/demo/backend";

const NOW = Date.UTC(2026, 5, 28);
const nurse: Identity = { user: { id: "u-sarah", name: "Sarah" }, role: "nurse", context: { kind: "independent" } };
const admin: Identity = { user: { id: "u-ava", name: "Ava" }, role: "clinicAdmin", context: { kind: "clinic", clinic: { id: "c1", name: "C1" } } };
const superAdmin: Identity = { user: { id: "u-root", name: "Root" }, role: "superAdmin", context: { kind: "independent" } };

function fullDraft() {
  return { ...emptyDraft(), givenName: "Amara", lastName: "Boyd",
    dateOfBirth: { year: 1991, month: 3, day: 12 }, gender: "Female", address: "x",
    phone: "0401", email: "a@x.com", allergies: "NKDA", currentMedications: "Nil" };
}
function clinicPatient(id: string): Patient {
  return { id, givenName: "G", lastName: "H", dateOfBirth: { year: 1980, month: 1, day: 1 },
    gender: "Female", address: "x", phone: "x", email: "x", allergies: "x", currentMedications: "x",
    owner: { kind: "clinic", id: "c1" }, prescribingDoctorIDs: [] };
}

describe("missingFields", () => {
  it("flags every blank mandatory field", () => {
    expect(missingFields(emptyDraft()).size).toBe(9);
  });
  it("is empty for a complete draft", () => {
    expect(missingFields(fullDraft()).size).toBe(0);
  });
});

describe("canCreatePatient", () => {
  it("allows a nurse, denies a super admin", () => {
    expect(canCreatePatient(nurse)).toBe(true);
    expect(canCreatePatient(superAdmin)).toBe(false);
  });
});

describe("createPatient", () => {
  it("derives a nurse-self owner and never sets prescribers", () => {
    const { state, patient } = createPatient(emptyState(), fullDraft(), nurse, NOW);
    expect(patient.owner).toEqual({ kind: "nurse", id: "u-sarah" });
    expect(patient.prescribingDoctorIDs).toEqual([]);
    expect(state.patients[patient.id]).toBeDefined();
  });
  it("derives a clinic owner from clinic context", () => {
    const { patient } = createPatient(emptyState(), fullDraft(), admin, NOW);
    expect(patient.owner).toEqual({ kind: "clinic", id: "c1" });
  });
  it("throws on an incomplete draft", () => {
    expect(() => createPatient(emptyState(), emptyDraft(), nurse, NOW)).toThrow();
  });
});

describe("updatePatient", () => {
  it("preserves owner and prescribers, applies edits", () => {
    let state = emptyState();
    const p: Patient = { ...clinicPatient("p1"), prescribingDoctorIDs: ["u-voss"] };
    state = { ...state, patients: { p1: p } };
    const edited: Patient = { ...p, givenName: "Grace", owner: { kind: "nurse", id: "x" }, prescribingDoctorIDs: [] };
    const next = updatePatient(state, edited, admin);
    expect(next.patients.p1.givenName).toBe("Grace");
    expect(next.patients.p1.owner).toEqual({ kind: "clinic", id: "c1" });
    expect(next.patients.p1.prescribingDoctorIDs).toEqual(["u-voss"]);
  });
  it("denies a non-editor", () => {
    const state = { ...emptyState(), patients: { p1: clinicPatient("p1") } };
    const otherNurse: Identity = { ...nurse, user: { id: "u-other", name: "O" } };
    expect(() => updatePatient(state, clinicPatient("p1"), otherNurse)).toThrow();
  });
});

describe("deletePatient", () => {
  it("removes the patient and its notes", () => {
    const state: DemoState = { ...emptyState(),
      patients: { p1: clinicPatient("p1") },
      notesByPatient: { p1: [{ id: "n1", patientID: "p1", kind: "general", title: "", body: "x", createdAt: 1, authorID: "a", authorBadge: "b", consumedAuthorisationIDs: [], medications: [] }] } };
    const next = deletePatient(state, "p1", admin);
    expect(next.patients.p1).toBeUndefined();
    expect(next.notesByPatient.p1).toBeUndefined();
  });
});

describe("deletePatient drops relational records", () => {
  it("removes the patient's authorisations, requests, and usages", () => {
    const state: DemoState = { ...emptyState(),
      patients: { p1: clinicPatient("p1") },
      authorisations: { a1: { id: "a1", requestID: "r", patientID: "p1", doctorID: "d", nurseID: "n", clinicID: "c1", medication: { name: "x", dosage: "1", category: "other", unit: "freeText", areas: [] }, repeatsRemaining: 5, expiresAt: NOW + 1 } },
      requests: { r1: { id: "r1", patientID: "p1", nurse: { id: "n", name: "N" }, doctorID: "d", context: { kind: "independent" }, items: [], status: "pending", createdAt: 1 } },
      usages: [{ authorisationID: "a1", patientID: "p1", clinicID: "c1", nurseID: "n", date: 1 }] };
    const next = deletePatient(state, "p1", admin);
    expect(next.authorisations.a1).toBeUndefined();
    expect(next.requests.r1).toBeUndefined();
    expect(next.usages).toHaveLength(0);
  });
});

describe("mergePatients", () => {
  it("re-points notes + authorisations + usages, unions prescribers, drops the duplicate", () => {
    const keep: Patient = { ...clinicPatient("keep"), prescribingDoctorIDs: ["d1"] };
    const remove: Patient = { ...clinicPatient("remove"), prescribingDoctorIDs: ["d2"] };
    const state: DemoState = { ...emptyState(),
      patients: { keep, remove },
      notesByPatient: { remove: [{ id: "n1", patientID: "remove", kind: "general", title: "", body: "x", createdAt: 1, authorID: "a", authorBadge: "b", consumedAuthorisationIDs: [], medications: [] }] },
      authorisations: { a1: { id: "a1", requestID: "r", patientID: "remove", doctorID: "d", nurseID: "n", clinicID: "c1", medication: { name: "x", dosage: "1", category: "other", unit: "freeText", areas: [] }, repeatsRemaining: 5, expiresAt: NOW + 1 } },
      usages: [{ authorisationID: "a1", patientID: "remove", clinicID: "c1", nurseID: "n", date: 1 }] };
    const next = mergePatients(state, "keep", "remove", admin);
    expect(next.patients.remove).toBeUndefined();
    expect(next.notesByPatient.keep).toHaveLength(1);
    expect(next.notesByPatient.keep[0].patientID).toBe("keep");
    expect(next.authorisations.a1.patientID).toBe("keep");
    expect(next.usages[0].patientID).toBe("keep");
    expect(next.patients.keep.prescribingDoctorIDs.sort()).toEqual(["d1", "d2"]);
  });
});

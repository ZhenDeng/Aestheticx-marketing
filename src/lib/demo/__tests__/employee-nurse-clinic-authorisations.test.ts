import { describe, it, expect } from "vitest";
import {
  emptyState,
  submitRequest,
  approveRequest,
  usableAuthorisations,
  saveTreatmentNote,
  BackendError,
} from "@/lib/demo/backend";
import type { DemoState, Identity, MedicationItem, Patient } from "@/lib/demo/types";

// Clinic-employee-only nurse (02/08): she raises authorisation requests ON BEHALF OF the
// clinic (her only identity is the clinic-context nurse), and the approved authorisations
// belong to the CLINIC — every employed member acting in that clinic context (another
// nurse, an employed doctor) can tick the medications in a treatment note. Exercised
// against the same pure backend the app uses, one state threaded across the roles.

const NOW = Date.UTC(2026, 7, 2);
const CLINIC = { id: "clinic-l", name: "Lumière Clinic" };

// The employee-only nurse: her ONLY identity is the clinic-context one (identitiesFromClaims
// skips the independent identity for employeeOnly accounts — see firebase/identity.test.ts).
const employeeNurse: Identity = { user: { id: "u-mia", name: "Mia Torres" }, role: "nurse", context: { kind: "clinic", clinic: CLINIC } };
const colleagueNurse: Identity = { user: { id: "u-ruby", name: "Ruby Walsh" }, role: "nurse", context: { kind: "clinic", clinic: CLINIC } };
const employedDoctor: Identity = { user: { id: "u-doc-emp", name: "Dr Employed" }, role: "doctor", context: { kind: "clinic", clinic: CLINIC } };
const approver: Identity = { user: { id: "u-voss", name: "Dr Elena Voss" }, role: "doctor", context: { kind: "independent" } };
const outsideNurse: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "independent" } };

const toxin: MedicationItem = { name: "Letybo", dosage: "50", category: "neurotoxin", brand: "Letybo", unit: "units", areas: ["Forehead"] };

function seededState(): DemoState {
  const patient: Patient = {
    id: "p1", givenName: "Cleo", lastName: "Client", dateOfBirth: { year: 1992, month: 3, day: 9 },
    gender: "Female", address: "", phone: "", email: "", allergies: "", currentMedications: "",
    owner: { kind: "clinic", id: CLINIC.id }, prescribingDoctorIDs: [],
  };
  return { ...emptyState(), patients: { p1: patient } };
}

function approvedState() {
  const submitted = submitRequest(
    seededState(),
    { patientID: "p1", doctorID: approver.user.id, items: [toxin], identity: employeeNurse },
    NOW,
  );
  return approveRequest(submitted.state, submitted.request.id, approver, NOW);
}

describe("employee-only nurse: clinic-shared authorisations", () => {
  it("her request is raised on behalf of the clinic and the grant is stamped with the clinic id", () => {
    const submitted = submitRequest(
      seededState(),
      { patientID: "p1", doctorID: approver.user.id, items: [toxin], identity: employeeNurse },
      NOW,
    );
    expect(submitted.request.context).toEqual({ kind: "clinic", clinic: CLINIC });
    const { granted } = approveRequest(submitted.state, submitted.request.id, approver, NOW);
    expect(granted).toHaveLength(1);
    expect(granted[0].clinicID).toBe(CLINIC.id);
    expect(granted[0].nurseID).toBe(employeeNurse.user.id);
  });

  it("every clinic member acting in that clinic context can tick her approved authorisation", () => {
    const { state } = approvedState();
    for (const member of [employeeNurse, colleagueNurse, employedDoctor]) {
      expect(usableAuthorisations(state, "p1", member, NOW)).toHaveLength(1);
    }
    // An independent nurse outside the clinic sees nothing to tick.
    expect(usableAuthorisations(state, "p1", outsideNurse, NOW)).toHaveLength(0);
  });

  it("a colleague's treatment note consumes a repeat from her authorisation", () => {
    const { state, granted } = approvedState();
    const before = granted[0].repeatsRemaining;
    const result = saveTreatmentNote(
      state,
      { patientID: "p1", title: "Anti-wrinkle", body: "Forehead treated.", tickedIDs: [granted[0].id], medications: [], identity: colleagueNurse },
      NOW,
    );
    expect(result.state.authorisations[granted[0].id].repeatsRemaining).toBe(before - 1);
    expect(result.note.consumedAuthorisationIDs).toEqual([granted[0].id]);
    // The usage records who administered, under which clinic.
    const usage = result.state.usages.at(-1);
    expect(usage).toMatchObject({ clinicID: CLINIC.id, nurseID: colleagueNurse.user.id });
  });

  it("an outsider ticking the clinic authorisation is rejected outright", () => {
    const { state, granted } = approvedState();
    expect(() => saveTreatmentNote(
      state,
      { patientID: "p1", title: "x", body: "y", tickedIDs: [granted[0].id], medications: [], identity: outsideNurse },
      NOW,
    )).toThrow(BackendError);
  });
});

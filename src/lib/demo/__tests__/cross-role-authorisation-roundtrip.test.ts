import { describe, it, expect } from "vitest";
import {
  emptyState,
  submitRequest,
  approveRequest,
  pendingRequestsForDoctor,
  activeAuthorisations,
  REPEATS_PER_AUTHORISATION,
  BackendError,
} from "@/lib/demo/backend";
import { activeEmergencyAuthorisationsForPatient } from "@/lib/demo/emergency";
import type { DemoState, Identity, MedicationItem, Patient } from "@/lib/demo/types";

// FULL cross-role authorisation round-trip (nurse submits → the addressed doctor approves →
// authorisations + standing emergency authorisations follow), with genuinely SHARED state across
// the two roles.
//
// Why this lives here and not in the Playwright E2E suite: the demo E2E can't do this round-trip
// (the in-memory store resets on any full load, and switching accounts requires a sign-out → re-
// seed — see e2e/README.md). A live/emulator E2E can't do it from THIS repo either: the approve
// step is a backend Cloud Function (mirrorApproveRequest → httpsCallable("approveRequest")) whose
// logic lives in the separate functions repo. So the faithful round-trip is exercised here against
// the same pure backend.ts functions the app and the demo seed use — one state threaded through
// both roles.

const NOW = Date.UTC(2026, 6, 18);

const nurse: Identity = { user: { id: "u-nurse", name: "Nadia Nurse" }, role: "nurse", context: { kind: "independent" } };
const doctor: Identity = { user: { id: "u-doc", name: "Dr Approver" }, role: "doctor", context: { kind: "independent" } };
const otherDoctor: Identity = { user: { id: "u-doc-2", name: "Dr Other" }, role: "doctor", context: { kind: "independent" } };

const filler: MedicationItem = { name: "Voluma", dosage: "2", category: "haFiller", brand: "Juvederm", unit: "millilitres", areas: ["Cheek"] };
const toxin: MedicationItem = { name: "Letybo", dosage: "50", category: "neurotoxin", brand: "Letybo", unit: "units", areas: ["Forehead"] };

function seededState(): DemoState {
  const patient: Patient = {
    id: "p1", givenName: "Pat", lastName: "Ient", dateOfBirth: { year: 1990, month: 1, day: 1 },
    gender: "Female", address: "", phone: "", email: "", allergies: "", currentMedications: "",
    owner: { kind: "nurse", id: nurse.user.id }, prescribingDoctorIDs: [],
  };
  return { ...emptyState(), patients: { p1: patient } };
}

describe("cross-role authorisation round-trip (shared state)", () => {
  it("nurse-submitted request lands in the addressed doctor's pending inbox", () => {
    const { state, request } = submitRequest(seededState(), { patientID: "p1", doctorID: doctor.user.id, items: [toxin, filler], identity: nurse }, NOW);
    expect(request.status).toBe("pending");
    expect(pendingRequestsForDoctor(state, doctor.user.id).map((r) => r.id)).toContain(request.id);
    // Not visible to any other doctor.
    expect(pendingRequestsForDoctor(state, otherDoctor.user.id)).toEqual([]);
  });

  it("only the addressed doctor may approve — nurse and other doctors are rejected", () => {
    const { state, request } = submitRequest(seededState(), { patientID: "p1", doctorID: doctor.user.id, items: [filler], identity: nurse }, NOW);
    expect(() => approveRequest(state, request.id, nurse, NOW)).toThrow(BackendError);
    expect(() => approveRequest(state, request.id, otherDoctor, NOW)).toThrow(BackendError);
  });

  it("the addressed doctor's approval issues authorisations, grants emergency auths, and records the prescriber", () => {
    // 1. Nurse submits (toxin + HA filler).
    const submitted = submitRequest(seededState(), { patientID: "p1", doctorID: doctor.user.id, items: [toxin, filler], identity: nurse }, NOW);

    // 2. The addressed doctor approves the SAME request in the SAME state.
    const { state, granted } = approveRequest(submitted.state, submitted.request.id, doctor, NOW);

    // 3a. One authorisation per item, each with the standard repeats, now active on the file.
    expect(granted).toHaveLength(2);
    for (const a of granted) expect(a.repeatsRemaining).toBe(REPEATS_PER_AUTHORISATION);
    const active = activeAuthorisations(state, "p1", NOW);
    expect(active.map((a) => a.medication.name).sort()).toEqual(["Letybo", "Voluma"]);

    // 3b. Standing emergency authorisations: adrenaline always, + hyaluronidase for the HA filler.
    const emergency = activeEmergencyAuthorisationsForPatient(state, "p1", NOW);
    expect(emergency.map((e) => e.kind).sort()).toEqual(["adrenaline", "hyaluronidase"]);
    expect(emergency.every((e) => e.doctorName === doctor.user.name)).toBe(true);

    // 3c. The approver is recorded as a prescriber, and the request is marked approved + cleared.
    expect(state.patients.p1.prescribingDoctorIDs).toContain(doctor.user.id);
    expect(state.requests[submitted.request.id].status).toBe("approved");
    expect(pendingRequestsForDoctor(state, doctor.user.id)).toEqual([]);
  });

  it("a toxin-only approval grants adrenaline but not hyaluronidase", () => {
    const submitted = submitRequest(seededState(), { patientID: "p1", doctorID: doctor.user.id, items: [toxin], identity: nurse }, NOW);
    const { state } = approveRequest(submitted.state, submitted.request.id, doctor, NOW);
    const kinds = activeEmergencyAuthorisationsForPatient(state, "p1", NOW).map((e) => e.kind);
    expect(kinds).toContain("adrenaline");
    expect(kinds).not.toContain("hyaluronidase");
  });
});

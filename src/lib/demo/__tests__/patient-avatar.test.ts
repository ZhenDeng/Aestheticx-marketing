import { describe, it, expect } from "vitest";
import type { DemoState, Identity, Patient } from "@/lib/demo/types";
import { emptyState, setPatientAvatar } from "@/lib/demo/backend";

// Port of the iOS patient avatar (MediaAndInvoice.swift PatientAvatarPicker):
// the upload path is gated on canEditDetails, exactly like updatePatient
// (InMemoryBackend.updatePatient guards PatientPermissions.canEditDetails).

const sarah: Identity = { user: { id: "u-sarah", name: "Sarah" }, role: "nurse", context: { kind: "independent" } };
const voss: Identity = { user: { id: "u-voss", name: "Dr Voss" }, role: "doctor", context: { kind: "independent" } };
const admin: Identity = { user: { id: "u-ava", name: "Ava" }, role: "clinicAdmin", context: { kind: "clinic", clinic: { id: "c1", name: "C1" } } };
const superAdmin: Identity = { user: { id: "u-root", name: "Root" }, role: "superAdmin", context: { kind: "independent" } };

function patient(id: string, owner: Patient["owner"], prescribers: string[] = []): Patient {
  return { id, givenName: "Grace", lastName: "Huang", dateOfBirth: { year: 1979, month: 1, day: 17 },
    gender: "Female", address: "x", phone: "x", email: "x", allergies: "x", currentMedications: "x",
    owner, prescribingDoctorIDs: prescribers };
}

function withPatients(...patients: Patient[]): DemoState {
  return { ...emptyState(), patients: Object.fromEntries(patients.map((p) => [p.id, p])) };
}

describe("setPatientAvatar", () => {
  it("stores the demo dataUrl on the patient (owner nurse)", () => {
    const state = withPatients(patient("p1", { kind: "nurse", id: "u-sarah" }));
    const next = setPatientAvatar(state, "p1", { avatarDataUrl: "data:image/jpeg;base64,x" }, sarah);
    expect(next.patients.p1.avatarDataUrl).toBe("data:image/jpeg;base64,x");
    // Untouched fields survive; the input state is never mutated.
    expect(next.patients.p1.givenName).toBe("Grace");
    expect(state.patients.p1.avatarDataUrl).toBeUndefined();
  });

  it("stores the live Storage fileId (patients/{id} object key)", () => {
    const state = withPatients(patient("p1", { kind: "doctor", id: "u-voss" }));
    const next = setPatientAvatar(state, "p1", { avatarFileId: "patients/p1/avatar/abc.jpg" }, voss);
    expect(next.patients.p1.avatarFileId).toBe("patients/p1/avatar/abc.jpg");
  });

  it("applies only the provided keys (a fileId set keeps an existing dataUrl preview)", () => {
    let state = withPatients(patient("p1", { kind: "clinic", id: "c1" }));
    state = setPatientAvatar(state, "p1", { avatarDataUrl: "data:x" }, admin);
    state = setPatientAvatar(state, "p1", { avatarFileId: "patients/p1/avatar/a.jpg" }, admin);
    expect(state.patients.p1.avatarDataUrl).toBe("data:x");
    expect(state.patients.p1.avatarFileId).toBe("patients/p1/avatar/a.jpg");
  });

  it("allows a clinic admin on a clinic file (canEditDetails)", () => {
    const state = withPatients(patient("p1", { kind: "clinic", id: "c1" }));
    const next = setPatientAvatar(state, "p1", { avatarDataUrl: "data:x" }, admin);
    expect(next.patients.p1.avatarDataUrl).toBe("data:x");
  });

  it("denies a prescriber-only doctor (view + treatment notes, but no detail edits)", () => {
    const state = withPatients(patient("p1", { kind: "nurse", id: "u-sarah" }, ["u-voss"]));
    expect(() => setPatientAvatar(state, "p1", { avatarDataUrl: "data:x" }, voss)).toThrow();
  });

  it("denies super admin (inspects everything, edits nothing)", () => {
    const state = withPatients(patient("p1", { kind: "nurse", id: "u-sarah" }));
    expect(() => setPatientAvatar(state, "p1", { avatarDataUrl: "data:x" }, superAdmin)).toThrow();
  });

  it("throws notFound for an unknown patient", () => {
    expect(() => setPatientAvatar(emptyState(), "nope", { avatarDataUrl: "data:x" }, sarah)).toThrow();
  });
});

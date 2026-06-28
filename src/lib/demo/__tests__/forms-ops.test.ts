import { describe, it, expect } from "vitest";
import type { DemoState, Identity, Patient } from "@/lib/demo/types";
import { emptyState, recordSignedForm, deleteForm, formsForPatient } from "@/lib/demo/backend";

const NOW = Date.UTC(2026, 5, 28);
const nurse: Identity = { user: { id: "u-sarah", name: "Sarah" }, role: "nurse", context: { kind: "independent" } };
function nursePatient(id: string): Patient {
  return { id, givenName: "C", lastName: "D", dateOfBirth: { year: 1987, month: 7, day: 4 },
    gender: "Female", address: "x", phone: "x", email: "x", allergies: "x", currentMedications: "x",
    owner: { kind: "nurse", id: "u-sarah" }, prescribingDoctorIDs: [] };
}
function withPatient(p: Patient): DemoState { return { ...emptyState(), patients: { [p.id]: p } }; }

describe("recordSignedForm", () => {
  it("records a form for an editable patient, snapshotting the template text", () => {
    const { state, form } = recordSignedForm(withPatient(nursePatient("p1")), {
      patientID: "p1", template: "antiwrinkleConsent", channel: "onDevice",
      answers: [{ questionID: "questions-answered", answer: true, detail: "" }],
      signatureDataUrl: "data:image/png;base64,AAA",
    }, nurse, NOW);
    expect(form.template).toBe("antiwrinkleConsent");
    expect(form.clauses.length).toBeGreaterThan(0);
    expect(form.intro.length).toBeGreaterThan(0);
    expect(form.signedAt).toBe(NOW);
    expect(formsForPatient(state, "p1")).toHaveLength(1);
  });
  it("denies a clinician who cannot send forms", () => {
    const otherNurse: Identity = { ...nurse, user: { id: "u-other", name: "O" } };
    expect(() => recordSignedForm(withPatient(nursePatient("p1")), {
      patientID: "p1", template: "antiwrinkleConsent", channel: "onDevice", answers: [],
    }, otherNurse, NOW)).toThrow();
  });
});

describe("deleteForm", () => {
  it("removes a signed form", () => {
    const { state } = recordSignedForm(withPatient(nursePatient("p1")), {
      patientID: "p1", template: "antiwrinkleConsent", channel: "onDevice", answers: [],
    }, nurse, NOW);
    const formId = formsForPatient(state, "p1")[0].id;
    const next = deleteForm(state, "p1", formId, nurse);
    expect(formsForPatient(next, "p1")).toHaveLength(0);
  });
});

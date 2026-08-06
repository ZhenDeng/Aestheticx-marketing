import { describe, it, expect } from "vitest";
import { emptyState, submitRequest, editPendingRequest, resubmitRequest, updateProfile } from "@/lib/demo/backend";
import { LUMIERE } from "@/lib/demo/accounts";
import type { DemoState, Identity, MedicationItem, Patient } from "@/lib/demo/types";

// Owner feedback 06/08: the premise stamped on a request came from a global selection made on
// another page (dashboard "Working from" / Profile), so working elsewhere without switching
// first silently printed the wrong address. The request form now chooses it per request; these
// lock the reducer half of that.

const HOME = { id: "p-home", name: "Home rooms", address: "1 Home St, Sydney NSW 2000" };
const CITY = { id: "p-city", name: "City rooms", address: "2 City Rd, Sydney NSW 2000" };

const nurse: Identity = { user: { id: "u-n", name: "Nurse" }, role: "nurse", context: { kind: "independent" } };
const nurseAtClinic: Identity = { user: { id: "u-n", name: "Nurse" }, role: "nurse", context: { kind: "clinic", clinic: LUMIERE } };

const patient: Patient = {
  id: "p-1", givenName: "Ann", lastName: "Lee",
  dateOfBirth: { year: 1990, month: 1, day: 1 }, gender: "Female",
  address: "", phone: "", email: "", allergies: "", currentMedications: "",
  owner: { kind: "nurse", id: "u-n" }, prescribingDoctorIDs: [], openReviewerDoctorIDs: [],
};
const clinicPatient: Patient = { ...patient, id: "p-2", owner: { kind: "clinic", id: LUMIERE.id } };

const items: MedicationItem[] = [
  { name: "Letybo", dosage: "20", unit: "units", route: "intramuscular", category: "neurotoxin", areas: [] },
];

/** A nurse with two premises, HOME selected — so "the active premise" is unambiguous. */
function base(): DemoState {
  const s = emptyState();
  const seeded: DemoState = { ...s, patients: { [patient.id]: patient, [clinicPatient.id]: clinicPatient } };
  return updateProfile(seeded, nurse.user.id, { premises: [HOME, CITY], defaultPremiseId: HOME.id, selectedPremiseId: HOME.id });
}

const NOW = Date.parse("2026-08-06T00:00:00Z");

describe("submitRequest — chosen premise", () => {
  it("stamps the chosen premise, not the active one", () => {
    const { request } = submitRequest(base(), { patientID: "p-1", doctorID: "u-d", items, identity: nurse, premiseId: CITY.id }, NOW);
    expect(request.premise).toEqual(CITY);
  });

  it("stamps the active premise when no choice is passed (pre-06/08 behaviour)", () => {
    const { request } = submitRequest(base(), { patientID: "p-1", doctorID: "u-d", items, identity: nurse }, NOW);
    expect(request.premise).toEqual(HOME);
  });

  it("falls back to the active premise when the chosen id no longer exists", () => {
    const { request } = submitRequest(base(), { patientID: "p-1", doctorID: "u-d", items, identity: nurse, premiseId: "p-deleted" }, NOW);
    expect(request.premise).toEqual(HOME);
  });

  it("a clinic-context request ignores the choice and stamps null", () => {
    const { request } = submitRequest(base(), { patientID: "p-2", doctorID: "u-d", items, identity: nurseAtClinic, premiseId: CITY.id }, NOW);
    expect(request.premise).toBeNull();
  });
});

describe("editPendingRequest / resubmitRequest — re-stamp", () => {
  it("edit in place re-stamps the chosen premise", () => {
    const first = submitRequest(base(), { patientID: "p-1", doctorID: "u-d", items, identity: nurse }, NOW);
    const next = editPendingRequest(first.state, { requestID: first.request.id, items, identity: nurse, premiseId: CITY.id });
    expect(next.requests[first.request.id].premise).toEqual(CITY);
  });

  it("edit in place leaves the stamp alone when no choice is passed", () => {
    const first = submitRequest(base(), { patientID: "p-1", doctorID: "u-d", items, identity: nurse }, NOW);
    const next = editPendingRequest(first.state, { requestID: first.request.id, items, identity: nurse });
    expect(next.requests[first.request.id].premise).toEqual(HOME);
  });

  it("resubmit re-stamps the chosen premise", () => {
    const first = submitRequest(base(), { patientID: "p-1", doctorID: "u-d", items, identity: nurse }, NOW);
    const returned: DemoState = {
      ...first.state,
      requests: { ...first.state.requests, [first.request.id]: { ...first.request, status: "needsEdit" } },
    };
    const next = resubmitRequest(returned, { requestID: first.request.id, items, identity: nurse, premiseId: CITY.id });
    expect(next.requests[first.request.id].premise).toEqual(CITY);
    expect(next.requests[first.request.id].status).toBe("pending");
  });

  // The reducer must never blank a stamp the request already carries: a premise deleted in
  // another tab falls back to the active one, matching the create path (and the rules, which
  // reject a removal outright).
  it("re-stamping with a deleted id falls back to the active premise, never null", () => {
    const first = submitRequest(base(), { patientID: "p-1", doctorID: "u-d", items, identity: nurse, premiseId: CITY.id }, NOW);
    const next = editPendingRequest(first.state, { requestID: first.request.id, items, identity: nurse, premiseId: "p-deleted" });
    expect(next.requests[first.request.id].premise).toEqual(HOME);
  });

  // A clinic request's null premise is the signal meaning "use the clinic's address"; an edit
  // must not be able to smuggle a private premise onto it.
  it("a clinic-context edit ignores the choice and keeps null", () => {
    const first = submitRequest(base(), { patientID: "p-2", doctorID: "u-d", items, identity: nurseAtClinic }, NOW);
    const next = editPendingRequest(first.state, { requestID: first.request.id, items, identity: nurseAtClinic, premiseId: CITY.id });
    expect(next.requests[first.request.id].premise).toBeNull();
  });
});

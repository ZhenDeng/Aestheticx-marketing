import { describe, it, expect } from "vitest";
import type {
  DemoState,
  Identity,
  Patient,
  MedicationItem,
} from "@/lib/demo/types";
import {
  emptyState,
  classifySearch,
  patientPermissions,
  searchPatients,
  submitRequest,
  approveRequest,
  requireEdit,
  activeAuthorisations,
  saveTreatmentNote,
  REPEATS_PER_AUTHORISATION,
  VALIDITY_MONTHS,
} from "@/lib/demo/backend";

const NOW = Date.UTC(2026, 5, 26); // 2026-06-26

const sarahIndependent: Identity = {
  user: { id: "u-sarah", name: "Sarah Chen" },
  role: "nurse",
  context: { kind: "independent" },
};
const voss: Identity = {
  user: { id: "u-voss", name: "Dr Elena Voss" },
  role: "doctor",
  context: { kind: "independent" },
};

function nursePatient(id: string, ownerID: string): Patient {
  return {
    id,
    givenName: "Claire",
    lastName: "Donovan",
    dateOfBirth: { year: 1987, month: 7, day: 4 },
    gender: "Female",
    address: "",
    phone: "0432 901 343",
    email: "claire@example.com",
    allergies: "NKDA",
    currentMedications: "Nil",
    owner: { kind: "nurse", id: ownerID },
    prescribingDoctorIDs: [],
  };
}

function stateWith(...patients: Patient[]): DemoState {
  return { ...emptyState(), patients: Object.fromEntries(patients.map((p) => [p.id, p])) };
}

const profhilo: MedicationItem = {
  name: "Profhilo",
  dosage: "2",
  category: "skinBooster",
  unit: "millilitres",
  areas: ["Full Face"],
};

describe("classifySearch", () => {
  it("classifies a name", () => {
    expect(classifySearch("Donovan")).toBe("name");
  });
  it("classifies a date of birth", () => {
    expect(classifySearch("4/7/1987")).toBe("dateOfBirth");
  });
  it("classifies a zero-padded dd/mm/yyyy date of birth", () => {
    expect(classifySearch("04/07/1987")).toBe("dateOfBirth");
  });
  it("classifies a phone number", () => {
    expect(classifySearch("0432 901 343")).toBe("phone");
  });
  it("classifies unspaced digits and international format as phone", () => {
    expect(classifySearch("0432901343")).toBe("phone");
    expect(classifySearch("+61 432 901 343")).toBe("phone");
  });
  it("classifies mixed letters and digits as a name", () => {
    expect(classifySearch("Donovan 4")).toBe("name");
  });
});

describe("patientPermissions", () => {
  it("lets an independent nurse owner write treatment notes", () => {
    const p = nursePatient("p1", "u-sarah");
    const perms = patientPermissions(sarahIndependent, p);
    expect(perms.canView).toBe(true);
    expect(perms.canWriteTreatmentNote).toBe(true);
  });
  it("hides another nurse's independent patient", () => {
    const p = nursePatient("p1", "u-other");
    expect(patientPermissions(sarahIndependent, p).canView).toBe(false);
  });
  it("denies clinical write to a clinic admin", () => {
    const admin: Identity = {
      user: { id: "u-ava", name: "Ava Lim" },
      role: "clinicAdmin",
      context: { kind: "clinic", clinic: { id: "clinic-lumiere", name: "Lumière Clinic" } },
    };
    const p: Patient = { ...nursePatient("p1", "x"), owner: { kind: "clinic", id: "clinic-lumiere" } };
    const perms = patientPermissions(admin, p);
    expect(perms.canView).toBe(true);
    expect(perms.canWriteTreatmentNote).toBe(false);
  });
});

describe("searchPatients", () => {
  it("returns the nurse's own patients when query is blank", () => {
    const state = stateWith(nursePatient("p1", "u-sarah"), nursePatient("p2", "u-other"));
    const result = searchPatients(state, "", sarahIndependent);
    expect(result.map((p) => p.id)).toEqual(["p1"]);
  });
  it("filters by name within the visible scope", () => {
    const state = stateWith(nursePatient("p1", "u-sarah"));
    expect(searchPatients(state, "donovan", sarahIndependent)).toHaveLength(1);
    expect(searchPatients(state, "zzz", sarahIndependent)).toHaveLength(0);
  });

  // Spec (appointments — add-appointment patient search): match by phone number.
  it("finds a patient by phone regardless of digit grouping", () => {
    const state = stateWith(nursePatient("p1", "u-sarah")); // stored as "0432 901 343"
    expect(searchPatients(state, "0432 901 343", sarahIndependent).map((p) => p.id)).toEqual(["p1"]);
    expect(searchPatients(state, "0432901343", sarahIndependent).map((p) => p.id)).toEqual(["p1"]);
  });
  it("requires the full phone number (exact digit match, iOS parity)", () => {
    const state = stateWith(nursePatient("p1", "u-sarah"));
    expect(searchPatients(state, "0432 901", sarahIndependent)).toHaveLength(0);
  });
  it("scopes phone search to visible patients", () => {
    const state = stateWith(nursePatient("p1", "u-other"));
    expect(searchPatients(state, "0432 901 343", sarahIndependent)).toHaveLength(0);
  });

  // Spec: match by date of birth entered as dd/mm/yyyy.
  it("finds a patient by date of birth in dd/mm/yyyy (padded or not)", () => {
    const state = stateWith(nursePatient("p1", "u-sarah")); // dob 1987-07-04
    expect(searchPatients(state, "04/07/1987", sarahIndependent).map((p) => p.id)).toEqual(["p1"]);
    expect(searchPatients(state, "4/7/1987", sarahIndependent).map((p) => p.id)).toEqual(["p1"]);
  });
  it("returns nothing for a different or malformed date of birth", () => {
    const state = stateWith(nursePatient("p1", "u-sarah"));
    expect(searchPatients(state, "05/07/1987", sarahIndependent)).toHaveLength(0);
    expect(searchPatients(state, "04/07", sarahIndependent)).toHaveLength(0);
  });
  it("scopes date-of-birth search to visible patients", () => {
    const state = stateWith(nursePatient("p1", "u-other"));
    expect(searchPatients(state, "04/07/1987", sarahIndependent)).toHaveLength(0);
  });
});

describe("submitRequest", () => {
  it("creates a pending request from a nurse", () => {
    const state = stateWith(nursePatient("p1", "u-sarah"));
    const { state: next, request } = submitRequest(
      state,
      { patientID: "p1", doctorID: "u-voss", items: [profhilo], identity: sarahIndependent },
      NOW,
    );
    expect(request.status).toBe("pending");
    expect(next.requests[request.id]).toBeDefined();
    expect(request.patientSummary?.fullName).toBe("Claire Donovan");
  });
  it("rejects a request from a doctor", () => {
    const state = stateWith(nursePatient("p1", "u-sarah"));
    expect(() =>
      submitRequest(state, { patientID: "p1", doctorID: "u-voss", items: [profhilo], identity: voss }, NOW),
    ).toThrow();
  });
});

describe("approveRequest", () => {
  it("issues one authorisation per medication with 5 repeats and 6-month expiry, plus one billing event", () => {
    let state = stateWith(nursePatient("p1", "u-sarah"));
    const submitted = submitRequest(
      state,
      { patientID: "p1", doctorID: "u-voss", items: [profhilo], identity: sarahIndependent },
      NOW,
    );
    state = submitted.state;
    const { state: next, granted } = approveRequest(state, submitted.request.id, voss, NOW);

    expect(granted).toHaveLength(1);
    expect(granted[0].repeatsRemaining).toBe(REPEATS_PER_AUTHORISATION);
    expect(next.requests[submitted.request.id].status).toBe("approved");
    expect(next.patients["p1"].prescribingDoctorIDs).toContain("u-voss");

    const expiry = new Date(granted[0].expiresAt);
    const start = new Date(NOW);
    expect(expiry.getUTCMonth()).toBe((start.getUTCMonth() + VALIDITY_MONTHS) % 12);
  });
  it("refuses approval from a doctor who does not own the request", () => {
    let state = stateWith(nursePatient("p1", "u-sarah"));
    const submitted = submitRequest(
      state, { patientID: "p1", doctorID: "u-voss", items: [profhilo], identity: sarahIndependent }, NOW,
    );
    state = submitted.state;
    const other: Identity = { ...voss, user: { id: "u-okafor", name: "Dr James Okafor" } };
    expect(() => approveRequest(state, submitted.request.id, other, NOW)).toThrow();
  });
});

describe("requireEdit", () => {
  it("sends the request back without approving (no flat reject)", () => {
    const state = stateWith(nursePatient("p1", "u-sarah"));
    const submitted = submitRequest(
      state, { patientID: "p1", doctorID: "u-voss", items: [profhilo], identity: sarahIndependent }, NOW,
    );
    const next = requireEdit(submitted.state, submitted.request.id, voss);
    expect(next.requests[submitted.request.id].status).toBe("needsEdit");
  });
});

describe("saveTreatmentNote", () => {
  it("consumes one repeat from each ticked authorisation", () => {
    let state = stateWith(nursePatient("p1", "u-sarah"));
    const submitted = submitRequest(
      state, { patientID: "p1", doctorID: "u-voss", items: [profhilo], identity: sarahIndependent }, NOW,
    );
    const approved = approveRequest(submitted.state, submitted.request.id, voss, NOW);
    state = approved.state;
    const authID = approved.granted[0].id;

    const { state: next } = saveTreatmentNote(
      state,
      { patientID: "p1", tickedIDs: [authID], title: "Profhilo session 1", body: "Full face.", medications: [], identity: sarahIndependent },
      NOW,
    );
    expect(next.authorisations[authID].repeatsRemaining).toBe(REPEATS_PER_AUTHORISATION - 1);
    expect(activeAuthorisations(next, "p1", NOW)).toHaveLength(1);
    expect(next.notesByPatient["p1"]).toHaveLength(1);
  });
});

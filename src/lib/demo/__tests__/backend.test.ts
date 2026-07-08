import { describe, it, expect } from "vitest";
import type {
  Appointment,
  AppointmentLead,
  DemoState,
  Identity,
  Patient,
  MedicationItem,
} from "@/lib/demo/types";
import {
  emptyState,
  classifySearch,
  patientPermissions,
  visibleNotesForPatient,
  matchLeadToPatients,
  linkAppointmentPatient,
  searchPatients,
  submitRequest,
  approveRequest,
  requireEdit,
  resubmitRequest,
  withdrawRequest,
  recordAftercareSend,
  mergePatients,
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
    openReviewerDoctorIDs: [],
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

const botoxItem: MedicationItem = { name: "Botox", dosage: "20", category: "neurotoxin", unit: "units", areas: ["Glabella"] };
const fillerItem: MedicationItem = { name: "Juvederm Voluma", dosage: "1", category: "haFiller", unit: "millilitres", areas: ["Cheeks"] };
const manualFiller: MedicationItem = { name: "Compounded HA", dosage: "1", category: "haFiller", unit: "freeText", areas: ["Lips"] };

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

describe("approveRequest — emergency authorisations", () => {
  function approve(items: MedicationItem[], doctor = voss) {
    const state = stateWith(nursePatient("p1", "u-sarah"));
    const submitted = submitRequest(state, { patientID: "p1", doctorID: doctor.user.id, items, identity: sarahIndependent }, NOW);
    return approveRequest(submitted.state, submitted.request.id, doctor, NOW);
  }

  it("creates an adrenaline emergency auth (only) for a non-filler approval", () => {
    const { state } = approve([botoxItem]);
    const em = Object.values(state.emergencyAuthorisationsByID);
    expect(em.map((e) => e.kind)).toEqual(["adrenaline"]);
    expect(em[0]).toMatchObject({ patientID: "p1", doctorID: "u-voss", doctorName: "Dr Elena Voss" });
  });

  it("also creates a hyaluronidase emergency auth for an HA-filler approval", () => {
    const { state } = approve([fillerItem]);
    expect(Object.keys(state.emergencyAuthorisationsByID).sort()).toEqual(["p1_u-voss_adrenaline", "p1_u-voss_hyaluronidase"]);
  });

  it("treats a manual (freeText) HA filler the same as a structured one", () => {
    const { state } = approve([manualFiller]);
    expect(state.emergencyAuthorisationsByID["p1_u-voss_hyaluronidase"]).toBeDefined();
  });

  it("refreshes rather than duplicates on a second approval by the same doctor", () => {
    const first = approve([botoxItem]);
    const later = NOW + 1000;
    const submitted = submitRequest(first.state, { patientID: "p1", doctorID: "u-voss", items: [botoxItem], identity: sarahIndependent }, later);
    const second = approveRequest(submitted.state, submitted.request.id, voss, later);
    const adrenaline = Object.values(second.state.emergencyAuthorisationsByID).filter((e) => e.kind === "adrenaline");
    expect(adrenaline).toHaveLength(1);
    expect(adrenaline[0].refreshedAt).toBe(later);
  });

  it("gives a different prescribing doctor their own record", () => {
    const okafor: Identity = { ...voss, user: { id: "u-okafor", name: "Dr James Okafor" } };
    const { state } = approve([botoxItem], okafor);
    expect(state.emergencyAuthorisationsByID["p1_u-okafor_adrenaline"]).toBeDefined();
  });

  it("does not add emergency records to activeAuthorisations", () => {
    const { state } = approve([fillerItem]);
    // one granted authorisation, not the two emergency records
    expect(activeAuthorisations(state, "p1", NOW)).toHaveLength(1);
  });

  it("skips emergency generation when generateEmergency is false (live mode defers to the backend)", () => {
    const state = stateWith(nursePatient("p1", "u-sarah"));
    const submitted = submitRequest(state, { patientID: "p1", doctorID: "u-voss", items: [fillerItem], identity: sarahIndependent }, NOW);
    const { state: next } = approveRequest(submitted.state, submitted.request.id, voss, NOW, { generateEmergency: false });
    expect(next.emergencyAuthorisationsByID).toEqual({});
    // the authorisation itself is still granted — only the emergency side effect is deferred
    expect(next.requests[submitted.request.id].status).toBe("approved");
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

  it("refuses to resurrect a terminal (withdrawn) request — a doctor cannot regain access", () => {
    const state = stateWith(nursePatient("p1", "u-sarah"));
    const submitted = submitRequest(
      state, { patientID: "p1", doctorID: "u-voss", items: [profhilo], identity: sarahIndependent }, NOW,
    );
    const withdrawn = withdrawRequest(submitted.state, submitted.request.id, sarahIndependent);
    // Without a status guard the doctor could flip withdrawn → needsEdit (an open status) and
    // the reviewer grant would return, defeating withdraw + the TTL sweep (revocation hardening).
    expect(() => requireEdit(withdrawn, submitted.request.id, voss)).toThrow();
  });

  it("refuses to return an already-approved request for edit", () => {
    const state = stateWith(nursePatient("p1", "u-sarah"));
    const submitted = submitRequest(
      state, { patientID: "p1", doctorID: "u-voss", items: [profhilo], identity: sarahIndependent }, NOW,
    );
    const approved = approveRequest(submitted.state, submitted.request.id, voss, NOW);
    expect(() => requireEdit(approved.state, submitted.request.id, voss)).toThrow();
  });
});

describe("patientPermissions — reviewer (open request) read-only access", () => {
  it("grants a doctor with an open request read-only access to the file except general notes", () => {
    const p: Patient = { ...nursePatient("p1", "u-sarah"), openReviewerDoctorIDs: ["u-voss"] };
    const perms = patientPermissions(voss, p);
    // Read what's needed to decide the request: the file and treatment notes.
    expect(perms.canView).toBe(true);
    expect(perms.canViewTreatmentNotes).toBe(true);
    // General/aftercare notes stay hidden (feedback 2026-07-07 [1a]) — they may carry
    // non-clinical remarks irrelevant to the authorisation decision.
    expect(perms.canViewGeneralNotes).toBe(false);
    // And strictly read-only until approval.
    expect(perms.canEditDetails).toBe(false);
    expect(perms.canDelete).toBe(false);
    expect(perms.canWriteTreatmentNote).toBe(false);
    expect(perms.canWriteGeneralNote).toBe(false);
    expect(perms.canSendForms).toBe(false);
  });

  it("hides another author's general notes from the reviewer but shows treatment notes", () => {
    const p: Patient = { ...nursePatient("p1", "u-sarah"), openReviewerDoctorIDs: ["u-voss"] };
    const state: DemoState = {
      ...stateWith(p),
      notesByPatient: {
        p1: [
          { id: "n-gen", patientID: "p1", kind: "general", authorID: "u-sarah", authorBadge: "Nurse", title: "Admin", body: "billing note", createdAt: NOW, consumedAuthorisationIDs: [], medications: [] },
          { id: "n-tx", patientID: "p1", kind: "treatment", authorID: "u-sarah", authorBadge: "Nurse", title: "Tx", body: "profhilo 2ml", createdAt: NOW, consumedAuthorisationIDs: [], medications: [] },
        ],
      },
    };
    const visible = visibleNotesForPatient(state, "p1", voss).map((n) => n.id);
    expect(visible).toContain("n-tx");
    expect(visible).not.toContain("n-gen");
  });

  it("does not grant access to a doctor who is not a reviewer of the patient", () => {
    const p = nursePatient("p1", "u-sarah");
    expect(patientPermissions(voss, p).canView).toBe(false);
  });
});

describe("matchLeadToPatients — return-patient detection (name + DOB, same subject)", () => {
  const claireLead: AppointmentLead = { givenName: "Claire", lastName: "Donovan", dob: "1987-07-04" };

  it("matches an existing same-owner patient on name + full DOB", () => {
    const state = stateWith(nursePatient("p1", "u-sarah"));
    const hits = matchLeadToPatients(state, claireLead, sarahIndependent).map((p) => p.id);
    expect(hits).toEqual(["p1"]);
  });

  it("is case-insensitive on the name", () => {
    const state = stateWith(nursePatient("p1", "u-sarah"));
    const lead: AppointmentLead = { ...claireLead, givenName: "claire", lastName: "DONOVAN" };
    expect(matchLeadToPatients(state, lead, sarahIndependent).map((p) => p.id)).toEqual(["p1"]);
  });

  it("does NOT match a patient owned by a different subject (isolation)", () => {
    const state = stateWith(nursePatient("p1", "u-other"));
    expect(matchLeadToPatients(state, claireLead, sarahIndependent)).toEqual([]);
  });

  it("does NOT match when the DOB differs", () => {
    const state = stateWith(nursePatient("p1", "u-sarah"));
    const lead: AppointmentLead = { ...claireLead, dob: "1990-01-01" };
    expect(matchLeadToPatients(state, lead, sarahIndependent)).toEqual([]);
  });

  it("returns [] when the lead has no DOB (never guesses a match on name alone)", () => {
    const state = stateWith(nursePatient("p1", "u-sarah"));
    const lead: AppointmentLead = { givenName: "Claire", lastName: "Donovan" };
    expect(matchLeadToPatients(state, lead, sarahIndependent)).toEqual([]);
  });
});

describe("linkAppointmentPatient — same-subject guard (feedback 2026-07-07 item 4)", () => {
  const leadAppt: Appointment = {
    id: "a1", type: "treatment", ownerID: "u-sarah", dateISO: "2026-07-10",
    startMinute: 600, endMinute: 630, status: "awaitingConfirmation",
    lead: { givenName: "Claire", lastName: "Donovan", dob: "1987-07-04" },
  };
  const withAppt = (patient: Patient): DemoState => ({ ...stateWith(patient), appointments: { a1: leadAppt } });

  it("links a lead to a patient owned by the same subject", () => {
    const next = linkAppointmentPatient(withAppt(nursePatient("p1", "u-sarah")), "a1", "p1", sarahIndependent);
    expect(next.appointments["a1"].patientID).toBe("p1");
    expect(next.appointments["a1"].lead).toBeUndefined();
  });

  it("refuses to link a lead to a patient owned by another subject", () => {
    expect(() => linkAppointmentPatient(withAppt(nursePatient("p1", "u-other")), "a1", "p1", sarahIndependent)).toThrow();
  });
});

describe("openReviewerDoctorIDs maintenance", () => {
  it("adds the addressed doctor on submit and clears them on approval (access then via prescriber)", () => {
    const state = stateWith(nursePatient("p1", "u-sarah"));
    const submitted = submitRequest(
      state, { patientID: "p1", doctorID: "u-voss", items: [profhilo], identity: sarahIndependent }, NOW,
    );
    expect(submitted.state.patients["p1"].openReviewerDoctorIDs).toContain("u-voss");
    expect(patientPermissions(voss, submitted.state.patients["p1"]).canView).toBe(true);

    const approved = approveRequest(submitted.state, submitted.request.id, voss, NOW);
    expect(approved.state.patients["p1"].openReviewerDoctorIDs).not.toContain("u-voss");
    // Still viewable — now as the prescribing doctor.
    expect(approved.state.patients["p1"].prescribingDoctorIDs).toContain("u-voss");
    expect(patientPermissions(voss, approved.state.patients["p1"]).canView).toBe(true);
  });

  it("keeps the reviewer while the request is returned for edit (needsEdit stays open)", () => {
    const state = stateWith(nursePatient("p1", "u-sarah"));
    const submitted = submitRequest(
      state, { patientID: "p1", doctorID: "u-voss", items: [profhilo], identity: sarahIndependent }, NOW,
    );
    const returned = requireEdit(submitted.state, submitted.request.id, voss);
    expect(returned.patients["p1"].openReviewerDoctorIDs).toContain("u-voss");
  });

  it("clears the reviewer when the request is withdrawn (revocation hardening)", () => {
    const state = stateWith(nursePatient("p1", "u-sarah"));
    const submitted = submitRequest(
      state, { patientID: "p1", doctorID: "u-voss", items: [profhilo], identity: sarahIndependent }, NOW,
    );
    expect(submitted.state.patients["p1"].openReviewerDoctorIDs).toContain("u-voss");

    const withdrawn = withdrawRequest(submitted.state, submitted.request.id, sarahIndependent);
    expect(withdrawn.requests[submitted.request.id].status).toBe("withdrawn");
    // Access is revoked the moment the request leaves the open set.
    expect(withdrawn.patients["p1"].openReviewerDoctorIDs).not.toContain("u-voss");
    expect(patientPermissions(voss, withdrawn.patients["p1"]).canView).toBe(false);
  });
});

describe("withdrawRequest", () => {
  const clinicAdmin: Identity = {
    user: { id: "u-admin", name: "Admin" },
    role: "clinicAdmin",
    context: { kind: "clinic", clinic: { id: "clinic-x", name: "X" } },
  };
  const nurseInClinic: Identity = { ...sarahIndependent, context: { kind: "clinic", clinic: { id: "clinic-x", name: "X" } } };
  const otherNurse: Identity = { ...sarahIndependent, user: { id: "u-ruby", name: "Ruby" } };
  const clinicPatient = (id: string): Patient => ({ ...nursePatient(id, "u-sarah"), owner: { kind: "clinic", id: "clinic-x" } });

  function submitted() {
    const state = stateWith(nursePatient("p1", "u-sarah"));
    return submitRequest(
      state, { patientID: "p1", doctorID: "u-voss", items: [profhilo], identity: sarahIndependent }, NOW,
    );
  }

  it("lets the raising nurse withdraw her pending request", () => {
    const s = submitted();
    const next = withdrawRequest(s.state, s.request.id, sarahIndependent);
    expect(next.requests[s.request.id].status).toBe("withdrawn");
  });

  it("lets the raising nurse withdraw a returned (needsEdit) request", () => {
    const s = submitted();
    const returned = requireEdit(s.state, s.request.id, voss);
    const next = withdrawRequest(returned, s.request.id, sarahIndependent);
    expect(next.requests[s.request.id].status).toBe("withdrawn");
  });

  it("lets a clinic admin withdraw a clinic request", () => {
    let state = stateWith(clinicPatient("p1"));
    const s = submitRequest(
      state, { patientID: "p1", doctorID: "u-voss", items: [profhilo], identity: nurseInClinic }, NOW,
    );
    state = s.state;
    const next = withdrawRequest(state, s.request.id, clinicAdmin);
    expect(next.requests[s.request.id].status).toBe("withdrawn");
    expect(next.patients["p1"].openReviewerDoctorIDs).not.toContain("u-voss");
  });

  it("refuses a withdraw from an unrelated nurse", () => {
    const s = submitted();
    expect(() => withdrawRequest(s.state, s.request.id, otherNurse)).toThrow();
  });

  it("refuses a withdraw from the addressed doctor", () => {
    const s = submitted();
    expect(() => withdrawRequest(s.state, s.request.id, voss)).toThrow();
  });

  it("refuses to withdraw an already-approved request", () => {
    const s = submitted();
    const approved = approveRequest(s.state, s.request.id, voss, NOW);
    expect(() => withdrawRequest(approved.state, s.request.id, sarahIndependent)).toThrow();
  });

  it("throws for an unknown request", () => {
    expect(() => withdrawRequest(emptyState(), "nope", sarahIndependent)).toThrow();
  });
});

describe("reviewer is read-only — write paths are blocked", () => {
  it("recordAftercareSend throws for a reviewing doctor (no write grant)", () => {
    const p: Patient = { ...nursePatient("p1", "u-sarah"), openReviewerDoctorIDs: ["u-voss"] };
    const state = stateWith(p);
    expect(() =>
      recordAftercareSend(state, { patientID: "p1", content: "x", medications: [], categories: [], identity: voss }, NOW),
    ).toThrow();
  });
});

describe("mergePatients — reviewer access follows the merge (invariant preserved)", () => {
  const clinicAdmin: Identity = {
    user: { id: "u-admin", name: "Admin" }, role: "clinicAdmin", context: { kind: "clinic", clinic: { id: "clinic-x", name: "X" } },
  };
  const nurseInClinic: Identity = { ...sarahIndependent, context: { kind: "clinic", clinic: { id: "clinic-x", name: "X" } } };
  const clinicPatient = (id: string): Patient => ({ ...nursePatient(id, "u-sarah"), owner: { kind: "clinic", id: "clinic-x" } });

  it("re-points the open request onto the kept file and recomputes its reviewer set", () => {
    let state = stateWith(clinicPatient("keep"), clinicPatient("remove"));
    const submitted = submitRequest(
      state, { patientID: "remove", doctorID: "u-voss", items: [profhilo], identity: nurseInClinic }, NOW,
    );
    state = submitted.state;
    expect(state.patients["remove"].openReviewerDoctorIDs).toContain("u-voss");

    const merged = mergePatients(state, "keep", "remove", clinicAdmin);
    expect(merged.patients["remove"]).toBeUndefined();
    // The request moved to the kept file, so the reviewer follows it — and the invariant
    // holds: every reviewer on the kept file has a matching open request there.
    expect(merged.requests[submitted.request.id].patientID).toBe("keep");
    expect(merged.patients["keep"].openReviewerDoctorIDs).toContain("u-voss");
    const openHere = Object.values(merged.requests).filter(
      (r) => r.patientID === "keep" && (r.status === "pending" || r.status === "needsEdit"),
    );
    for (const doc of merged.patients["keep"].openReviewerDoctorIDs ?? []) {
      expect(openHere.some((r) => r.doctorID === doc)).toBe(true);
    }
  });
});

describe("resubmitRequest", () => {
  const botox: MedicationItem = { name: "Botox", dosage: "20", category: "neurotoxin", unit: "units", areas: ["Glabella"] };

  function returned() {
    const state = stateWith(nursePatient("p1", "u-sarah"));
    const submitted = submitRequest(
      state, { patientID: "p1", doctorID: "u-voss", items: [profhilo], identity: sarahIndependent }, NOW,
    );
    return { id: submitted.request.id, state: requireEdit(submitted.state, submitted.request.id, voss) };
  }

  it("replaces the items and returns the request to pending", () => {
    const { id, state } = returned();
    const next = resubmitRequest(state, { requestID: id, items: [botox], identity: sarahIndependent });
    expect(next.requests[id].status).toBe("pending");
    expect(next.requests[id].items).toEqual([botox]);
    // The addressed doctor is untouched — the rules only permit items + status to change.
    expect(next.requests[id].doctorID).toBe("u-voss");
  });

  it("refuses a resubmit from a different nurse", () => {
    const { id, state } = returned();
    const other: Identity = { ...sarahIndependent, user: { id: "u-other", name: "Nurse Other" } };
    expect(() => resubmitRequest(state, { requestID: id, items: [botox], identity: other })).toThrow();
  });

  it("refuses to resubmit a request that is still pending (not returned)", () => {
    const state = stateWith(nursePatient("p1", "u-sarah"));
    const submitted = submitRequest(
      state, { patientID: "p1", doctorID: "u-voss", items: [profhilo], identity: sarahIndependent }, NOW,
    );
    expect(() =>
      resubmitRequest(submitted.state, { requestID: submitted.request.id, items: [botox], identity: sarahIndependent }),
    ).toThrow();
  });

  it("throws notFound for an unknown request", () => {
    const state = stateWith(nursePatient("p1", "u-sarah"));
    expect(() => resubmitRequest(state, { requestID: "nope", items: [botox], identity: sarahIndependent })).toThrow();
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

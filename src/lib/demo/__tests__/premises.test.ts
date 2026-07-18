// Premises of administration (round 6, spec auth-pdf-feedback-round-6): fallback
// semantics, CRUD patches, request stamping, and approval stamps. Vectors mirror the
// backend's userAdmin/domain tests (wire truth).
import { describe, expect, it } from "vitest";
import {
  BackendError,
  activePremise,
  approveRequest,
  emptyState,
  premisesAfterDelete,
  premisesAfterSave,
  premisesAfterSelect,
  profileForUser,
  submitRequest,
  updateProfile,
} from "@/lib/demo/backend";
import { buildSeedState, SEED_NOW } from "@/lib/demo/seed";
import { DEMO_ACCOUNTS, LUMIERE } from "@/lib/demo/accounts";
import type { DemoState, Identity, MedicationItem, Premise, UserProfile } from "@/lib/demo/types";

const bondi: Premise = { id: "prem-1", name: "Sarah Chen Aesthetics", address: "12 Hall St, Bondi Beach NSW 2026" };
const surry: Premise = { id: "prem-2", name: "The Skin Room", address: "3/21 Crown St, Surry Hills NSW 2010" };

const profile = (over: Partial<UserProfile> = {}): UserProfile => ({
  ahpra: "", abn: "", phone: "", address: "", principalPlace: "",
  premises: [bondi, surry], defaultPremiseId: bondi.id, selectedPremiseId: surry.id,
  ...over,
});

const sarahIndependent: Identity = DEMO_ACCOUNTS[0].identities[0];
const sarahClinic: Identity = DEMO_ACCOUNTS[0].identities[1];
const voss: Identity = DEMO_ACCOUNTS[2].identities[0];

const botox: MedicationItem = {
  name: "Botox", dosage: "20", category: "neurotoxin", unit: "units", areas: ["Glabella"], route: "intramuscular",
};

describe("activePremise (selected → default → first → null)", () => {
  it("prefers the persisted selection", () => {
    expect(activePremise(profile())?.id).toBe(surry.id);
  });
  it("falls back to the default when the selection dangles", () => {
    expect(activePremise(profile({ selectedPremiseId: "gone" }))?.id).toBe(bondi.id);
  });
  it("falls back to the first premise when both pointers dangle", () => {
    expect(activePremise(profile({ defaultPremiseId: "gone", selectedPremiseId: "gone" }))?.id).toBe(bondi.id);
  });
  it("is null with no premises", () => {
    expect(activePremise(profile({ premises: [], defaultPremiseId: undefined, selectedPremiseId: undefined }))).toBeNull();
  });
});

describe("premises CRUD patches", () => {
  it("adds a premise, and the first-ever premise becomes default + selected", () => {
    const first = premisesAfterSave(profile({ premises: [], defaultPremiseId: undefined, selectedPremiseId: undefined }), bondi);
    expect(first).toEqual({ premises: [bondi], defaultPremiseId: bondi.id, selectedPremiseId: bondi.id });
    const second = premisesAfterSave(profile({ premises: [bondi] }), surry);
    expect(second).toEqual({ premises: [bondi, surry] }); // pointers untouched
  });
  it("edits a premise in place by id, trimming fields", () => {
    const patch = premisesAfterSave(profile(), { id: surry.id, name: "  The Skin Room II ", address: " 5 Crown St " });
    expect(patch.premises).toEqual([bondi, { id: surry.id, name: "The Skin Room II", address: "5 Crown St" }]);
  });
  it("rejects a blank name or address", () => {
    expect(() => premisesAfterSave(profile(), { id: "x", name: " ", address: "5 Crown St" })).toThrow(BackendError);
    expect(() => premisesAfterSave(profile(), { id: "x", name: "Name", address: "" })).toThrow(BackendError);
  });
  it("deletes a premise and repoints dangling default/selected to the first remaining", () => {
    const patch = premisesAfterDelete(profile({ selectedPremiseId: bondi.id }), bondi.id);
    expect(patch).toEqual({ premises: [surry], defaultPremiseId: surry.id, selectedPremiseId: surry.id });
  });
  it("keeps valid pointers when deleting an unrelated premise", () => {
    const patch = premisesAfterDelete(profile({ selectedPremiseId: bondi.id }), surry.id);
    expect(patch).toEqual({ premises: [bondi], defaultPremiseId: bondi.id, selectedPremiseId: bondi.id });
  });
  it("refuses to delete the last premise", () => {
    expect(() => premisesAfterDelete(profile({ premises: [bondi] }), bondi.id)).toThrow(BackendError);
  });
  it("refuses to delete or select a premise that does not exist", () => {
    expect(() => premisesAfterDelete(profile(), "ghost")).toThrow(BackendError);
    expect(() => premisesAfterSelect(profile(), "ghost")).toThrow(BackendError);
  });
  it("selects a premise (the patch persists on the users doc)", () => {
    expect(premisesAfterSelect(profile(), bondi.id)).toEqual({ selectedPremiseId: bondi.id });
  });
});

describe("request premise stamping", () => {
  function stateWithSarahPremises(): DemoState {
    const seeded = buildSeedState();
    return updateProfile(seeded, sarahIndependent.user.id, {
      premises: [bondi, surry], defaultPremiseId: bondi.id, selectedPremiseId: surry.id,
    });
  }
  function anyOwnPatient(state: DemoState, identity: Identity): string {
    const patient = Object.values(state.patients).find((p) =>
      identity.context.kind === "independent"
        ? p.owner.kind === "nurse" && p.owner.id === identity.user.id
        : p.owner.kind === "clinic");
    if (!patient) throw new Error("seed has no patient for this identity");
    return patient.id;
  }

  it("stamps the ACTIVE premise on an independent nurse's request", () => {
    const state = stateWithSarahPremises();
    const { request } = submitRequest(
      state,
      { patientID: anyOwnPatient(state, sarahIndependent), doctorID: voss.user.id, items: [botox], identity: sarahIndependent },
      SEED_NOW,
    );
    expect(request.premise).toEqual(surry); // selected, not default
  });

  it("stamps null for clinic-context requests (the document always uses the clinic address)", () => {
    const state = stateWithSarahPremises();
    const { request } = submitRequest(
      state,
      { patientID: anyOwnPatient(state, sarahClinic), doctorID: voss.user.id, items: [botox], identity: sarahClinic },
      SEED_NOW,
    );
    expect(request.premise).toBeNull();
    expect(request.context.kind === "clinic" && request.context.clinic.id).toBe(LUMIERE.id);
  });

  it("stamps null when the nurse has no premises (legacy account)", () => {
    const state = emptyStateWithPatient();
    const { request } = submitRequest(
      state, { patientID: "p-own", doctorID: voss.user.id, items: [botox], identity: sarahIndependent }, SEED_NOW,
    );
    expect(request.premise).toBeNull();
  });

  function emptyStateWithPatient(): DemoState {
    const state = emptyState();
    return {
      ...state,
      patients: {
        "p-own": {
          id: "p-own", givenName: "Test", lastName: "Patient",
          dateOfBirth: { year: 1990, month: 1, day: 1 }, gender: "F", address: "1 Test St",
          phone: "", email: "", allergies: "", currentMedications: "",
          owner: { kind: "nurse", id: sarahIndependent.user.id }, prescribingDoctorIDs: [],
        },
      },
    };
  }
});

describe("approval stamps (round 6)", () => {
  it("copies the request premise and stamps reviewedAt = approval time onto every authorisation", () => {
    const seeded = buildSeedState();
    const state = updateProfile(seeded, sarahIndependent.user.id, {
      premises: [bondi], defaultPremiseId: bondi.id, selectedPremiseId: bondi.id,
    });
    const own = Object.values(state.patients).find((p) => p.owner.kind === "nurse" && p.owner.id === sarahIndependent.user.id);
    if (!own) throw new Error("no independent patient in seed");
    const submitted = submitRequest(
      state, { patientID: own.id, doctorID: voss.user.id, items: [botox, { ...botox, name: "Dysport" }], identity: sarahIndependent }, SEED_NOW,
    );
    const approvedAt = SEED_NOW + 86_400_000;
    const { granted } = approveRequest(submitted.state, submitted.request.id, voss, approvedAt);
    expect(granted).toHaveLength(2);
    for (const a of granted) {
      expect(a.reviewedAt).toBe(approvedAt);
      expect(a.premise).toEqual(bondi);
      expect(a.medication.route).toBe("intramuscular");
    }
  });

  it("stamps the clinic's premises onto a clinic authorisation, mirroring the Cloud Function", () => {
    // A clinic request stamps premise: null deliberately ("use the clinic's address"). The
    // clinic's address must therefore ride onto the authorisation itself, or the client-rendered
    // Clause 68C direction has nowhere to read it from.
    const state = buildSeedState();
    const clinicPatient = Object.values(state.patients).find((p) => p.owner.kind === "clinic");
    if (!clinicPatient) throw new Error("seed has no clinic patient");
    const submitted = submitRequest(
      state,
      { patientID: clinicPatient.id, doctorID: voss.user.id, items: [botox], identity: sarahClinic },
      SEED_NOW,
    );
    const { granted } = approveRequest(submitted.state, submitted.request.id, voss, SEED_NOW + 86_400_000);
    expect(granted[0].premise).toBeNull();
    expect(granted[0].clinicPremise).toEqual({
      id: LUMIERE.id, name: LUMIERE.name, address: LUMIERE.address,
    });
  });

  it("stamps no clinic premises on an independent authorisation", () => {
    const state = buildSeedState();
    const own = Object.values(state.patients).find(
      (p) => p.owner.kind === "nurse" && p.owner.id === sarahIndependent.user.id,
    );
    if (!own) throw new Error("no independent patient in seed");
    const submitted = submitRequest(
      state,
      { patientID: own.id, doctorID: voss.user.id, items: [botox], identity: sarahIndependent },
      SEED_NOW,
    );
    const { granted } = approveRequest(submitted.state, submitted.request.id, voss, SEED_NOW + 86_400_000);
    // `toBeUndefined()` would pass whether the key is absent OR present with value
    // `undefined` — it cannot detect a regression to "stamped empty". Assert absence directly.
    expect("clinicPremise" in granted[0]).toBe(false);
  });

  it("omits clinicPremise (never blanks it) when the clinic's address is missing or whitespace-only", () => {
    // The demo's only clinic fixture (LUMIERE) always carries a clean non-empty address, so a
    // clinic request whose clinic has a blank/whitespace address is otherwise never exercised —
    // this is the "omit, never blank" branch that lets a reader tell "never stamped" apart from
    // "stamped empty". Submit normally, then substitute a blank-address clinic into the stored
    // request before approving, since no seeded identity carries such a clinic.
    const state = buildSeedState();
    const clinicPatient = Object.values(state.patients).find((p) => p.owner.kind === "clinic");
    if (!clinicPatient) throw new Error("seed has no clinic patient");
    const submitted = submitRequest(
      state,
      { patientID: clinicPatient.id, doctorID: voss.user.id, items: [botox], identity: sarahClinic },
      SEED_NOW,
    );
    const blankAddressClinic = { ...LUMIERE, address: "   " };
    const stateWithBlankClinic: DemoState = {
      ...submitted.state,
      requests: {
        ...submitted.state.requests,
        [submitted.request.id]: {
          ...submitted.request,
          context: { kind: "clinic", clinic: blankAddressClinic },
        },
      },
    };
    const { granted } = approveRequest(stateWithBlankClinic, submitted.request.id, voss, SEED_NOW + 86_400_000);
    expect("clinicPremise" in granted[0]).toBe(false);
  });
});

describe("profile premises round-trip through updateProfile", () => {
  it("persists premises, pointers and principal place via the standard edit path", () => {
    let state = emptyState();
    state = updateProfile(state, "u-x", {
      principalPlace: "88 Oxford St", premises: [bondi], defaultPremiseId: bondi.id, selectedPremiseId: bondi.id,
    });
    expect(profileForUser(state, "u-x")).toMatchObject({
      principalPlace: "88 Oxford St", premises: [bondi], defaultPremiseId: bondi.id, selectedPremiseId: bondi.id,
    });
  });
});

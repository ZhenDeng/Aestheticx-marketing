// Client-data isolation guard (spec: client-data-isolation). One pure function decides
// commercial access to a client: "owner" (the owning silo — full manage/top-up/checkout),
// "collaborator" (a practitioner operating on a clinic-owned client), or "none".
import { describe, expect, it } from "vitest";
import { patientAccessLevel } from "../isolation";
import { emptyState } from "../backend";
import { LUMIERE } from "../accounts";
import type { DemoState, Identity, Patient } from "../types";

const sarahIndependent: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "independent" } };
const sarahClinic: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "clinic", clinic: LUMIERE } };
const ruby: Identity = { user: { id: "u-ruby", name: "Ruby Walsh" }, role: "nurse", context: { kind: "clinic", clinic: LUMIERE } };
const voss: Identity = { user: { id: "u-voss", name: "Dr Elena Voss" }, role: "doctor", context: { kind: "independent" } };
const ava: Identity = { user: { id: "u-ava", name: "Ava Lim" }, role: "clinicAdmin", context: { kind: "clinic", clinic: LUMIERE } };

function patientOwnedBy(owner: Patient["owner"]): Patient {
  return {
    id: "p1", givenName: "Test", lastName: "Client", dateOfBirth: { day: 1, month: 1, year: 1990 },
    gender: "F", address: "1 Test St", phone: "0400000000", email: "t@example.com",
    allergies: "", currentMedications: "", owner, prescribingDoctorIDs: [],
  };
}

function stateWithCooperation(active: boolean): DemoState {
  const s = emptyState();
  return {
    ...s,
    cooperationRelationshipsByID: {
      [`u-voss_clinic_${LUMIERE.id}`]: {
        id: `u-voss_clinic_${LUMIERE.id}`, doctorID: "u-voss", doctorName: "Dr Elena Voss",
        counterpartyType: "clinic", counterpartyID: LUMIERE.id, counterpartyName: LUMIERE.name,
        status: active ? "active" : "inactive", authRequestsAllowed: true, invoiceApplies: true,
        priceCentsOverride: null, createdAt: 0, updatedAt: 0,
      },
    },
  };
}

describe("patientAccessLevel", () => {
  const state = emptyState();

  it("grants the owning nurse owner access to a nurse-owned client, independent context only", () => {
    const p = patientOwnedBy({ kind: "nurse", id: "u-sarah" });
    expect(patientAccessLevel(state, sarahIndependent, p)).toBe("owner");
    // Same user, clinic identity: the independent book is not the clinic's.
    expect(patientAccessLevel(state, sarahClinic, p)).toBe("none");
    expect(patientAccessLevel(state, ruby, p)).toBe("none");
    expect(patientAccessLevel(state, voss, p)).toBe("none");
  });

  it("grants the owning doctor owner access to a doctor-owned client and nobody else", () => {
    const p = patientOwnedBy({ kind: "doctor", id: "u-voss" });
    expect(patientAccessLevel(state, voss, p)).toBe("owner");
    expect(patientAccessLevel(state, sarahIndependent, p)).toBe("none");
    expect(patientAccessLevel(state, ava, p)).toBe("none");
  });

  it("grants clinic-context users owner access to the clinic's clients", () => {
    const p = patientOwnedBy({ kind: "clinic", id: LUMIERE.id });
    expect(patientAccessLevel(state, ava, p)).toBe("owner");
    expect(patientAccessLevel(state, sarahClinic, p)).toBe("owner");
    expect(patientAccessLevel(state, ruby, p)).toBe("owner");
    // Same nurse, independent identity: no clinic context, no access.
    expect(patientAccessLevel(state, sarahIndependent, p)).toBe("none");
  });

  it("grants a doctor with an ACTIVE cooperation relationship collaborator access to clinic clients", () => {
    const p = patientOwnedBy({ kind: "clinic", id: LUMIERE.id });
    expect(patientAccessLevel(stateWithCooperation(true), voss, p)).toBe("collaborator");
    expect(patientAccessLevel(stateWithCooperation(false), voss, p)).toBe("none");
    expect(patientAccessLevel(state, voss, p)).toBe("none");
  });

  it("clinical grants do not leak commercial access: a prescriber is not owner/collaborator of a private client", () => {
    const p = { ...patientOwnedBy({ kind: "nurse", id: "u-sarah" }), prescribingDoctorIDs: ["u-voss"] };
    expect(patientAccessLevel(state, voss, p)).toBe("none");
  });

  it("platform admin gets no commercial access (oversight is the admin shell, not billing)", () => {
    const admin: Identity = { user: { id: "u-admin", name: "Priya Nair" }, role: "superAdmin", context: { kind: "independent" } };
    expect(patientAccessLevel(state, admin, patientOwnedBy({ kind: "clinic", id: LUMIERE.id }))).toBe("none");
  });
});

import { describe, expect, it } from "vitest";
import { heldIdentities, prescriberIdentity } from "@/lib/demo/identity";
import { DEMO_ACCOUNTS } from "@/lib/demo/accounts";
import type { CooperationRelationship, Identity } from "@/lib/demo/types";

const doctor: Identity = { user: { id: "u-1", name: "Dr A" }, role: "doctor", context: { kind: "independent" } };
const clinicAdmin: Identity = {
  user: { id: "u-1", name: "Dr A" }, role: "clinicAdmin", context: { kind: "clinic", clinic: { id: "c1", name: "C1" } },
};
const nurse: Identity = { user: { id: "u-2", name: "Nadia" }, role: "nurse", context: { kind: "independent" } };

describe("prescriberIdentity", () => {
  it("returns the doctor identity when the account holds one (any selected workspace)", () => {
    expect(prescriberIdentity([clinicAdmin, doctor])).toBe(doctor);
  });

  it("returns the doctor for a doctor-only account", () => {
    expect(prescriberIdentity([doctor])).toBe(doctor);
  });

  it("returns null when the account holds no doctor identity", () => {
    expect(prescriberIdentity([clinicAdmin])).toBeNull();
    expect(prescriberIdentity([nurse])).toBeNull();
    expect(prescriberIdentity([])).toBeNull();
  });
});

describe("heldIdentities", () => {
  it("prefers availableIdentities when present (live mode)", () => {
    const available = [clinicAdmin, doctor];
    expect(heldIdentities(clinicAdmin, available)).toBe(available);
  });

  it("resolves the demo account's full identity set when availableIdentities is empty (demo mode)", () => {
    // Sarah's demo account holds two nurse identities (independent + clinic).
    const sarah = DEMO_ACCOUNTS.find((a) => a.identities.some((i) => i.user.id === "u-sarah"))!;
    expect(heldIdentities(sarah.identities[0], [])).toBe(sarah.identities);
  });

  it("falls back to just the active identity for an unknown account", () => {
    const stranger: Identity = { user: { id: "u-unknown", name: "X" }, role: "doctor", context: { kind: "independent" } };
    expect(heldIdentities(stranger, [])).toEqual([stranger]);
  });

  it("adds a clinic identity for a demo doctor with an active clinic relationship", () => {
    const relationship: CooperationRelationship = {
      id: "u-1_clinic_c1",
      doctorID: "u-1",
      doctorName: "Dr A",
      counterpartyType: "clinic",
      counterpartyID: "c1",
      counterpartyName: "C1",
      status: "active",
      authRequestsAllowed: true,
      invoiceApplies: true,
      priceCentsOverride: null,
      createdAt: 1,
      updatedAt: 1,
    };

    expect(heldIdentities(doctor, [], [relationship])).toEqual([
      doctor,
      { user: doctor.user, role: "doctor", context: { kind: "clinic", clinic: { id: "c1", name: "C1" } } },
    ]);
    expect(heldIdentities(doctor, [], [{ ...relationship, status: "inactive" }])).toEqual([doctor]);
  });

  it("grants the clinic identity when the kind set includes employee; a pre-kind doc defaults to employee", () => {
    const relationship: CooperationRelationship = {
      id: "u-1_clinic_c1",
      doctorID: "u-1",
      doctorName: "Dr A",
      counterpartyType: "clinic",
      counterpartyID: "c1",
      counterpartyName: "C1",
      status: "active",
      authRequestsAllowed: true,
      invoiceApplies: true,
      priceCentsOverride: null,
      createdAt: 1,
      updatedAt: 1,
    };
    const clinicIdentity = { user: doctor.user, role: "doctor", context: { kind: "clinic", clinic: { id: "c1", name: "C1" } } };

    expect(heldIdentities(doctor, [], [{ ...relationship, relationshipKinds: ["employee"] }])).toEqual([doctor, clinicIdentity]);
    // A prescriber-only relationship cooperates externally — no membership, no "Practise as".
    expect(heldIdentities(doctor, [], [{ ...relationship, relationshipKinds: ["prescriber"] }])).toEqual([doctor]);
    // Both kinds: the employee membership applies.
    expect(heldIdentities(doctor, [], [{ ...relationship, relationshipKinds: ["employee", "prescriber"] }])).toEqual([doctor, clinicIdentity]);
    // Absent kinds (every relationship created before kinds existed) keep employee behaviour.
    expect(heldIdentities(doctor, [], [relationship])).toEqual([doctor, clinicIdentity]);
  });
});

import { describe, it, expect } from "vitest";
import { identitiesFromClaims, type DemoClaims } from "@/lib/firebase/identity";

const userDoc = { name: "Sarah Chen" };

describe("identitiesFromClaims", () => {
  it("builds an independent identity for a nurse with no clinics", () => {
    const claims: DemoClaims = { uid: "u-sarah", roles: ["nurse"], clinics: {} };
    const ids = identitiesFromClaims(claims, userDoc);
    expect(ids).toHaveLength(1);
    expect(ids[0]).toEqual({
      user: { id: "u-sarah", name: "Sarah Chen" },
      role: "nurse",
      context: { kind: "independent" },
    });
  });

  it("adds a clinic identity per clinic membership, named from the clinic doc", () => {
    const claims: DemoClaims = { uid: "u-sarah", roles: ["nurse"], clinics: { "clinic-lumiere": "employee" } };
    const ids = identitiesFromClaims(claims, userDoc, { "clinic-lumiere": { name: "Lumière Clinic" } });
    expect(ids).toHaveLength(2);
    expect(ids[1].context).toEqual({ kind: "clinic", clinic: { id: "clinic-lumiere", name: "Lumière Clinic" } });
  });

  // Owner feedback 04/08 bug 1: the profile's premises display for a clinic identity is the
  // CLINIC's premise, so the address resolved from the member-readable clinics/{id} doc must
  // ride on the ClinicRef. Absent or blank → omitted (never an empty-string address).
  it("carries the clinic's street address on the ClinicRef when resolved", () => {
    const claims: DemoClaims = { uid: "u-sarah", roles: ["nurse"], clinics: { "clinic-lumiere": "employee" } };
    const ids = identitiesFromClaims(claims, userDoc, {
      "clinic-lumiere": { name: "Lumière Clinic", address: "2 Notts Ave, Bondi Beach NSW 2026" },
    });
    expect(ids[1].context).toEqual({
      kind: "clinic",
      clinic: { id: "clinic-lumiere", name: "Lumière Clinic", address: "2 Notts Ave, Bondi Beach NSW 2026" },
    });
  });

  it("omits the address key entirely when the clinic doc has none", () => {
    const claims: DemoClaims = { uid: "u-sarah", roles: ["nurse"], clinics: { "clinic-lumiere": "employee" } };
    const ids = identitiesFromClaims(claims, userDoc, { "clinic-lumiere": { name: "Lumière Clinic", address: "   " } });
    expect(ids[1].context).toEqual({ kind: "clinic", clinic: { id: "clinic-lumiere", name: "Lumière Clinic" } });
  });

  it("maps a clinic admin membership to the clinicAdmin role", () => {
    const claims: DemoClaims = { uid: "u-ava", roles: [], clinics: { "clinic-lumiere": "admin" } };
    const ids = identitiesFromClaims(claims, { name: "Ava Lim" }, { "clinic-lumiere": { name: "Lumière Clinic" } });
    expect(ids).toHaveLength(1);
    expect(ids[0].role).toBe("clinicAdmin");
    expect(ids[0].context).toEqual({ kind: "clinic", clinic: { id: "clinic-lumiere", name: "Lumière Clinic" } });
  });

  // The raw clinic id must NEVER stand in for the clinic's name. It reached the dashboard as
  // "Acting as nurse · xY3kf9…" — the same defect class as the raw-uid prescriber name, and the
  // reason ClinicRef.name is now blank-when-unknown: a caller can detect "unknown" and omit the
  // clause, whereas an id is a non-empty string that every consumer happily renders.
  it("leaves the clinic name BLANK rather than falling back to the clinic id", () => {
    const claims: DemoClaims = { uid: "u-sarah", roles: ["nurse"], clinics: { "clinic-lumiere": "employee" } };
    const unresolved = identitiesFromClaims(claims, userDoc);
    expect(unresolved[1].context).toEqual({ kind: "clinic", clinic: { id: "clinic-lumiere", name: "" } });

    const missingEntry = identitiesFromClaims(claims, userDoc, { "clinic-other": { name: "Other" } });
    expect(missingEntry[1].context).toEqual({ kind: "clinic", clinic: { id: "clinic-lumiere", name: "" } });
  });

  it("ignores a blank or whitespace-only clinic name", () => {
    const claims: DemoClaims = { uid: "u-sarah", roles: ["nurse"], clinics: { "clinic-lumiere": "employee" } };
    const ids = identitiesFromClaims(claims, userDoc, { "clinic-lumiere": { name: "   " } });
    expect(ids[1].context).toEqual({ kind: "clinic", clinic: { id: "clinic-lumiere", name: "" } });
  });

  it("builds an independent doctor identity", () => {
    const claims: DemoClaims = { uid: "u-voss", roles: ["doctor"], clinics: {} };
    const ids = identitiesFromClaims(claims, { name: "Dr Elena Voss" });
    expect(ids[0].role).toBe("doctor");
  });

  // Clinic-employee-only nurse (02/08): registered without an ABN — the nurse role stays on
  // the claims (roles-driven surfaces need it) but must never mint an independent identity.
  describe("employeeOnly claim", () => {
    it("suppresses the independent nurse identity, leaving only clinic workspaces", () => {
      const claims: DemoClaims = {
        uid: "u-mia", roles: ["nurse"], clinics: { "clinic-lumiere": "employee" }, employeeOnly: true,
      };
      const ids = identitiesFromClaims(claims, { name: "Mia Torres" }, { "clinic-lumiere": { name: "Lumière Clinic" } });
      expect(ids).toHaveLength(1);
      expect(ids[0].role).toBe("nurse");
      expect(ids[0].context).toEqual({ kind: "clinic", clinic: { id: "clinic-lumiere", name: "Lumière Clinic" } });
    });

    it("resolves ZERO identities when the last membership is revoked (the lockout the login page must explain)", () => {
      const claims: DemoClaims = { uid: "u-mia", roles: ["nurse"], clinics: {}, employeeOnly: true };
      expect(identitiesFromClaims(claims, { name: "Mia Torres" })).toHaveLength(0);
    });

    it("does not suppress a doctor or superAdmin independent identity (misconfigured flag)", () => {
      const claims: DemoClaims = { uid: "u-x", roles: ["doctor"], clinics: {}, employeeOnly: true };
      const ids = identitiesFromClaims(claims, { name: "Dr X" });
      expect(ids).toHaveLength(1);
      expect(ids[0].role).toBe("doctor");
    });

    it("changes nothing when the flag is absent or false", () => {
      const claims: DemoClaims = { uid: "u-sarah", roles: ["nurse"], clinics: {}, employeeOnly: false };
      expect(identitiesFromClaims(claims, userDoc)).toHaveLength(1);
      expect(identitiesFromClaims(claims, userDoc)[0].context.kind).toBe("independent");
    });
  });
});

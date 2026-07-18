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
    const ids = identitiesFromClaims(claims, userDoc, { "clinic-lumiere": "Lumière Clinic" });
    expect(ids).toHaveLength(2);
    expect(ids[1].context).toEqual({ kind: "clinic", clinic: { id: "clinic-lumiere", name: "Lumière Clinic" } });
  });

  it("maps a clinic admin membership to the clinicAdmin role", () => {
    const claims: DemoClaims = { uid: "u-ava", roles: [], clinics: { "clinic-lumiere": "admin" } };
    const ids = identitiesFromClaims(claims, { name: "Ava Lim" }, { "clinic-lumiere": "Lumière Clinic" });
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

    const missingEntry = identitiesFromClaims(claims, userDoc, { "clinic-other": "Other" });
    expect(missingEntry[1].context).toEqual({ kind: "clinic", clinic: { id: "clinic-lumiere", name: "" } });
  });

  it("ignores a blank or whitespace-only clinic name", () => {
    const claims: DemoClaims = { uid: "u-sarah", roles: ["nurse"], clinics: { "clinic-lumiere": "employee" } };
    const ids = identitiesFromClaims(claims, userDoc, { "clinic-lumiere": "   " });
    expect(ids[1].context).toEqual({ kind: "clinic", clinic: { id: "clinic-lumiere", name: "" } });
  });

  it("builds an independent doctor identity", () => {
    const claims: DemoClaims = { uid: "u-voss", roles: ["doctor"], clinics: {} };
    const ids = identitiesFromClaims(claims, { name: "Dr Elena Voss" });
    expect(ids[0].role).toBe("doctor");
  });
});

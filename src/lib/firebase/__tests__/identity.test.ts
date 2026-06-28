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

  it("adds a clinic identity per clinic membership", () => {
    const claims: DemoClaims = { uid: "u-sarah", roles: ["nurse"], clinics: { "clinic-lumiere": "employee" } };
    const ids = identitiesFromClaims(claims, userDoc);
    expect(ids).toHaveLength(2);
    expect(ids[1].context).toEqual({ kind: "clinic", clinic: { id: "clinic-lumiere", name: "clinic-lumiere" } });
  });

  it("maps a clinic admin membership to the clinicAdmin role", () => {
    const claims: DemoClaims = { uid: "u-ava", roles: [], clinics: { "clinic-lumiere": "admin" } };
    const ids = identitiesFromClaims(claims, { name: "Ava Lim" });
    expect(ids).toHaveLength(1);
    expect(ids[0].role).toBe("clinicAdmin");
    expect(ids[0].context).toEqual({ kind: "clinic", clinic: { id: "clinic-lumiere", name: "clinic-lumiere" } });
  });

  it("builds an independent doctor identity", () => {
    const claims: DemoClaims = { uid: "u-voss", roles: ["doctor"], clinics: {} };
    const ids = identitiesFromClaims(claims, { name: "Dr Elena Voss" });
    expect(ids[0].role).toBe("doctor");
  });
});

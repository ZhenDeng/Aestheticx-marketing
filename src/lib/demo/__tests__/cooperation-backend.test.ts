import { describe, it, expect } from "vitest";
import type { Authorisation, Identity } from "@/lib/demo/types";
import {
  emptyState, setCooperationRelationship, removeCooperationRelationship, cooperatingDoctors,
  relationshipAuditForRelationship, billableAuthorisations,
} from "@/lib/demo/backend";

const admin: Identity = { user: { id: "u-admin", name: "Admin" }, role: "superAdmin", context: { kind: "independent" } };
const nurse: Identity = { user: { id: "u-sarah", name: "Sarah" }, role: "nurse", context: { kind: "independent" } };
const NOW = Date.UTC(2026, 6, 8);
const ID = "u-voss_nurse_u-sarah";

function baseInput(over: Record<string, unknown> = {}) {
  return {
    doctorID: "u-voss", doctorName: "Dr Voss",
    counterpartyType: "nurse" as const, counterpartyID: "u-sarah", counterpartyName: "Sarah",
    status: "active" as const, authRequestsAllowed: true, invoiceApplies: true, priceCentsOverride: null,
    ...over,
  };
}
function auth(over: Partial<Authorisation> = {}): Authorisation {
  return {
    id: "a1", requestID: "r1", patientID: "p1", doctorID: "u-voss", nurseID: "u-sarah", clinicID: null,
    medication: { name: "X", dosage: "", category: "neurotoxin", unit: "units", areas: [] },
    repeatsRemaining: 5, expiresAt: NOW + 1e10, createdAt: NOW, invoiced: false, ...over,
  };
}

describe("setCooperationRelationship", () => {
  it("creates a relationship + a 'created' audit entry", () => {
    const s = setCooperationRelationship(emptyState(), baseInput(), admin, NOW);
    expect(s.cooperationRelationshipsByID[ID]).toMatchObject({ doctorID: "u-voss", status: "active", createdAt: NOW });
    const audit = relationshipAuditForRelationship(s, ID);
    expect(audit).toHaveLength(1);
    expect(audit[0].action).toBe("created");
  });
  it("refuses a non-superAdmin", () => {
    expect(() => setCooperationRelationship(emptyState(), baseInput(), nurse, NOW)).toThrow();
  });
  it("edit preserves createdAt + logs 'updated'", () => {
    const s1 = setCooperationRelationship(emptyState(), baseInput(), admin, NOW);
    const s2 = setCooperationRelationship(s1, baseInput({ priceCentsOverride: 3000 }), admin, NOW + 1000);
    expect(s2.cooperationRelationshipsByID[ID].createdAt).toBe(NOW);
    expect(s2.cooperationRelationshipsByID[ID].updatedAt).toBe(NOW + 1000);
    expect(s2.cooperationRelationshipsByID[ID].priceCentsOverride).toBe(3000);
    expect(relationshipAuditForRelationship(s2, ID).map((a) => a.action)).toEqual(["updated", "created"]);
  });
  it("rejects a non-positive price override", () => {
    expect(() => setCooperationRelationship(emptyState(), baseInput({ priceCentsOverride: 0 }), admin, NOW)).toThrow();
  });
});

describe("removeCooperationRelationship", () => {
  it("soft-deactivates + logs 'removed'", () => {
    const s1 = setCooperationRelationship(emptyState(), baseInput(), admin, NOW);
    const s2 = removeCooperationRelationship(s1, ID, admin, NOW + 1);
    expect(s2.cooperationRelationshipsByID[ID].status).toBe("inactive");
    expect(relationshipAuditForRelationship(s2, ID)[0].action).toBe("removed");
  });
});

describe("cooperatingDoctors (gate)", () => {
  it("returns only active doctors for the acting nurse", () => {
    let s = setCooperationRelationship(emptyState(), baseInput(), admin, NOW);
    s = setCooperationRelationship(s, baseInput({ doctorID: "u-okafor", doctorName: "Dr Okafor", status: "inactive" }), admin, NOW);
    expect(cooperatingDoctors(s, nurse)).toEqual([{ doctorId: "u-voss", doctorName: "Dr Voss" }]);
  });
  it("is empty for a doctor identity (doctors don't raise requests)", () => {
    const s = setCooperationRelationship(emptyState(), baseInput(), admin, NOW);
    const voss: Identity = { user: { id: "u-voss", name: "Dr Voss" }, role: "doctor", context: { kind: "independent" } };
    expect(cooperatingDoctors(s, voss)).toEqual([]);
  });
});

describe("invoiceApplies gates billable authorisations", () => {
  it("excludes a counterparty whose relationship has invoiceApplies:false", () => {
    let s = { ...emptyState(), authorisations: { a1: auth() } };
    expect(billableAuthorisations(s, "u-voss")).toHaveLength(1);
    s = setCooperationRelationship(s, baseInput({ invoiceApplies: false }), admin, NOW);
    expect(billableAuthorisations(s, "u-voss")).toHaveLength(0);
  });
});

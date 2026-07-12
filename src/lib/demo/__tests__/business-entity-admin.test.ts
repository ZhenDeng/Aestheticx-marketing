import { describe, it, expect } from "vitest";
import { emptyState, setBusinessEntity, setBusinessEntityActive, businessEntitiesList, BackendError } from "@/lib/demo/backend";
import { buildSeedState } from "@/lib/demo/seed";
import type { Identity } from "@/lib/demo/types";

const admin: Identity = { user: { id: "u-admin", name: "Admin" }, role: "superAdmin", context: { kind: "independent" } };
const nurse: Identity = { user: { id: "u-sarah", name: "Sarah" }, role: "nurse", context: { kind: "independent" } };

describe("setBusinessEntity (demo, Tier 3 #4)", () => {
  it("creates an entity at its owner id, normalizing the ABN", () => {
    const s = setBusinessEntity(emptyState(), { id: "clinic-lumiere", type: "clinic", legalName: "Lumière Clinic Pty Ltd", tradingName: "Lumière", abn: "82 601 443 218" }, admin);
    expect(s.businessEntitiesByID["clinic-lumiere"]).toEqual({
      id: "clinic-lumiere", type: "clinic", legalName: "Lumière Clinic Pty Ltd", tradingName: "Lumière", abn: "82601443218", isActive: true,
    });
  });
  it("edits an existing entity by id (id + createdAt-equivalent kept; no fork)", () => {
    let s = setBusinessEntity(emptyState(), { id: "clinic-lumiere", type: "clinic", legalName: "Lumière", abn: "" }, admin);
    s = setBusinessEntity(s, { id: "clinic-lumiere", type: "clinic", legalName: "Lumière Clinic Pty Ltd", abn: "82601443218" }, admin);
    expect(Object.keys(s.businessEntitiesByID)).toEqual(["clinic-lumiere"]);
    expect(s.businessEntitiesByID["clinic-lumiere"].abn).toBe("82601443218");
  });
  it("allows a blank ABN (clinic awaiting one) and normalizes a blank tradingName to undefined", () => {
    const e = setBusinessEntity(emptyState(), { id: "clinic-x", type: "clinic", legalName: "  X Clinic  ", tradingName: "  ", abn: "" }, admin).businessEntitiesByID["clinic-x"];
    expect(e.abn).toBe("");
    expect(e.tradingName).toBeUndefined();
    expect(e.legalName).toBe("X Clinic");
  });
  it("refuses a non-superAdmin, a blank id/legalName, a bad ABN, and an over-long legalName", () => {
    expect(() => setBusinessEntity(emptyState(), { id: "c1", type: "clinic", legalName: "X", abn: "" }, nurse)).toThrow(BackendError);
    expect(() => setBusinessEntity(emptyState(), { id: "  ", type: "clinic", legalName: "X", abn: "" }, admin)).toThrow(BackendError);
    expect(() => setBusinessEntity(emptyState(), { id: "c1", type: "clinic", legalName: "  ", abn: "" }, admin)).toThrow(BackendError);
    expect(() => setBusinessEntity(emptyState(), { id: "c1", type: "clinic", legalName: "X", abn: "123" }, admin)).toThrow(BackendError);
    expect(() => setBusinessEntity(emptyState(), { id: "c1", type: "clinic", legalName: "x".repeat(161), abn: "" }, admin)).toThrow(BackendError);
  });
  it("refuses an id containing '/' or '.' (doc-id path injection parity)", () => {
    expect(() => setBusinessEntity(emptyState(), { id: "a/b/c", type: "clinic", legalName: "X", abn: "" }, admin)).toThrow(BackendError);
    expect(() => setBusinessEntity(emptyState(), { id: "../users/x", type: "clinic", legalName: "X", abn: "" }, admin)).toThrow(BackendError);
  });
});

describe("setBusinessEntityActive (demo)", () => {
  it("toggles active status while keeping the entity", () => {
    let s = setBusinessEntity(emptyState(), { id: "clinic-lumiere", type: "clinic", legalName: "Lumière", abn: "82601443218" }, admin);
    s = setBusinessEntityActive(s, "clinic-lumiere", false, admin);
    expect(s.businessEntitiesByID["clinic-lumiere"].isActive).toBe(false);
    s = setBusinessEntityActive(s, "clinic-lumiere", true, admin);
    expect(s.businessEntitiesByID["clinic-lumiere"].isActive).toBe(true);
  });
  it("refuses a non-superAdmin and an unknown id", () => {
    const s = setBusinessEntity(emptyState(), { id: "clinic-lumiere", type: "clinic", legalName: "Lumière", abn: "" }, admin);
    expect(() => setBusinessEntityActive(s, "clinic-lumiere", false, nurse)).toThrow(BackendError);
    expect(() => setBusinessEntityActive(s, "nope", false, admin)).toThrow(BackendError);
  });
});

describe("businessEntitiesList + demo seed", () => {
  it("lists entities sorted by type, then legal name", () => {
    let s = setBusinessEntity(emptyState(), { id: "u-voss", type: "independentDoctor", legalName: "Voss Aesthetics", abn: "" }, admin);
    s = setBusinessEntity(s, { id: "clinic-lumiere", type: "clinic", legalName: "Lumière", abn: "" }, admin);
    expect(businessEntitiesList(s).map((e) => e.type)).toEqual(["clinic", "independentDoctor"]); // clinic < independentDoctor
  });
  it("buildSeedState seeds demo business entities incl. a clinic with a blank ABN (the surfaced gap)", () => {
    const seeded = buildSeedState();
    expect(seeded.businessEntitiesByID["clinic-lumiere"]).toMatchObject({ type: "clinic", abn: "" });
    expect(seeded.businessEntitiesByID["u-voss"]).toMatchObject({ type: "independentDoctor", abn: "51824753556" });
  });
});

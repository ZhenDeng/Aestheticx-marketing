import { describe, it, expect } from "vitest";
import { emptyState, setProduct, setProductActive, catalogProductsList, BackendError } from "@/lib/demo/backend";
import { buildSeedState } from "@/lib/demo/seed";
import type { Identity } from "@/lib/demo/types";

const admin: Identity = { user: { id: "u-admin", name: "Admin" }, role: "superAdmin", context: { kind: "independent" } };
const nurse: Identity = { user: { id: "u-sarah", name: "Sarah" }, role: "nurse", context: { kind: "independent" } };

describe("setProduct (demo, Tier 3 #5B)", () => {
  it("creates a product with a slug id matching the backend scheme", () => {
    const s = setProduct(emptyState(), { category: "haFiller", brand: "Juvederm", name: "Voluma", unit: "millilitres" }, admin);
    expect(s.productsByID["hafiller-juvederm-voluma"]).toMatchObject({
      id: "hafiller-juvederm-voluma", category: "haFiller", brand: "Juvederm", name: "Voluma", unit: "millilitres", isActive: true,
    });
  });
  it("edits an existing product by id (id kept stable, no fork)", () => {
    let s = setProduct(emptyState(), { category: "haFiller", brand: "Juvederm", name: "Voluma", unit: "millilitres" }, admin);
    s = setProduct(s, { id: "hafiller-juvederm-voluma", category: "haFiller", brand: "Juvederm", name: "Voluma XC", unit: "millilitres" }, admin);
    expect(Object.keys(s.productsByID)).toEqual(["hafiller-juvederm-voluma"]);
    expect(s.productsByID["hafiller-juvederm-voluma"].name).toBe("Voluma XC");
  });
  it("normalizes a blank brand to undefined and trims the name", () => {
    const p = setProduct(emptyState(), { category: "neurotoxin", brand: "  ", name: "  Botox  ", unit: "units" }, admin).productsByID["neurotoxin-botox"];
    expect(p.brand).toBeUndefined();
    expect(p.name).toBe("Botox");
  });
  it("refuses a non-superAdmin, a blank name, and an over-long name/brand (backend cap parity)", () => {
    expect(() => setProduct(emptyState(), { category: "other", name: "X", unit: "freeText" }, nurse)).toThrow(BackendError);
    expect(() => setProduct(emptyState(), { category: "other", name: "  ", unit: "freeText" }, admin)).toThrow(BackendError);
    expect(() => setProduct(emptyState(), { category: "other", name: "x".repeat(121), unit: "freeText" }, admin)).toThrow(BackendError);
    expect(() => setProduct(emptyState(), { category: "haFiller", brand: "b".repeat(121), name: "V", unit: "millilitres" }, admin)).toThrow(BackendError);
  });
});

describe("setProductActive (demo)", () => {
  it("toggles active status while keeping the product", () => {
    let s = setProduct(emptyState(), { category: "neurotoxin", name: "Botox", unit: "units" }, admin);
    s = setProductActive(s, "neurotoxin-botox", false, admin);
    expect(s.productsByID["neurotoxin-botox"].isActive).toBe(false);
    s = setProductActive(s, "neurotoxin-botox", true, admin);
    expect(s.productsByID["neurotoxin-botox"].isActive).toBe(true);
  });
  it("refuses a non-superAdmin and an unknown id", () => {
    const s = setProduct(emptyState(), { category: "neurotoxin", name: "Botox", unit: "units" }, admin);
    expect(() => setProductActive(s, "neurotoxin-botox", false, nurse)).toThrow(BackendError);
    expect(() => setProductActive(s, "nope", false, admin)).toThrow(BackendError);
  });
});

describe("catalogProductsList + demo seed", () => {
  it("lists products sorted by category, then brand, then name", () => {
    let s = setProduct(emptyState(), { category: "neurotoxin", name: "Botox", unit: "units" }, admin);
    s = setProduct(s, { category: "haFiller", brand: "Juvederm", name: "Voluma", unit: "millilitres" }, admin);
    expect(catalogProductsList(s).map((p) => p.name)).toEqual(["Voluma", "Botox"]); // haFiller < neurotoxin
  });
  it("buildSeedState seeds the 73-product static catalog into productsByID", () => {
    const seeded = buildSeedState();
    expect(Object.keys(seeded.productsByID)).toHaveLength(73);
    expect(seeded.productsByID["neurotoxin-botox"]).toBeDefined();
  });
});

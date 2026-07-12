import { describe, it, expect } from "vitest";
import {
  PRODUCT_CATALOG, productsInCategory, brandsInCategory, productsInBrand,
  searchProducts, productById, productLabel, treatmentAreasFor, quantityCaption,
  effectiveCatalog, type CatalogProduct,
} from "@/lib/demo/catalog";
import { resolveRecentlyUsed } from "@/lib/demo/requestBuilder";

// A small catalog with one active + one inactive product per relevant slice, for active-filtering.
const cat = (over: Partial<CatalogProduct>): CatalogProduct =>
  ({ id: "p", category: "haFiller", brand: "Juvederm", name: "X", unit: "millilitres", isActive: true, ...over });
const TEST_CATALOG: CatalogProduct[] = [
  cat({ id: "active-1", name: "Voluma" }),
  cat({ id: "inactive-1", name: "Volbella", isActive: false }),
  cat({ id: "gone-brand", brand: "Belotero", name: "Balance", isActive: false }),
  cat({ id: "neuro-active", category: "neurotoxin", brand: undefined, name: "Botox", unit: "units" }),
];

describe("catalog data", () => {
  it("has the expected per-category counts and total", () => {
    expect(productsInCategory("neurotoxin")).toHaveLength(7);
    expect(productsInCategory("haFiller")).toHaveLength(44);
    expect(productsInCategory("skinBooster")).toHaveLength(13);
    expect(productsInCategory("collagenStimulator")).toHaveLength(7);
    expect(productsInCategory("prpPrf")).toHaveLength(2);
    expect(PRODUCT_CATALOG).toHaveLength(73);
  });
  it("assigns the right unit per category (and collagen varies)", () => {
    expect(productsInCategory("neurotoxin").every((p) => p.unit === "units")).toBe(true);
    expect(productsInCategory("haFiller").every((p) => p.unit === "millilitres")).toBe(true);
    expect(productById("collagenstimulator-sculptra")?.unit).toBe("vial");
    expect(productById("collagenstimulator-radiesse")?.unit).toBe("syringe");
    expect(productById("collagenstimulator-ellanse")?.unit).toBe("millilitres");
  });
});

describe("brand grouping", () => {
  it("lists the nine HA-filler brands in first-seen order", () => {
    expect(brandsInCategory("haFiller")).toEqual([
      "Juvederm", "Restylane", "Belotero", "Teoxane", "Stylage", "Art Filler", "Saypha", "e.p.t.q", "QT Fill",
    ]);
    expect(brandsInCategory("neurotoxin")).toEqual([]);
  });
  it("filters products by brand", () => {
    expect(productsInBrand("haFiller", "Juvederm")).toHaveLength(6);
  });
});

describe("search", () => {
  it("matches name or brand, case-insensitively; empty query → []", () => {
    const names = searchProducts("vol").map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(["Voluma", "Volift", "Volux", "Volbella"]));
    expect(searchProducts("juvederm").length).toBeGreaterThanOrEqual(6);
    expect(searchProducts("  ")).toEqual([]);
  });
});

describe("labels, areas, captions", () => {
  it("labels branded vs unbranded products", () => {
    expect(productLabel({ id: "x", category: "haFiller", brand: "Juvederm", name: "Voluma", unit: "millilitres", isActive: true })).toBe("Juvederm · Voluma");
    expect(productLabel({ id: "y", category: "skinBooster", name: "Profhilo", unit: "millilitres", isActive: true })).toBe("Profhilo");
  });
  it("returns the right treatment-area list per category/unit", () => {
    expect(treatmentAreasFor("neurotoxin", "units")).toContain("Glabella");
    expect(treatmentAreasFor("skinBooster", "millilitres")).toContain("Full Face");
    expect(treatmentAreasFor("prpPrf", "tube")).toContain("Scalp");
    expect(treatmentAreasFor("collagenStimulator", "millilitres")).toContain("Cheek");
    expect(treatmentAreasFor("collagenStimulator", "vial")).toContain("Full Face (exclude forehead)");
    expect(treatmentAreasFor("haFiller", "millilitres")).toContain("Tear Trough");
    const neuro = treatmentAreasFor("neurotoxin", "units");
    expect(neuro[neuro.length - 1]).toBe("Other");
  });
  it("captions dose vs amount", () => {
    expect(quantityCaption("units")).toBe("Dose");
    expect(quantityCaption("millilitres")).toBe("Amount");
  });
});

describe("active status (Tier 3 #5A — inactive hidden from selection, iOS parity)", () => {
  it("every seeded product is active", () => {
    expect(PRODUCT_CATALOG.every((p) => p.isActive)).toBe(true);
  });
  it("productsInCategory omits inactive products", () => {
    const names = productsInCategory("haFiller", TEST_CATALOG).map((p) => p.name);
    expect(names).toEqual(["Voluma"]); // Volbella + Balance are inactive
  });
  it("search omits inactive products", () => {
    expect(searchProducts("vol", TEST_CATALOG).map((p) => p.name)).toEqual(["Voluma"]); // not "Volbella"
    expect(searchProducts("balance", TEST_CATALOG)).toEqual([]);
  });
  it("brandsInCategory drops a brand whose only product is inactive", () => {
    expect(brandsInCategory("haFiller", TEST_CATALOG)).toEqual(["Juvederm"]); // Belotero gone (inactive-only)
    expect(productsInBrand("haFiller", "Belotero", TEST_CATALOG)).toEqual([]);
  });
  it("recently-used resolves active products only (a deactivated one drops off)", () => {
    const resolved = resolveRecentlyUsed(["active-1", "inactive-1", "missing"], TEST_CATALOG);
    expect(resolved.map((p) => p.id)).toEqual(["active-1"]);
  });
  it("productById still resolves an inactive product (raw ref lookup)", () => {
    expect(productById("inactive-1", TEST_CATALOG)?.name).toBe("Volbella");
  });
});

describe("effectiveCatalog (Tier 3 #5B fallback)", () => {
  it("falls back to the built-in list when the store holds no products", () => {
    expect(effectiveCatalog({})).toBe(PRODUCT_CATALOG);
  });
  it("uses the hydrated/edited products when the store holds any", () => {
    const hydrated = { "active-1": cat({ id: "active-1", name: "Voluma" }) };
    const result = effectiveCatalog(hydrated);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Voluma");
    expect(result).not.toBe(PRODUCT_CATALOG);
  });
  it("threads into a selection read (a store with one inactive product yields no active selection)", () => {
    const hydrated = { x: cat({ id: "x", category: "neurotoxin", brand: undefined, name: "Botox", unit: "units", isActive: false }) };
    expect(productsInCategory("neurotoxin", effectiveCatalog(hydrated))).toHaveLength(0);
  });
});

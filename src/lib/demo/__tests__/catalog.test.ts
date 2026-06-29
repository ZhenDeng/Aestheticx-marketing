import { describe, it, expect } from "vitest";
import {
  PRODUCT_CATALOG, productsInCategory, brandsInCategory, productsInBrand,
  searchProducts, productById, productLabel, treatmentAreasFor, quantityCaption,
} from "@/lib/demo/catalog";

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
    expect(productLabel({ id: "x", category: "haFiller", brand: "Juvederm", name: "Voluma", unit: "millilitres" })).toBe("Juvederm · Voluma");
    expect(productLabel({ id: "y", category: "skinBooster", name: "Profhilo", unit: "millilitres" })).toBe("Profhilo");
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

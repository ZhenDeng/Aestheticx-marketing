import { describe, it, expect, beforeEach } from "vitest";
import {
  RECENTLY_USED_CAPACITY, RECENTLY_USED_STORAGE_KEY,
  recordRecentlyUsed, resolveRecentlyUsed, loadRecentlyUsed, recordRecentlyUsedProduct,
  composeOtherDosage, splitCustomAreas,
} from "@/lib/demo/requestBuilder";

// Port of iOS RecentlyUsedProducts (AXDomain/PrescribingProducts.swift):
// most-recent-first, de-duplicated, capacity-bounded (8).
describe("recordRecentlyUsed (pure model)", () => {
  it("inserts a new id at the front", () => {
    expect(recordRecentlyUsed([], "a")).toEqual(["a"]);
    expect(recordRecentlyUsed(["a"], "b")).toEqual(["b", "a"]);
  });

  it("moves an existing id to the front without duplicating it", () => {
    expect(recordRecentlyUsed(["a", "b", "c"], "b")).toEqual(["b", "a", "c"]);
    expect(recordRecentlyUsed(["a", "b"], "a")).toEqual(["a", "b"]);
  });

  it("caps at 8 entries, dropping the oldest", () => {
    expect(RECENTLY_USED_CAPACITY).toBe(8);
    const ids = ["h", "g", "f", "e", "d", "c", "b", "a"];
    const next = recordRecentlyUsed(ids, "i");
    expect(next).toHaveLength(8);
    expect(next).toEqual(["i", "h", "g", "f", "e", "d", "c", "b"]);
  });

  it("clamps capacity to at least 1", () => {
    expect(recordRecentlyUsed(["a", "b"], "c", 0)).toEqual(["c"]);
  });

  it("does not mutate the input array", () => {
    const ids = ["a", "b"];
    recordRecentlyUsed(ids, "c");
    expect(ids).toEqual(["a", "b"]);
  });
});

describe("resolveRecentlyUsed", () => {
  it("resolves ids to catalog products preserving recency order", () => {
    const products = resolveRecentlyUsed(["hafiller-juvederm-voluma", "neurotoxin-botox"]);
    expect(products.map((p) => p.name)).toEqual(["Voluma", "Botox"]);
  });

  it("silently drops ids no longer in the catalog", () => {
    const products = resolveRecentlyUsed(["gone-product", "neurotoxin-dysport"]);
    expect(products.map((p) => p.name)).toEqual(["Dysport"]);
  });
});

// Port of iOS RecentlyUsedStore (AXFeatures/AuthorisationRequestBuilder.swift):
// device-local persistence under the same key iOS uses in UserDefaults.
describe("recently-used persistence (device-local)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("uses the iOS UserDefaults key", () => {
    expect(RECENTLY_USED_STORAGE_KEY).toBe("ax.recentlyUsedProducts");
  });

  it("loads an empty list when nothing is stored", () => {
    expect(loadRecentlyUsed()).toEqual([]);
  });

  it("records to the front and persists across loads", () => {
    recordRecentlyUsedProduct("neurotoxin-botox");
    const next = recordRecentlyUsedProduct("hafiller-juvederm-voluma");
    expect(next).toEqual(["hafiller-juvederm-voluma", "neurotoxin-botox"]);
    expect(loadRecentlyUsed()).toEqual(["hafiller-juvederm-voluma", "neurotoxin-botox"]);
  });

  it("dedupes on repeat recording", () => {
    recordRecentlyUsedProduct("a");
    recordRecentlyUsedProduct("b");
    recordRecentlyUsedProduct("a");
    expect(loadRecentlyUsed()).toEqual(["a", "b"]);
  });

  it("truncates stored lists to capacity on load (iOS init prefix)", () => {
    const twelve = Array.from({ length: 12 }, (_, i) => `p${i}`);
    window.localStorage.setItem(RECENTLY_USED_STORAGE_KEY, JSON.stringify(twelve));
    expect(loadRecentlyUsed()).toEqual(twelve.slice(0, 8));
  });

  it("ignores corrupt or non-array stored values", () => {
    window.localStorage.setItem(RECENTLY_USED_STORAGE_KEY, "not json {");
    expect(loadRecentlyUsed()).toEqual([]);
    window.localStorage.setItem(RECENTLY_USED_STORAGE_KEY, JSON.stringify({ nope: true }));
    expect(loadRecentlyUsed()).toEqual([]);
    window.localStorage.setItem(RECENTLY_USED_STORAGE_KEY, JSON.stringify(["ok", 42, null]));
    expect(loadRecentlyUsed()).toEqual(["ok"]);
  });
});

// Port of iOS LineItemEditorView.commit() for the .other category:
// route is folded into dosage as "dose · route"; areas come from comma-split free text.
describe("other / compounded medication helpers", () => {
  it("composes dosage with route as 'dose · route'", () => {
    expect(composeOtherDosage("5mg", "oral")).toBe("5mg · oral");
    expect(composeOtherDosage(" 5mg ", " oral ")).toBe("5mg · oral");
  });

  it("uses the route alone when the dose is empty", () => {
    expect(composeOtherDosage("", "topical")).toBe("topical");
    expect(composeOtherDosage("   ", "topical")).toBe("topical");
  });

  it("leaves the dosage untouched when the route is empty", () => {
    expect(composeOtherDosage("5mg", "")).toBe("5mg");
    expect(composeOtherDosage("5mg", "   ")).toBe("5mg");
  });

  it("splits custom areas on commas, trimming and dropping empties", () => {
    expect(splitCustomAreas("Scalp, Beard area")).toEqual(["Scalp", "Beard area"]);
    expect(splitCustomAreas("  Face ,, ")).toEqual(["Face"]);
    expect(splitCustomAreas("")).toEqual([]);
  });
});

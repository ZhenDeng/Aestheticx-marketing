// Static prescribing catalog, ported verbatim from iOS AXDomain/ProductCatalogSeed.swift
// + PrescribingProducts.swift. Data, not logic — super-admin/deploy-time maintained.
import type { ProductCategory, ProductUnit } from "./types";

export interface CatalogProduct {
  id: string;
  category: ProductCategory;
  brand?: string;
  name: string;
  unit: ProductUnit;
  // Inactive products stay in the catalog data but are hidden from selection/search (iOS parity;
  // spec prescribing-products "Inactive products hidden from selection"). All seed products active.
  isActive: boolean;
}

// slug: [category, brand?, name] joined "-", lowercased, " "→"-", "."→"", "/"→"-"
function makeId(category: ProductCategory, brand: string | undefined, name: string): string {
  return [category as string, brand, name]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join("-")
    .toLowerCase()
    .replace(/ /g, "-")
    .replace(/\./g, "")
    .replace(/\//g, "-");
}

function product(category: ProductCategory, brand: string | undefined, name: string, unit: ProductUnit): CatalogProduct {
  return { id: makeId(category, brand, name), category, brand, name, unit, isActive: true };
}

const NEUROTOXINS = ["Botox", "Dysport", "Xeomin", "Nuceiva", "Letybo", "Relfydess", "Daxxify"]
  .map((n) => product("neurotoxin", undefined, n, "units"));

const HA_BRANDS: [string, string[]][] = [
  ["Juvederm", ["Volbella", "Volift", "Voluma", "Volux", "Ultra XC", "Ultra Plus XC"]],
  ["Restylane", ["Kysse", "Refyne", "Defyne", "Volyme", "Lyft", "Classic"]],
  ["Belotero", ["Balance", "Intense", "Volume", "Lips Contour", "Lips Shape"]],
  ["Teoxane", ["RHA 1", "RHA 2", "RHA 3", "RHA 4", "Ultra Deep", "Redensity 2"]],
  ["Stylage", ["S", "M", "L", "XL", "XXL", "Lips", "Special Lips"]],
  ["Art Filler", ["Fine Line", "Universal", "Lips", "Lips Soft", "Volume"]],
  ["Saypha", ["Filler", "Volume", "Volume Plus"]],
  ["e.p.t.q", ["S100", "S300", "S500"]],
  ["QT Fill", ["Fine", "Deep", "SubQ"]],
];
const HA_FILLERS = HA_BRANDS.flatMap(([brand, names]) =>
  names.map((n) => product("haFiller", brand, n, "millilitres")));

const SKIN_BOOSTERS = [
  "Juvederm Skinvive", "Restylane Vital", "Restylane Vital Light", "Profhilo",
  "Profhilo Structura", "Rejuran Healer", "Rejuran i", "Rejuran s",
  "Belotero Revive", "Redensity 1", "Sunekos 1200", "Sunekos Performa", "NCTF 135HA",
].map((n) => product("skinBooster", undefined, n, "millilitres"));

const COLLAGEN: [string, ProductUnit][] = [
  ["Sculptra", "vial"], ["Lenisna 50", "vial"], ["Lenisna 200", "vial"], ["AestheFill", "vial"],
  ["Radiesse", "syringe"], ["HarmonyCa", "syringe"], ["Ellanse", "millilitres"],
];
const COLLAGEN_STIMULATORS = COLLAGEN.map(([n, u]) => product("collagenStimulator", undefined, n, u));

const PRP_PRF = ["PRP", "PRF"].map((n) => product("prpPrf", undefined, n, "tube"));

export const PRODUCT_CATALOG: CatalogProduct[] = [
  ...NEUROTOXINS, ...HA_FILLERS, ...SKIN_BOOSTERS, ...COLLAGEN_STIMULATORS, ...PRP_PRF,
];

export function categoryDisplayName(category: ProductCategory): string {
  switch (category) {
    case "neurotoxin": return "Neurotoxin";
    case "haFiller": return "HA Filler";
    case "skinBooster": return "Skin Booster";
    case "collagenStimulator": return "Collagen Stimulator";
    case "prpPrf": return "PRP / PRF";
    case "other": return "Other";
  }
}

// Selection reads return ACTIVE products only (iOS `activeProducts` parity). `catalog` is
// injectable for tests / a future hydrated catalog; it defaults to the static seed.
export function productsInCategory(category: ProductCategory, catalog: CatalogProduct[] = PRODUCT_CATALOG): CatalogProduct[] {
  return catalog.filter((p) => p.category === category && p.isActive);
}

export function brandsInCategory(category: ProductCategory, catalog: CatalogProduct[] = PRODUCT_CATALOG): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const p of productsInCategory(category, catalog)) {
    if (p.brand && !seen.has(p.brand)) { seen.add(p.brand); ordered.push(p.brand); }
  }
  return ordered;
}

export function productsInBrand(category: ProductCategory, brand: string, catalog: CatalogProduct[] = PRODUCT_CATALOG): CatalogProduct[] {
  return productsInCategory(category, catalog).filter((p) => p.brand === brand);
}

export function searchProducts(query: string, catalog: CatalogProduct[] = PRODUCT_CATALOG): CatalogProduct[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return catalog.filter(
    (p) => p.isActive && (p.name.toLowerCase().includes(needle) || (p.brand?.toLowerCase().includes(needle) ?? false)),
  );
}

// Raw by-id lookup — NOT active-filtered, so an existing reference (e.g. a recently-used id or a
// prior request line) can still be resolved. Callers that build the selection list filter active.
export function productById(id: string, catalog: CatalogProduct[] = PRODUCT_CATALOG): CatalogProduct | undefined {
  return catalog.find((p) => p.id === id);
}

export function productLabel(p: CatalogProduct): string {
  return p.brand ? `${p.brand} · ${p.name}` : p.name;
}

export function quantityCaption(unit: ProductUnit): string {
  return unit === "units" ? "Dose" : "Amount";
}

export function unitSuffix(unit: ProductUnit): string {
  switch (unit) {
    case "units": return "U";
    case "millilitres": return "mL";
    case "vial": return "vial";
    case "syringe": return "syringe";
    case "tube": return "tube";
    case "freeText": return "";
  }
}

const OTHER = "Other";
const NEUROTOXIN_AREAS = [
  "Forehead", "Glabella", "Crow's Feet", "Bunny Lines", "DAO", "LLSAN",
  "Mentalis", "Platysma", "Masseter", "Lip Flip", "Hyperhidrosis",
  "Trapezius", "Calves / Gastrocnemius", OTHER,
];
const FILLER_AREAS = [
  "Cheek", "Chin", "Jawline", "Temple", "Perioral", "Preauricular",
  "Tear Trough", "Prejowl", "Neck line", "Piriform fossa", OTHER,
];
const SKINBOOSTER_AREAS = ["Full Face", "Neck", "Décolletage", "Hands", "Scalp", OTHER];
const VIAL_COLLAGEN_AREAS = [
  "Full Face (exclude forehead)", "Cheek", "Temple", "Neck", "Décolletage",
  "Buttock", "Abdomen", "Arm", "Thigh", OTHER,
];

export function treatmentAreasFor(category: ProductCategory, unit: ProductUnit): string[] {
  switch (category) {
    case "neurotoxin": return NEUROTOXIN_AREAS;
    case "haFiller": return FILLER_AREAS;
    case "skinBooster":
    case "prpPrf": return SKINBOOSTER_AREAS;
    // mL collagen (Ellanse) uses filler-like areas; vial/syringe collagen
    // (Sculptra/Lenisna/AestheFill/Radiesse/HarmonyCa) uses the body-area list — per iOS.
    case "collagenStimulator": return unit === "millilitres" ? FILLER_AREAS : VIAL_COLLAGEN_AREAS;
    case "other": return [OTHER];
  }
}

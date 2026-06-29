# Prescribing Catalog + Request Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the hardcoded one-click "Profhilo → Dr Voss" authorisation request with a real builder: browse/search a ported static product catalog, build line items (dose, areas, timing), pick the doctor, and submit.

**Architecture:** A static `catalog.ts` (verbatim port of the iOS catalog + helpers, TDD) drives a new request-builder page that produces `MedicationItem[]` for the existing `store.submitRequest`. No type/store/Firestore changes.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest. No new deps.

**Source of truth:** `docs/superpowers/specs/2026-06-29-prescribing-catalog-design.md`; iOS `AXDomain/{PrescribingProducts,ProductCatalogSeed}.swift`.

**Existing context:**
- `src/lib/demo/types.ts` — `MedicationItem`, `ProductCategory` (`neurotoxin|haFiller|skinBooster|collagenStimulator|prpPrf|other`), `ProductUnit` (`units|millilitres|vial|syringe|tube|freeText`).
- `src/lib/demo/backend.ts` — `submitRequest({ patientID, doctorID, items, identity }, now)`; requires `identity.role === "nurse"` + patient viewable. `patientPermissions(identity, patient)`.
- `src/lib/demo/store.tsx` — `store.submitRequest(input)`; `store.status`; `store.state.patients`.
- `src/lib/demo/auth.tsx` — `useDemoAuth()` → `{ identity, accounts }`; `accounts` = `DEMO_ACCOUNTS` (`{ label, identities: Identity[] }[]`), where an `Identity` is `{ user: { id, name }, role, context }`.
- `src/app/app/patients/[id]/page.tsx` — `raiseRequest()` (lines 58-66) + its button (lines 162-166) — to be replaced.

> **Seed note:** the design mentioned seeding `prescribingDoctorIDs: ["u-voss"]`. Dropped: `makePatient` hardcodes `[]`, the builder falls back to the sole demo doctor when prescribers are empty (so it's functionally identical in a one-doctor demo), and adding a prescriber changes patient *visibility* (`isPrescriber`) which could break existing permission tests. Not worth the risk.

---

## Task 1: Catalog domain (TDD)

**Files:**
- Create: `src/lib/demo/catalog.ts`
- Test: `src/lib/demo/__tests__/catalog.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/demo/__tests__/catalog.test.ts`:
```ts
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
    expect(treatmentAreasFor("neurotoxin", "units")[treatmentAreasFor("neurotoxin", "units").length - 1]).toBe("Other");
  });
  it("captions dose vs amount", () => {
    expect(quantityCaption("units")).toBe("Dose");
    expect(quantityCaption("millilitres")).toBe("Amount");
  });
});
```

- [ ] **Step 2: Run** — `npm test -- catalog` → FAIL (module missing).

- [ ] **Step 3: Implement `src/lib/demo/catalog.ts`** (ported verbatim from the Swift seed):
```ts
// Static prescribing catalog, ported verbatim from iOS AXDomain/ProductCatalogSeed.swift
// + PrescribingProducts.swift. Data, not logic — super-admin/deploy-time maintained.
import type { ProductCategory, ProductUnit } from "./types";

export interface CatalogProduct {
  id: string;
  category: ProductCategory;
  brand?: string;
  name: string;
  unit: ProductUnit;
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
  return { id: makeId(category, brand, name), category, brand, name, unit };
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

export function productsInCategory(category: ProductCategory): CatalogProduct[] {
  return PRODUCT_CATALOG.filter((p) => p.category === category);
}

export function brandsInCategory(category: ProductCategory): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const p of productsInCategory(category)) {
    if (p.brand && !seen.has(p.brand)) { seen.add(p.brand); ordered.push(p.brand); }
  }
  return ordered;
}

export function productsInBrand(category: ProductCategory, brand: string): CatalogProduct[] {
  return productsInCategory(category).filter((p) => p.brand === brand);
}

export function searchProducts(query: string): CatalogProduct[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return PRODUCT_CATALOG.filter(
    (p) => p.name.toLowerCase().includes(needle) || (p.brand?.toLowerCase().includes(needle) ?? false),
  );
}

export function productById(id: string): CatalogProduct | undefined {
  return PRODUCT_CATALOG.find((p) => p.id === id);
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
    case "collagenStimulator": return unit === "millilitres" ? FILLER_AREAS : VIAL_COLLAGEN_AREAS;
    case "other": return [OTHER];
  }
}
```

- [ ] **Step 4: Run** — `npm test -- catalog` → PASS.
- [ ] **Step 5: Commit**
```bash
git add src/lib/demo/catalog.ts src/lib/demo/__tests__/catalog.test.ts
git commit -m "feat(catalog): port static prescribing catalog + helpers (TDD)"
```

---

## Task 2: Request builder page

**Files:**
- Create: `src/app/app/patients/[id]/request/page.tsx`

- [ ] **Step 1: Implement** `src/app/app/patients/[id]/request/page.tsx`:
```tsx
"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { patientPermissions } from "@/lib/demo/backend";
import type { MedicationItem, ProductCategory } from "@/lib/demo/types";
import {
  PRODUCT_CATALOG, categoryDisplayName, productsInCategory, brandsInCategory, productsInBrand,
  searchProducts, productLabel, treatmentAreasFor, quantityCaption, unitSuffix, type CatalogProduct,
} from "@/lib/demo/catalog";

const CATEGORIES: ProductCategory[] = ["neurotoxin", "haFiller", "skinBooster", "collagenStimulator", "prpPrf"];

type Line = { key: string; item: MedicationItem };

function itemFromProduct(p: CatalogProduct): MedicationItem {
  return { name: p.name, dosage: "", category: p.category, brand: p.brand, unit: p.unit, areas: [] };
}

function LineEditor({ line, onChange, onRemove }: {
  line: Line;
  onChange: (item: MedicationItem) => void;
  onRemove: () => void;
}) {
  const { item } = line;
  const [customArea, setCustomArea] = useState("");
  const areas = treatmentAreasFor(item.category, item.unit);
  const customAreas = item.areas.filter((a) => !areas.includes(a));

  function toggleArea(a: string) {
    onChange({ ...item, areas: item.areas.includes(a) ? item.areas.filter((x) => x !== a) : [...item.areas, a] });
  }
  function addCustom() {
    const a = customArea.trim();
    if (a && !item.areas.includes(a)) onChange({ ...item, areas: [...item.areas, a] });
    setCustomArea("");
  }

  return (
    <div className="rounded-inner border border-line p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-ink">{item.brand ? `${item.brand} · ${item.name}` : item.name}</p>
        <button type="button" onClick={onRemove} className="text-sm text-ink-soft hover:text-ink">Remove</button>
      </div>
      <label className="mt-3 block">
        <span className="micro">{quantityCaption(item.unit)}{unitSuffix(item.unit) ? ` (${unitSuffix(item.unit)})` : ""}</span>
        <input value={item.dosage} onChange={(e) => onChange({ ...item, dosage: e.target.value })} inputMode="decimal"
          className="mt-1 w-32 rounded-field border border-line bg-card px-3 py-1.5 text-sm text-ink" />
      </label>
      <div className="mt-3">
        <span className="micro">Treatment areas</span>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {areas.map((a) => {
            const on = item.areas.includes(a);
            return (
              <button key={a} type="button" onClick={() => toggleArea(a)}
                className={`rounded-btn px-2.5 py-1 text-xs ${on ? "text-card" : "border border-line text-ink-soft"}`}
                style={on ? { background: "var(--color-tint)" } : undefined}>{a}</button>
            );
          })}
          {customAreas.map((a) => (
            <button key={a} type="button" onClick={() => toggleArea(a)} className="rounded-btn px-2.5 py-1 text-xs text-card" style={{ background: "var(--color-tint)" }}>
              {a} ✕
            </button>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input value={customArea} onChange={(e) => setCustomArea(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
            placeholder="Add another area" className="w-48 rounded-field border border-line bg-card px-3 py-1.5 text-sm text-ink" />
          <button type="button" onClick={addCustom} className="rounded-btn border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-tint">Add</button>
        </div>
      </div>
      <label className="mt-3 block">
        <span className="micro">Timing (optional)</span>
        <input value={item.timing ?? ""} onChange={(e) => onChange({ ...item, timing: e.target.value || undefined })}
          placeholder="e.g. PRN monthly" className="mt-1 w-full rounded-field border border-line bg-card px-3 py-1.5 text-sm text-ink" />
      </label>
    </div>
  );
}

export default function RequestBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { identity, accounts } = useDemoAuth();
  const store = useDemoStore();
  const router = useRouter();
  const [category, setCategory] = useState<ProductCategory>("neurotoxin");
  const [brand, setBrand] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [lines, setLines] = useState<Line[]>([]);

  const doctors = useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; name: string }[] = [];
    for (const acc of accounts) for (const idn of acc.identities) {
      if (idn.role === "doctor" && !seen.has(idn.user.id)) { seen.add(idn.user.id); out.push({ id: idn.user.id, name: idn.user.name }); }
    }
    return out;
  }, [accounts]);

  const patient = identity ? store.state.patients[id] : undefined;
  const defaultDoctor = patient?.prescribingDoctorIDs.find((d) => doctors.some((x) => x.id === d)) ?? doctors[0]?.id ?? "";
  const [doctorId, setDoctorId] = useState<string>("");
  const chosenDoctor = doctorId || defaultDoctor;

  if (!identity) return null;
  if (store.status === "loading") return <p className="text-ink-soft">Loading…</p>;
  if (!patient || !patientPermissions(identity, patient).canView) {
    return <p className="text-ink-soft">This patient is not in your view.</p>;
  }
  if (identity.role !== "nurse") {
    return <p className="text-ink-soft">Only a nurse can raise an authorisation request.</p>;
  }
  const me = identity;

  const brands = brandsInCategory(category);
  const results = query.trim() ? searchProducts(query) : [];

  function addProduct(p: CatalogProduct) {
    setLines((ls) => [...ls, { key: crypto.randomUUID(), item: itemFromProduct(p) }]);
  }
  function updateLine(key: string, item: MedicationItem) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, item } : l)));
  }
  function removeLine(key: string) {
    setLines((ls) => ls.filter((l) => l.key !== key));
  }

  const canSubmit = lines.length > 0 && lines.every((l) => l.item.dosage.trim()) && !!chosenDoctor;

  function submit() {
    if (!canSubmit) return;
    store.submitRequest({ patientID: id, doctorID: chosenDoctor, items: lines.map((l) => l.item), identity: me });
    router.push(`/app/patients/${id}`);
  }

  return (
    <div className="max-w-3xl">
      <Link href={`/app/patients/${id}`} className="text-sm text-ink-soft hover:text-ink">← Back to patient</Link>
      <h1 className="mt-3 font-display text-3xl text-ink">Raise authorisation request</h1>

      <h2 className="mt-6 font-display text-xl text-ink">Add products</h2>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search all products…"
        className="mt-3 w-full rounded-field border border-line bg-card px-3 py-2 text-sm text-ink" />

      {query.trim() ? (
        <ul className="mt-3 flex flex-col gap-1.5">
          {results.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => addProduct(p)} className="w-full rounded-inner border border-line bg-card px-3 py-2 text-left text-sm text-ink hover:border-tint">
                {productLabel(p)} <span className="text-ink-soft">· {categoryDisplayName(p.category)}</span>
              </button>
            </li>
          ))}
          {results.length === 0 && <li className="text-sm text-ink-soft">No matches.</li>}
        </ul>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button key={c} type="button" onClick={() => { setCategory(c); setBrand(null); }}
                className={`rounded-btn px-3 py-1.5 text-sm ${c === category ? "text-card" : "border border-line text-ink-soft"}`}
                style={c === category ? { background: "var(--color-tint)" } : undefined}>{categoryDisplayName(c)}</button>
            ))}
          </div>
          <div className="mt-3">
            {brands.length > 0 && brand === null ? (
              <ul className="flex flex-col gap-1.5">
                {brands.map((b) => (
                  <li key={b}>
                    <button type="button" onClick={() => setBrand(b)} className="w-full rounded-inner border border-line bg-card px-3 py-2 text-left text-sm text-ink hover:border-tint">{b} →</button>
                  </li>
                ))}
              </ul>
            ) : (
              <>
                {brand !== null && (
                  <button type="button" onClick={() => setBrand(null)} className="mb-2 text-sm text-ink-soft hover:text-ink">← All brands</button>
                )}
                <ul className="flex flex-col gap-1.5">
                  {(brand !== null ? productsInBrand(category, brand) : productsInCategory(category)).map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => addProduct(p)} className="w-full rounded-inner border border-line bg-card px-3 py-2 text-left text-sm text-ink hover:border-tint">{productLabel(p)}</button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </>
      )}

      <h2 className="mt-8 font-display text-xl text-ink">Request items</h2>
      <div className="mt-3 flex flex-col gap-3">
        {lines.map((l) => (
          <LineEditor key={l.key} line={l} onChange={(item) => updateLine(l.key, item)} onRemove={() => removeLine(l.key)} />
        ))}
        {lines.length === 0 && <p className="text-sm text-ink-soft">No products added yet.</p>}
      </div>

      <label className="mt-6 block max-w-xs">
        <span className="micro">Prescribing doctor</span>
        <select value={chosenDoctor} onChange={(e) => setDoctorId(e.target.value)}
          className="mt-1 w-full rounded-field border border-line bg-card px-3 py-2 text-ink">
          {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </label>

      <div className="mt-6 flex gap-3">
        <button type="button" onClick={submit} disabled={!canSubmit}
          className="rounded-btn px-5 py-2.5 text-sm font-medium text-card disabled:opacity-50" style={{ background: "var(--color-tint)" }}>
          Submit request
        </button>
        <Link href={`/app/patients/${id}`} className="rounded-btn border border-line px-5 py-2.5 text-sm text-ink-soft">Cancel</Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run** — `npx tsc --noEmit` → clean; `npm run build` → `/app/patients/[id]/request` compiles.
- [ ] **Step 3: Commit**
```bash
git add "src/app/app/patients/[id]/request/page.tsx"
git commit -m "feat(catalog): authorisation request builder page (picker + line items)"
```

---

## Task 3: Wire the patient page to the builder

**Files:**
- Modify: `src/app/app/patients/[id]/page.tsx`

- [ ] **Step 1: Remove** the `raiseRequest` handler (lines 58-66):
```tsx
  function raiseRequest() {
    // Demo: raise a request to Dr Voss for the first active medication area.
    store.submitRequest({
      patientID: id,
      doctorID: "u-voss",
      items: [{ name: "Profhilo", dosage: "2", category: "skinBooster", unit: "millilitres", areas: ["Full Face"] }],
      identity: me,
    });
  }
```
(delete the whole function).

- [ ] **Step 2: Replace** the button (lines 162-166) with a Link:
```tsx
          {identity.role === "nurse" && (
            <button onClick={raiseRequest} className="mt-4 w-full rounded-btn border border-line px-4 py-2 text-sm text-ink hover:border-tint">
              Raise authorisation request → Dr Voss
            </button>
          )}
```
becomes:
```tsx
          {identity.role === "nurse" && (
            <Link href={`/app/patients/${id}/request`} className="mt-4 block w-full rounded-btn border border-line px-4 py-2 text-center text-sm text-ink hover:border-tint">
              Raise authorisation request
            </Link>
          )}
```

- [ ] **Step 3: Run** — `npx tsc --noEmit` → clean (confirm `me`/`store.submitRequest` aren't now-unused; `me` is still used by `addNote`, `store` still used elsewhere — no removals needed); `npm run lint` → clean; `npm test` → all green; `npm run build` → compiles.
- [ ] **Step 4: Commit**
```bash
git add "src/app/app/patients/[id]/page.tsx"
git commit -m "feat(catalog): link patient page to the request builder (drop hardcoded Profhilo)"
```

---

## Task 4: Verification gate + demo smoke + PR

- [ ] **Step 1: Offline gate**
```bash
rm -rf .next && npm run lint && npx tsc --noEmit && npm test && npm run build
```
Expected: all green; new `catalog` tests pass; `/app/patients/[id]/request` route compiles.

- [ ] **Step 2: Demo-mode smoke (preview).** If `.env.local` exists, move it aside; start the dev server. As **Sarah (nurse)** on patient **Claire** (`p-2`): open the patient → "Raise authorisation request" → on the builder: (a) pick a **neurotoxin** from the flat list; (b) switch to **HA Filler**, drill into **Juvederm**, add **Voluma**; (c) **search** "profhilo" and add it; set a dose on each, toggle a couple of areas + add a custom "Other" area; confirm the **doctor** defaults to Dr Elena Voss; **Submit** → routes back and the request shows under the patient's pending requests / authorisations area. Screenshot. Restore `.env.local`.

- [ ] **Step 3: PR**
```bash
git push -u origin HEAD
```
Open the PR with `/create-pr` (base `main`). PR body: ports the static iOS prescribing catalog (73 products) + a request builder (category/brand/search picker, multi-item line editor with dose/areas/timing, doctor select); replaces the hardcoded Profhilo; catalog is static (no Firestore) like iOS; doctor list sourced from demo accounts (no live directory yet — documented); pricing/GST is the next increment.

---

## Self-Review Notes

- **Spec coverage:** catalog domain + helpers + areas + caption (spec §1 → T1) ✓; builder page with category/brand/search picker, line editor (dose/areas/timing), multi-item, doctor select, submit (spec §2 → T2) ✓; patient-page wiring (spec §3 → T3) ✓; seed change intentionally dropped with rationale (spec §4 → noted) ✓; verification + demo smoke + PR (spec §5 → T4) ✓; caveats reflected (static catalog, no live directory, no recently-used, pricing later) ✓.
- **Type consistency:** `CatalogProduct`, `productsInCategory`/`brandsInCategory`/`productsInBrand`/`searchProducts`/`productLabel`/`treatmentAreasFor`/`quantityCaption`/`unitSuffix`/`categoryDisplayName` (T1) all consumed by T2; `MedicationItem` shape matches `submitRequest`; `useDemoAuth()` returns `{ identity, accounts }` (per auth.tsx); `store.submitRequest({ patientID, doctorID, items, identity })` matches backend.
- **No placeholders:** every step has full code/commands.
- **Hooks safety:** all `useState`/`useMemo` are declared before the early returns in the page component (note `doctorId` state + `defaultDoctor` derived before guards), so hook order is stable.

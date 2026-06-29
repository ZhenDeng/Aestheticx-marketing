# Design: prescribing catalog + authorisation request builder

**Date:** 2026-06-29
**Status:** Approved (brainstorming) — pending spec review
**Repo:** `Aestheticx-marketing` (branch `claude/prescribing-catalog`, off `main`)
**Source of truth:** iOS `AestheticXKit/Sources/AXDomain/{PrescribingProducts,ProductCatalogSeed}.swift`
(catalog, enums, treatment areas, helpers) and `AXFeatures/AuthorisationRequestBuilder.swift` (picker UX).

## Goal

Replace the hardcoded one-click request (`items: [{ name: "Profhilo", … }]`, `doctorID: "u-voss"` in
`src/app/app/patients/[id]/page.tsx`) with a real **authorisation request builder**: browse/search a
ported product **catalog**, build one or more line items (dose, treatment areas, optional timing), pick
the prescribing doctor, and submit. The catalog is **static client data** mirroring iOS (no Firestore /
hydrate), so demo and live behave identically.

## Context (already in place)

- `MedicationItem` / `ProductCategory` / `ProductUnit` in `src/lib/demo/types.ts` already match the iOS
  enums **exactly** (`neurotoxin | haFiller | skinBooster | collagenStimulator | prpPrf | other`;
  `units | millilitres | vial | syringe | tube | freeText`). No type changes needed.
- `backend.submitRequest({ patientID, doctorID, items, identity }, now)` requires `identity.role ===
  "nurse"` and patient-viewable; stores the `items` array as-is. `store.submitRequest(input)` wraps it
  (optimistic + `mirrorCreateRequest`). Both unchanged by this increment.
- The only doctor in the demo is **Dr Elena Voss** (`u-voss`), defined in `src/lib/demo/accounts.ts`
  (`DEMO_ACCOUNTS`) and exposed via `useDemoAuth().accounts`.

## 1. Catalog domain (TDD) — new `src/lib/demo/catalog.ts`

Ported **verbatim** from the iOS source (data, not logic — copy product names/brands/units exactly):

```ts
export interface CatalogProduct {
  id: string;           // slug: [category, brand?, name] joined "-", lowercased, spaces→"-", "."→"", "/"→"-"
  category: ProductCategory;
  brand?: string;       // HA fillers only
  name: string;
  unit: ProductUnit;
}
```

- `PRODUCT_CATALOG: CatalogProduct[]` — the 73 products: **7** neurotoxins (units), **44** HA fillers
  across **9** brands (mL), **13** skin boosters (mL), **7** collagen stimulators (unit varies:
  Sculptra/Lenisna 50/Lenisna 200/AestheFill = vial, Radiesse/HarmonyCa = syringe, Ellanse = mL), **2**
  PRP/PRF (tube). Built the same way as the Swift seed (per-category arrays; `id()` slug helper ported).
- Helpers (mirror `ProductCatalog`):
  - `productsInCategory(category): CatalogProduct[]`
  - `brandsInCategory(category): string[]` — distinct brands, first-seen order, nil-brand omitted
  - `productsInBrand(category, brand): CatalogProduct[]`
  - `searchProducts(query): CatalogProduct[]` — case-insensitive partial match on name **or** brand;
    empty query → `[]`
  - `productById(id): CatalogProduct | undefined`
  - `productLabel(p): string` — `"Brand · Name"` if branded, else `name`
- `treatmentAreasFor(category, unit): string[]` — ported `TreatmentAreas.list(for:unit:)`:
  neurotoxin / fillerLike (HA + mL-collagen) / skinBoosterLike (skinBooster + prpPrf) / vialCollagen
  (vial/syringe collagen) / `["Other"]` for `other`. Exact strings incl. `"Other"` and `"Neck line"`,
  `"Calves / Gastrocnemius"`, `"Full Face (exclude forehead)"`.
- `quantityCaption(unit): "Dose" | "Amount"` — `"Dose"` for `units`, else `"Amount"` (per iOS).

**Tests:** per-category counts (7/44/13/7/2) and total (73); `brandsInCategory("haFiller")` returns the 9
brands in order; `productsInBrand("haFiller","Juvederm")` has 6; `searchProducts("vol")` finds Voluma/
Volift/Volux/Volbella/Volyme/Volume…; `productById` round-trips a slug; `treatmentAreasFor` for each
category/unit (collagen mL vs vial differ); `quantityCaption("units")==="Dose"`.

## 2. Request builder UI — new route `src/app/app/patients/[id]/request/page.tsx`

Replaces the inline hardcoded button. Guards: `identity.role === "nurse"` and patient viewable
(`patientPermissions(identity, patient).canView`); otherwise a short "only a nurse can raise a request"
message.

- **Product picker:** category tabs (`ProductCategory` minus `other`, via `displayName`); within a
  category, if `brandsInCategory` is non-empty (HA fillers) show a brand drill-down then the product
  list, else a flat product list. A **search box** queries the whole catalog (`searchProducts`) and
  shows results with `productLabel`. Selecting a product **appends a line item**.
- **Line items** (≥0, render in a list): each shows `productLabel`, a **dose** input captioned via
  `quantityCaption` with the unit suffix, a **multi-select of treatment areas** (`treatmentAreasFor`)
  with a custom **"Other"** free-text that appends a typed area, an optional **timing** note, and a
  **remove** button. Each item maps to a `MedicationItem` (`{ name, dosage, category, brand?, unit,
  areas, timing? }`).
- **Doctor select:** a `<select>` built from `useDemoAuth().accounts` identities with `role === "doctor"`
  (`{ id, name }`, de-duplicated), defaulting to the patient's first `prescribingDoctorID` when it
  matches an available doctor, else the first doctor.
- **Submit:** enabled only when ≥1 line item (each with a non-empty dose) **and** a doctor is selected.
  Calls `store.submitRequest({ patientID: id, doctorID, items, identity })`, then routes back to
  `/app/patients/[id]`. A Cancel link returns without submitting.

## 3. Patient-page wiring — `src/app/app/patients/[id]/page.tsx`

Replace the hardcoded `raiseRequest()` handler + its button with a **Link** to
`/app/patients/[id]/request` (label "Raise authorisation request"), shown under the same condition as
today. Delete the hardcoded Profhilo item and the now-unused handler. `store.submitRequest` is untouched.

## 4. Seed — `src/lib/demo/seed.ts`

Set `prescribingDoctorIDs: ["u-voss"]` on the demo patients (Claire, Amara, Grace) so the builder's
doctor default is populated and realistic. Existing seeded requests (which already pass `doctorID:
"u-voss"`) are unaffected.

## 5. Testing & verification

- **TDD (offline):** the catalog helpers (`src/lib/demo/__tests__/catalog.test.ts`) — counts, brand
  grouping, search, areas, captions. Existing suite stays green; `npm test`/`tsc`/`lint`/`build` clean.
- **Demo smoke (preview):** as nurse Sarah on a patient → "Raise authorisation request" → pick a
  neurotoxin (flat list) and an HA filler (brand drill-down) and one via search; set doses + areas (incl.
  a custom "Other"); confirm the doctor defaults to Dr Voss; submit → the request appears (pending) and
  the doctor side can see/approve it. Screenshot.

## 6. Caveats / out of scope

- **Static catalog** like iOS — super-admin/deploy-time maintained; no in-app catalog editing, no
  Firestore `products` collection (a provider swap is a later change if ever needed).
- **No live doctor directory** — the doctor list is sourced from the demo accounts; live mode has no real
  directory yet (a separate future concern). The request still records the chosen `doctorID`. Documented.
- **No "recently used"** products (iOS has it via local persistence) — YAGNI for v1.
- **Pricing / GST** is the **next** increment (billing dashboards + GST invoices), not here.

# Emergency Authorisations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every approved authorisation automatically creates or refreshes an Adrenaline emergency authorisation (and, for HA fillers, a Hyaluronidase one) per patient + prescribing doctor, shown quietly at the end of the patient's authorisation section.

**Architecture:** A new pure module `src/lib/demo/emergency.ts` owns the create-or-refresh math over a new `EmergencyAuthorisation` type stored in `DemoState.emergencyAuthorisationsByID`, keyed by the deterministic id `${patientID}_${doctorID}_${kind}` so a repeat approval upserts (refreshes) rather than duplicates. `approveRequest` folds the result in; the patient file displays active records; the "Other/compounded" line gains an HA-filler toggle so manual products feed the logic. Live write-side is a companion `~/Documents/AestheticX` PR (out of scope here); web live-mode initialises the map empty until then.

**Tech Stack:** Next.js 16 / React (App Router), TypeScript, Vitest + React Testing Library, Tailwind v4.

**Reference:** spec at `docs/superpowers/specs/2026-07-08-emergency-authorisations-design.md`.

---

### Task 1: Model + state plumbing

**Files:**
- Modify: `src/lib/demo/types.ts` (add types + `DemoState` field, near the `DemoState` interface ~`:335`)
- Modify: `src/lib/demo/backend.ts:50-73` (`emptyState()`)
- Modify: `src/lib/firebase/hydrate.ts:102` (`assembleState()` return literal)

- [ ] **Step 1: Add the types to `types.ts`**

Immediately before the `export interface DemoState {` block, add:

```ts
export type EmergencyKind = "adrenaline" | "hyaluronidase";

// An automatically-generated emergency standing authorisation (spec 2026-07-08 emergency-
// authorisations). Created/refreshed on every approval: Adrenaline always; Hyaluronidase for
// HA fillers. Deterministic id `${patientID}_${doctorID}_${kind}` — one per patient per
// prescribing doctor per kind, so a repeat approval refreshes rather than duplicates. Not
// billable, no repeats — deliberately separate from Authorisation.
export interface EmergencyAuthorisation {
  id: string;
  patientID: string;
  doctorID: string;
  doctorName: string; // denormalised at issue for display
  kind: EmergencyKind;
  createdAt: number;   // first issued (preserved across refreshes)
  refreshedAt: number; // last approval that refreshed it
  expiresAt: number;   // refreshedAt + EMERGENCY_VALIDITY_MONTHS
  sourceAuthorisationIDs: string[]; // audit trail of triggering authorisations
}
```

Then inside `interface DemoState { ... }`, after the `accountsByID: Record<string, AccountRecord>;` line, add:

```ts
  // Auto-generated emergency standing authorisations, keyed by `${patientID}_${doctorID}_${kind}`.
  emergencyAuthorisationsByID: Record<string, EmergencyAuthorisation>;
```

- [ ] **Step 2: Initialise it in `emptyState()`**

In `src/lib/demo/backend.ts`, in the object returned by `emptyState()` (`:51-73`), after `accountsByID: {},` add:

```ts
    emergencyAuthorisationsByID: {},
```

- [ ] **Step 3: Initialise it in `assembleState()`**

In `src/lib/firebase/hydrate.ts:102`, in the returned object literal, add `emergencyAuthorisationsByID: {}` before the closing `}` (live hydrate stays empty until the companion backend PR writes these docs):

```ts
  return { patients, notesByPatient, authorisations, requests, appointments, usages: [], formsByPatient, invoices, scriptPricing, noteTemplatesByOwner, followUpTasksByID, followUpSettingsByUser, bookingTokensByUser, availabilityWindows, treatmentAvailabilityByOwner, doctorStatusByID, externalBusyByOwner, lastCalledDoctorByUser, profileByUser, addressByIdentity: {}, accountsByID, emergencyAuthorisationsByID: {} };
```

- [ ] **Step 4: Verify it compiles and existing tests pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS. (TS would flag any other `DemoState` literal missing the field; there are none beyond the two above.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/demo/types.ts src/lib/demo/backend.ts src/lib/firebase/hydrate.ts
git commit -m "feat: add EmergencyAuthorisation model + state field"
```

---

### Task 2: Pure logic — `emergencyKindsFor`

**Files:**
- Create: `src/lib/demo/emergency.ts`
- Test: `src/lib/demo/__tests__/emergency.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/demo/__tests__/emergency.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { MedicationItem, ProductCategory } from "@/lib/demo/types";
import { emergencyKindsFor, isReversibleFiller } from "@/lib/demo/emergency";

function med(category: ProductCategory): MedicationItem {
  return { name: "X", dosage: "", category, unit: "units", areas: [] };
}

describe("isReversibleFiller", () => {
  it("is true only for HA fillers", () => {
    expect(isReversibleFiller(med("haFiller"))).toBe(true);
    expect(isReversibleFiller(med("collagenStimulator"))).toBe(false);
    expect(isReversibleFiller(med("skinBooster"))).toBe(false);
    expect(isReversibleFiller(med("neurotoxin"))).toBe(false);
    expect(isReversibleFiller(med("other"))).toBe(false);
  });
});

describe("emergencyKindsFor", () => {
  it("always includes adrenaline", () => {
    expect(emergencyKindsFor([med("neurotoxin")])).toEqual(["adrenaline"]);
  });
  it("adds hyaluronidase when any item is an HA filler", () => {
    expect(emergencyKindsFor([med("neurotoxin"), med("haFiller")])).toEqual(["adrenaline", "hyaluronidase"]);
  });
  it("does not add hyaluronidase for biostimulators or skin boosters", () => {
    expect(emergencyKindsFor([med("collagenStimulator"), med("skinBooster")])).toEqual(["adrenaline"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/demo/__tests__/emergency.test.ts`
Expected: FAIL — cannot resolve `@/lib/demo/emergency`.

- [ ] **Step 3: Create `emergency.ts` with the minimal implementation**

Create `src/lib/demo/emergency.ts`:

```ts
// Pure emergency-authorisation logic (spec 2026-07-08 emergency-authorisations). Imports only
// ./types — no dependency on backend.ts, so backend.ts can import this without a cycle.
import type { DemoState, EmergencyAuthorisation, EmergencyKind, MedicationItem } from "./types";

export const EMERGENCY_VALIDITY_MONTHS = 12;

// Hyaluronidase reverses HA fillers only — not biostimulators (collagenStimulator: Sculptra/
// Radiesse/Ellansé) or skin boosters. So the product category is the correct discriminator.
export function isReversibleFiller(item: MedicationItem): boolean {
  return item.category === "haFiller";
}

// Every approval yields an adrenaline emergency authorisation; an HA filler adds hyaluronidase.
// Deterministic order (adrenaline first) keeps display and tests stable.
export function emergencyKindsFor(items: MedicationItem[]): EmergencyKind[] {
  const kinds: EmergencyKind[] = ["adrenaline"];
  if (items.some(isReversibleFiller)) kinds.push("hyaluronidase");
  return kinds;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/demo/__tests__/emergency.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/demo/emergency.ts src/lib/demo/__tests__/emergency.test.ts
git commit -m "feat: emergencyKindsFor + isReversibleFiller (HA-filler discriminator)"
```

---

### Task 3: Pure logic — `applyEmergencyAuthorisations` (create-or-refresh)

**Files:**
- Modify: `src/lib/demo/emergency.ts`
- Test: `src/lib/demo/__tests__/emergency.test.ts`

- [ ] **Step 1: Add the failing test**

First, extend the existing imports at the **top** of `src/lib/demo/__tests__/emergency.test.ts` (keep all imports at the top — do not add `import` lines mid-file):

```ts
import { emergencyKindsFor, isReversibleFiller, applyEmergencyAuthorisations } from "@/lib/demo/emergency";
import type { MedicationItem, ProductCategory, EmergencyAuthorisation } from "@/lib/demo/types";
```

Then append this block to the end of the file:

```ts
const T0 = Date.UTC(2026, 0, 1);
const T1 = Date.UTC(2026, 2, 1);
const EXP0 = Date.UTC(2027, 0, 1);
const EXP1 = Date.UTC(2027, 2, 1);

function apply(
  existing: Record<string, EmergencyAuthorisation>,
  over: Partial<Parameters<typeof applyEmergencyAuthorisations>[1]> = {},
) {
  return applyEmergencyAuthorisations(existing, {
    patientID: "p1", doctorID: "d1", doctorName: "Dr Voss",
    kinds: ["adrenaline"], sourceAuthIDs: ["a1"], now: T0, expiresAt: EXP0, ...over,
  });
}

describe("applyEmergencyAuthorisations", () => {
  it("creates a record with createdAt = now on first issue", () => {
    const next = apply({});
    const rec = next["p1_d1_adrenaline"];
    expect(rec).toMatchObject({ patientID: "p1", doctorID: "d1", kind: "adrenaline", createdAt: T0, refreshedAt: T0, expiresAt: EXP0 });
    expect(rec.sourceAuthorisationIDs).toEqual(["a1"]);
  });

  it("refreshes the same id without duplicating (createdAt preserved, expiry bumped, sources unioned)", () => {
    const first = apply({});
    const second = apply(first, { now: T1, expiresAt: EXP1, sourceAuthIDs: ["a2"] });
    expect(Object.keys(second)).toEqual(["p1_d1_adrenaline"]); // still one
    const rec = second["p1_d1_adrenaline"];
    expect(rec.createdAt).toBe(T0);       // preserved
    expect(rec.refreshedAt).toBe(T1);     // bumped
    expect(rec.expiresAt).toBe(EXP1);     // bumped
    expect(rec.sourceAuthorisationIDs.sort()).toEqual(["a1", "a2"]);
  });

  it("keeps a different doctor's record separate", () => {
    const first = apply({});
    const both = apply(first, { doctorID: "d2", doctorName: "Dr Lee" });
    expect(Object.keys(both).sort()).toEqual(["p1_d1_adrenaline", "p1_d2_adrenaline"]);
  });

  it("writes one record per kind", () => {
    const next = apply({}, { kinds: ["adrenaline", "hyaluronidase"] });
    expect(Object.keys(next).sort()).toEqual(["p1_d1_adrenaline", "p1_d1_hyaluronidase"]);
  });

  it("does not mutate the input map", () => {
    const existing = {};
    apply(existing);
    expect(existing).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/demo/__tests__/emergency.test.ts`
Expected: FAIL — `applyEmergencyAuthorisations` is not exported.

- [ ] **Step 3: Implement it in `emergency.ts`**

Append to `src/lib/demo/emergency.ts`:

```ts
export interface ApplyEmergencyArgs {
  patientID: string;
  doctorID: string;
  doctorName: string;
  kinds: EmergencyKind[];
  sourceAuthIDs: string[];
  now: number;
  expiresAt: number;
}

function emergencyID(patientID: string, doctorID: string, kind: EmergencyKind): string {
  return `${patientID}_${doctorID}_${kind}`;
}

// Pure create-or-refresh. One record per (patient, doctor, kind): a repeat approval refreshes
// the same id (createdAt preserved, expiry bumped, sources unioned) rather than duplicating.
export function applyEmergencyAuthorisations(
  existing: Record<string, EmergencyAuthorisation>,
  args: ApplyEmergencyArgs,
): Record<string, EmergencyAuthorisation> {
  const next = { ...existing };
  for (const kind of args.kinds) {
    const id = emergencyID(args.patientID, args.doctorID, kind);
    const prior = next[id];
    const sourceAuthorisationIDs = Array.from(
      new Set([...(prior?.sourceAuthorisationIDs ?? []), ...args.sourceAuthIDs]),
    );
    next[id] = {
      id,
      patientID: args.patientID,
      doctorID: args.doctorID,
      doctorName: args.doctorName,
      kind,
      createdAt: prior?.createdAt ?? args.now,
      refreshedAt: args.now,
      expiresAt: args.expiresAt,
      sourceAuthorisationIDs,
    };
  }
  return next;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/demo/__tests__/emergency.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/demo/emergency.ts src/lib/demo/__tests__/emergency.test.ts
git commit -m "feat: applyEmergencyAuthorisations create-or-refresh upsert"
```

---

### Task 4: Pure logic — `activeEmergencyAuthorisationsForPatient`

**Files:**
- Modify: `src/lib/demo/emergency.ts`
- Test: `src/lib/demo/__tests__/emergency.test.ts`

- [ ] **Step 1: Add the failing test**

First, extend the **top-of-file** imports (keep imports at the top): add `activeEmergencyAuthorisationsForPatient` to the existing `@/lib/demo/emergency` import, and add a new top import for `emptyState`:

```ts
import { emergencyKindsFor, isReversibleFiller, applyEmergencyAuthorisations, activeEmergencyAuthorisationsForPatient } from "@/lib/demo/emergency";
import { emptyState } from "@/lib/demo/backend";
```

Then append this block to the end of the file:

```ts
function stateWithEmergencies(...recs: EmergencyAuthorisation[]) {
  return { ...emptyState(), emergencyAuthorisationsByID: Object.fromEntries(recs.map((r) => [r.id, r])) };
}
function rec(over: Partial<EmergencyAuthorisation>): EmergencyAuthorisation {
  return { id: "x", patientID: "p1", doctorID: "d1", doctorName: "Dr Voss", kind: "adrenaline", createdAt: T0, refreshedAt: T0, expiresAt: EXP0, sourceAuthorisationIDs: [], ...over };
}

describe("activeEmergencyAuthorisationsForPatient", () => {
  it("returns only non-expired records for the patient, adrenaline first", () => {
    const state = stateWithEmergencies(
      rec({ id: "p1_d1_hyaluronidase", kind: "hyaluronidase", expiresAt: EXP0 }),
      rec({ id: "p1_d1_adrenaline", kind: "adrenaline", expiresAt: EXP0 }),
      rec({ id: "p1_d1_expired", kind: "adrenaline", expiresAt: T0 }),      // expired at now
      rec({ id: "p2_d1_adrenaline", patientID: "p2", kind: "adrenaline" }), // other patient
    );
    const active = activeEmergencyAuthorisationsForPatient(state, "p1", T1);
    expect(active.map((e) => e.kind)).toEqual(["adrenaline", "hyaluronidase"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/demo/__tests__/emergency.test.ts`
Expected: FAIL — `activeEmergencyAuthorisationsForPatient` is not exported.

- [ ] **Step 3: Implement it in `emergency.ts`**

Append to `src/lib/demo/emergency.ts`:

```ts
const KIND_ORDER: Record<EmergencyKind, number> = { adrenaline: 0, hyaluronidase: 1 };

// Active = not yet expired, for this patient. Adrenaline first, then by doctor name.
export function activeEmergencyAuthorisationsForPatient(
  state: DemoState,
  patientID: string,
  now: number,
): EmergencyAuthorisation[] {
  return Object.values(state.emergencyAuthorisationsByID)
    .filter((e) => e.patientID === patientID && e.expiresAt > now)
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.doctorName.localeCompare(b.doctorName));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/demo/__tests__/emergency.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/demo/emergency.ts src/lib/demo/__tests__/emergency.test.ts
git commit -m "feat: activeEmergencyAuthorisationsForPatient selector"
```

---

### Task 5: Wire emergency generation into `approveRequest`

**Files:**
- Modify: `src/lib/demo/backend.ts` (imports near top; `approveRequest` `:366-412`)
- Test: `src/lib/demo/__tests__/backend.test.ts`

- [ ] **Step 1: Add the failing tests**

In `src/lib/demo/__tests__/backend.test.ts`, add these two `MedicationItem` fixtures near `profhilo` (`:66`):

```ts
const botoxItem: MedicationItem = { name: "Botox", dosage: "20", category: "neurotoxin", unit: "units", areas: ["Glabella"] };
const fillerItem: MedicationItem = { name: "Juvederm Voluma", dosage: "1", category: "haFiller", unit: "millilitres", areas: ["Cheeks"] };
const manualFiller: MedicationItem = { name: "Compounded HA", dosage: "1", category: "haFiller", unit: "freeText", areas: ["Lips"] };
```

Then add a new `describe` block after the existing `describe("approveRequest", ...)` block (`:213`):

```ts
describe("approveRequest — emergency authorisations", () => {
  function approve(items: MedicationItem[], doctor = voss) {
    const state = stateWith(nursePatient("p1", "u-sarah"));
    const submitted = submitRequest(state, { patientID: "p1", doctorID: doctor.user.id, items, identity: sarahIndependent }, NOW);
    return approveRequest(submitted.state, submitted.request.id, doctor, NOW);
  }

  it("creates an adrenaline emergency auth (only) for a non-filler approval", () => {
    const { state } = approve([botoxItem]);
    const em = Object.values(state.emergencyAuthorisationsByID);
    expect(em.map((e) => e.kind)).toEqual(["adrenaline"]);
    expect(em[0]).toMatchObject({ patientID: "p1", doctorID: "u-voss", doctorName: "Dr Elena Voss" });
  });

  it("also creates a hyaluronidase emergency auth for an HA-filler approval", () => {
    const { state } = approve([fillerItem]);
    expect(Object.keys(state.emergencyAuthorisationsByID).sort()).toEqual(["p1_u-voss_adrenaline", "p1_u-voss_hyaluronidase"]);
  });

  it("treats a manual (freeText) HA filler the same as a structured one", () => {
    const { state } = approve([manualFiller]);
    expect(state.emergencyAuthorisationsByID["p1_u-voss_hyaluronidase"]).toBeDefined();
  });

  it("refreshes rather than duplicates on a second approval by the same doctor", () => {
    const first = approve([botoxItem]);
    const later = NOW + 1000;
    const submitted = submitRequest(first.state, { patientID: "p1", doctorID: "u-voss", items: [botoxItem], identity: sarahIndependent }, later);
    const second = approveRequest(submitted.state, submitted.request.id, voss, later);
    const adrenaline = Object.values(second.state.emergencyAuthorisationsByID).filter((e) => e.kind === "adrenaline");
    expect(adrenaline).toHaveLength(1);
    expect(adrenaline[0].refreshedAt).toBe(later);
  });

  it("gives a different prescribing doctor their own record", () => {
    const okafor: Identity = { ...voss, user: { id: "u-okafor", name: "Dr James Okafor" } };
    const { state } = approve([botoxItem], okafor);
    expect(state.emergencyAuthorisationsByID["p1_u-okafor_adrenaline"]).toBeDefined();
  });

  it("does not add emergency records to activeAuthorisations", () => {
    const { state } = approve([fillerItem]);
    // one granted authorisation, not the two emergency records
    expect(activeAuthorisations(state, "p1", NOW)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/demo/__tests__/backend.test.ts -t "emergency authorisations"`
Expected: FAIL — `state.emergencyAuthorisationsByID` is empty (`approveRequest` doesn't populate it yet).

- [ ] **Step 3: Add the import to `backend.ts`**

Near the other `./` imports at the top of `src/lib/demo/backend.ts`, add:

```ts
import { EMERGENCY_VALIDITY_MONTHS, applyEmergencyAuthorisations, emergencyKindsFor } from "./emergency";
```

- [ ] **Step 4: Wire it into `approveRequest`**

In `src/lib/demo/backend.ts`, inside `approveRequest`, after the `authorisations` map is built (`:393-394`, the `for (const a of granted) authorisations[a.id] = a;` line) and before `const patient = state.patients[...]` (`:396`), insert:

```ts
  const emergencyAuthorisationsByID = applyEmergencyAuthorisations(state.emergencyAuthorisationsByID, {
    patientID: request.patientID,
    doctorID: request.doctorID,
    doctorName: identity.user.name, // the approver is the addressed doctor (asserted above)
    kinds: emergencyKindsFor(request.items),
    sourceAuthIDs: granted.map((a) => a.id),
    now,
    expiresAt: addMonthsUTC(now, EMERGENCY_VALIDITY_MONTHS),
  });
```

Then add `emergencyAuthorisationsByID` to the state object passed to `syncReviewerAccess` (`:402-409`), so it reads:

```ts
  const approvedState = syncReviewerAccess(
    {
      ...state,
      patients,
      authorisations,
      emergencyAuthorisationsByID,
      requests: { ...state.requests, [requestID]: { ...request, status: "approved" } },
    },
    request.patientID,
  );
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/demo/__tests__/backend.test.ts`
Expected: PASS (new emergency block + all existing approveRequest tests still green).

- [ ] **Step 6: Commit**

```bash
git add src/lib/demo/backend.ts src/lib/demo/__tests__/backend.test.ts
git commit -m "feat: approveRequest auto-creates/refreshes emergency authorisations"
```

---

### Task 6: Store selector `activeEmergencyAuthorisations`

**Files:**
- Modify: `src/lib/demo/store.tsx` (imports; `StoreValue` interface `:24`; value object `:192`)

- [ ] **Step 1: Import the emergency module**

At the top of `src/lib/demo/store.tsx`, after `import * as invoicing from "./invoicing";` (`:8`), add:

```ts
import * as emergency from "./emergency";
```

- [ ] **Step 2: Declare the selector on `StoreValue`**

In the `StoreValue` interface, after the `activeAuthorisations` line (`:24`), add:

```ts
  activeEmergencyAuthorisations: (patientID: string) => ReturnType<typeof emergency.activeEmergencyAuthorisationsForPatient>;
```

- [ ] **Step 3: Wire the selector in the value object**

In the returned value object, after the `activeAuthorisations: (pid) => backend.activeAuthorisations(state, pid, now),` line (`:192`), add:

```ts
      activeEmergencyAuthorisations: (pid) => emergency.activeEmergencyAuthorisationsForPatient(state, pid, now),
```

- [ ] **Step 4: Verify it compiles and all tests pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/demo/store.tsx
git commit -m "feat: expose activeEmergencyAuthorisations on the store"
```

---

### Task 7: Display emergency authorisations on the patient file

**Files:**
- Modify: `src/app/app/patients/[id]/page.tsx` (import `:17`; derive `:69`; render after the active-auth list `:287`)

- [ ] **Step 1: Import the kind type**

In `src/app/app/patients/[id]/page.tsx`, extend the `types` import (`:17`) to add `EmergencyKind`:

```ts
import { displayName, fullName, hasAlert, type DeliveryStatus, type AppointmentStatus, type NoteAttachment, type EmergencyKind } from "@/lib/demo/types";
```

- [ ] **Step 2: Add the label map near the top-of-file helpers**

After the `apptTime` helper (`:36-38`), add:

```tsx
const EMERGENCY_LABEL: Record<EmergencyKind, string> = {
  adrenaline: "Adrenaline — anaphylaxis",
  hyaluronidase: "Hyaluronidase / Hylase",
};
```

- [ ] **Step 3: Derive the active records in the component**

After `const active = store.activeAuthorisations(id);` (`:69`), add:

```tsx
  const emergencies = store.activeEmergencyAuthorisations(id);
```

- [ ] **Step 4: Render the subsection at the end of the authorisations card**

In the "Active authorisations" card, after the closing `</ul>` of the active-authorisations list (`:287`, the line after `{active.length === 0 && ...}`) and before the `{identity.role === "nurse" && (` block (`:289`), insert:

```tsx
          {emergencies.length > 0 && (
            <div className="mt-4 border-t border-line pt-4">
              <p className="micro">Emergency authorisations</p>
              <ul className="mt-2 flex flex-col gap-2">
                {emergencies.map((e) => (
                  <li key={e.id} className="text-sm">
                    <span className="text-ink">{EMERGENCY_LABEL[e.kind]}</span>
                    <span className="micro block text-ink-soft">
                      {e.doctorName} · refreshed {new Date(e.refreshedAt).toLocaleDateString()} · expires {new Date(e.expiresAt).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
```

- [ ] **Step 5: Verify build + typecheck**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS (build compiles the patient route).

- [ ] **Step 6: Commit**

```bash
git add src/app/app/patients/[id]/page.tsx
git commit -m "feat: show emergency authorisations at the end of the patient auth section"
```

---

### Task 8: Manual HA-filler toggle on the "Other/compounded" line

**Files:**
- Modify: `src/app/app/patients/[id]/request/page.tsx` (`OtherLineEditor` `:57-87`)

- [ ] **Step 1: Add the toggle**

In `OtherLineEditor`, after the "Medication name" `<label>` block (`:63-67`, the `</label>` closing the name input) and before the dosage/route row (`:68`), insert:

```tsx
      <label className="mt-3 flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={item.category === "haFiller"}
          onChange={(e) => onChange({ ...item, category: e.target.checked ? "haFiller" : "other" })}
        />
        This is an HA (hyaluronic acid) filler
      </label>
```

(`onChange` is the item-updater prop already threaded into `OtherLineEditor`; `item.category` starts `"other"` from `emptyOtherItem()`.)

- [ ] **Step 2: Verify build + typecheck**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/app/patients/[id]/request/page.tsx
git commit -m "feat: HA-filler toggle on manual/compounded medication entry"
```

---

### Task 9: Full verification gate

**Files:** none (verification only)

- [ ] **Step 1: Run the whole suite + typecheck + lint + build**

Run: `npx tsc --noEmit && npx eslint src/lib/demo/emergency.ts src/lib/demo/backend.ts 'src/app/app/patients/**' && npx vitest run && npm run build`
Expected: all PASS.

- [ ] **Step 2: Preview QA (demo mode)**

Start the dev server (preview tooling), sign in as **Sarah Chen — Nurse**, open a patient, raise an authorisation request with an HA filler (structured or the new "Other" toggle), sign in as **Dr Elena Voss — Doctor**, approve it, reopen the patient as the nurse, and confirm the **Emergency authorisations** subsection shows Adrenaline + Hyaluronidase with the doctor name and a 12-month expiry. Approve a second request and confirm the record **refreshes** (no duplicate; later expiry). Screenshot as proof.

- [ ] **Step 3: No commit** (verification only). If anything fails, return to the relevant task.

---

## Live parity boundary (companion `~/Documents/AestheticX` PR — NOT in this plan)

The live write-side is a separate backend increment: add the same create-or-refresh to the `approveRequest` Cloud Function, decide the Firestore doc path/shape (likely `patients/{id}/emergencyAuthorisations/{doctorId}_{kind}`), add read rules matching the authorisation audience, then in this web repo add a `mapEmergencyAuthorisation` mapper + a `hydrate.ts` read populating `emergencyAuthorisationsByID`. Until that deploys, live mode correctly shows no emergency records (the map initialises empty in `assembleState`, Task 1 Step 3). Demo mode is fully functional now.

## Notes for the implementer
- `emergency.ts` must import **only** from `./types` (never `./backend`) to avoid an import cycle — `backend.ts` imports `emergency.ts`, not the reverse.
- Do not add emergency records to `Authorisation`/`activeAuthorisations`/`billableAuthorisations` — they are a separate object by design (keeps them out of billing and repeats).
- Follow existing Tailwind tokens (`micro`, `text-ink-soft`, `border-line`) — no new colours.

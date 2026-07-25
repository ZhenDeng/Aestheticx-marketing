# Nurse Clinic Employment + Invoicing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a super admin employ a nurse at a clinic (grant/revoke), which gives the nurse the clinic workspace and the ability to invoice that clinic.

**Architecture:** Model nurse↔clinic employment as **clinic membership** (matching the live `clinics: {id: "employee"}` claim), stored on `DemoState.clinicEmployments` and folded into the nurse's `accountsByID[nurse].clinicIDs`. That single derived-field change lights up the existing Employment view and `createServiceInvoice` (both read `clinicIDs`). `heldIdentities` derives the nurse's clinic identity from the grant so the profile switcher and invoice composer surface the clinic. The doctor-centric cooperation model is untouched.

**Tech Stack:** TypeScript, Next.js (App Router), React, Vitest + @testing-library/react, Firebase callables (live mirror).

## Global Constraints

- **A1 (storage):** Nurse employment is a standalone `ClinicEmployment` record, NOT a cooperation relationship. Never add a nurse "subject" to `CooperationRelationship`.
- **B1 (placement):** Admin management lives in the Relationships → **Employment** view (`RelationshipsSection.tsx`).
- **Employee scope = full clinic workspace:** a grant yields a clinic-context **nurse** identity (`{ role: "nurse", context: { kind: "clinic", clinic } }`).
- **Scope guard:** doctor-employees, the Prescribing view, and cooperation relationships/reducers are untouched. Baked seed memberships (Sarah/Ruby at Lumière) stay read-only — never migrated to grants, never removed by this feature's UI.
- **Live path:** demo works end-to-end now; the live claim-write (`setClinicMembership` callable) is a backend-repo follow-up. The web layer wires the call; failures surface via the existing sync-error banner.
- **Store mutations are immutable** (spread, never mutate). **No `console.log`.** Money stays in integer cents.
- **Test runner:** `npm test` (`vitest run`). A single file: `npx vitest run <path>`.

---

### Task 1: `ClinicEmployment` domain — type, state field, reducer, accessor

**Files:**
- Modify: `src/lib/demo/types.ts` (add `ClinicEmployment` interface; add `clinicEmployments` to `DemoState`; add two `AuditAction` values)
- Modify: `src/lib/demo/backend.ts` (add `clinicEmployments: []` to `emptyState()`; add `clinicEmploymentId`, `clinicEmploymentsList`, `SetClinicEmploymentInput`, `setClinicEmployment`)
- Test: `src/lib/demo/__tests__/clinic-employment.test.ts` (create)

**Interfaces:**
- Produces:
  - `ClinicEmployment = { id: string; nurseID: string; nurseName: string; clinicID: string; clinicName: string; grantedAt: number }`
  - `DemoState.clinicEmployments: ClinicEmployment[]`
  - `clinicEmploymentId(nurseID: string, clinicID: string): string` → `` `${nurseID}_${clinicID}` ``
  - `clinicEmploymentsList(state: DemoState): ClinicEmployment[]`
  - `SetClinicEmploymentInput = { nurseID: string; nurseName: string; clinicID: string; clinicName: string; employed: boolean }`
  - `setClinicEmployment(state, input, actor, now): DemoState`
  - `AuditAction` gains `"clinic_employment_granted" | "clinic_employment_revoked"`
- Consumes: existing `BackendError`, `appendAuditEntry`, `emptyState` from `backend.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/demo/__tests__/clinic-employment.test.ts`:

```typescript
// Nurse clinic employment (spec: 2026-07-25 nurse-clinic-employment). A super admin
// employs a nurse at a clinic; the grant folds into the nurse's clinicIDs, which unlocks
// the Employment view + createServiceInvoice. Modelled as membership, not a cooperation rel.
import { describe, expect, it } from "vitest";
import {
  BackendError,
  emptyState,
  setClinicEmployment,
  clinicEmploymentsList,
  createServiceInvoice,
} from "../backend";
import type { DemoState, Identity } from "../types";

const admin: Identity = { user: { id: "u-admin", name: "Priya Nair" }, role: "superAdmin", context: { kind: "independent" } };
const indieNurse: Identity = { user: { id: "u-indie", name: "Indie Nurse" }, role: "nurse", context: { kind: "independent" } };

// A nurse who is NOT yet a member of the clinic (the seed cast's nurses all are).
function stateWithNonMemberNurse(): DemoState {
  return {
    ...emptyState(),
    accountsByID: {
      "u-indie": { id: "u-indie", name: "Indie Nurse", email: "", roles: ["nurse"], clinicIDs: [], mustChangePassword: false },
      "u-doc": { id: "u-doc", name: "Dr Who", email: "", roles: ["doctor"], clinicIDs: [], mustChangePassword: false },
    },
    clinicsByID: { "clinic-lumiere": { id: "clinic-lumiere", name: "Lumière Clinic" } },
  };
}

const grant = { nurseID: "u-indie", nurseName: "Indie Nurse", clinicID: "clinic-lumiere", clinicName: "Lumière Clinic" };

describe("setClinicEmployment", () => {
  it("grants: folds the clinic into the nurse's clinicIDs, records the employment + audit", () => {
    const next = setClinicEmployment(stateWithNonMemberNurse(), { ...grant, employed: true }, admin, 1000);
    expect(next.accountsByID["u-indie"].clinicIDs).toEqual(["clinic-lumiere"]);
    expect(clinicEmploymentsList(next)).toEqual([
      { id: "u-indie_clinic-lumiere", nurseID: "u-indie", nurseName: "Indie Nurse", clinicID: "clinic-lumiere", clinicName: "Lumière Clinic", grantedAt: 1000 },
    ]);
    const audit = Object.values(next.auditLogByID).find((e) => e.action === "clinic_employment_granted");
    expect(audit?.targetID).toBe("u-indie");
  });

  it("revokes: removes the clinic from clinicIDs and drops the employment + audit", () => {
    const granted = setClinicEmployment(stateWithNonMemberNurse(), { ...grant, employed: true }, admin, 1000);
    const revoked = setClinicEmployment(granted, { ...grant, employed: false }, admin, 2000);
    expect(revoked.accountsByID["u-indie"].clinicIDs).toEqual([]);
    expect(clinicEmploymentsList(revoked)).toEqual([]);
    expect(Object.values(revoked.auditLogByID).some((e) => e.action === "clinic_employment_revoked")).toBe(true);
  });

  it("is idempotent on repeat grant — one record, one clinicID entry", () => {
    const once = setClinicEmployment(stateWithNonMemberNurse(), { ...grant, employed: true }, admin, 1000);
    const twice = setClinicEmployment(once, { ...grant, employed: true }, admin, 1500);
    expect(twice.accountsByID["u-indie"].clinicIDs).toEqual(["clinic-lumiere"]);
    expect(clinicEmploymentsList(twice)).toHaveLength(1);
  });

  it("rejects a non-superAdmin actor", () => {
    expect(() => setClinicEmployment(stateWithNonMemberNurse(), { ...grant, employed: true }, indieNurse, 1000))
      .toThrow(BackendError);
  });

  it("rejects a non-nurse target", () => {
    expect(() => setClinicEmployment(stateWithNonMemberNurse(), { nurseID: "u-doc", nurseName: "Dr Who", clinicID: "clinic-lumiere", clinicName: "Lumière Clinic", employed: true }, admin, 1000))
      .toThrow(BackendError);
  });

  it("rejects a missing clinic", () => {
    expect(() => setClinicEmployment(stateWithNonMemberNurse(), { ...grant, clinicID: "clinic-ghost", employed: true }, admin, 1000))
      .toThrow(BackendError);
  });

  it("unlocks invoicing: the nurse can only createServiceInvoice after being employed", () => {
    const before = stateWithNonMemberNurse();
    expect(() => createServiceInvoice(before, { clinicID: "clinic-lumiere", lines: [{ description: "June nursing", amountCents: 100000 }] }, indieNurse, 1000))
      .toThrow(BackendError);
    const after = setClinicEmployment(before, { ...grant, employed: true }, admin, 1000);
    const invoiced = createServiceInvoice(after, { clinicID: "clinic-lumiere", lines: [{ description: "June nursing", amountCents: 100000 }] }, indieNurse, 2000);
    expect(invoiced.invoices).toHaveLength(1);
    expect(invoiced.invoices[0].counterpartyID).toBe("clinic-lumiere");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/demo/__tests__/clinic-employment.test.ts`
Expected: FAIL — `setClinicEmployment`/`clinicEmploymentsList` are not exported.

- [ ] **Step 3: Add the type + state field + audit actions in `types.ts`**

In `src/lib/demo/types.ts`, add after the `AccountRecord` interface (near line 417):

```typescript
// Nurse↔clinic employment (spec: 2026-07-25). A super-admin-granted clinic membership for
// a nurse — the demo analogue of a live `clinics: { [id]: "employee" }` claim. Deliberately
// NOT a CooperationRelationship (that model is doctor-centric with prescribing semantics).
// Presence = employed; a revoke removes the record. `clinicName` is denormalised so
// heldIdentities can build the clinic identity without a directory lookup.
export interface ClinicEmployment {
  id: string; // `${nurseID}_${clinicID}` — deterministic, idempotent grant key
  nurseID: string;
  nurseName: string;
  clinicID: string;
  clinicName: string;
  grantedAt: number;
}
```

Extend the `AuditAction` union (near line 519) — add the two values before the closing `;`:

```typescript
  | "user_deleted"
  | "clinic_employment_granted"
  | "clinic_employment_revoked"
  | "admin_patient_access";
```

Add the field to `DemoState` (near the `relationshipAuditByID` field, around line 624):

```typescript
  // Nurse↔clinic employment grants (spec: 2026-07-25). Active grants only; a revoke removes
  // the record. Folded into accountsByID[nurse].clinicIDs on grant so the Employment view +
  // createServiceInvoice (both read clinicIDs) pick it up with no further change.
  clinicEmployments: ClinicEmployment[];
```

- [ ] **Step 4: Initialise the field + add the reducer/accessor in `backend.ts`**

In `src/lib/demo/backend.ts`, add `clinicEmployments: []` to the `emptyState()` return object (near `cooperationRelationshipsByID: {}`, around line 97):

```typescript
    cooperationRelationshipsByID: {},
    relationshipAuditByID: {},
    clinicEmployments: [],
```

Ensure `ClinicEmployment` is imported. The `AccountRecord`/type import block at the top of `backend.ts` pulls from `./types` — add `ClinicEmployment` to it (it appears in the existing `import type { ... } from "./types"` list near line 4).

Add the reducer + accessor. Place them right after `cooperationRelationshipsList` (around line 2019):

```typescript
export function clinicEmploymentId(nurseID: string, clinicID: string): string {
  return `${nurseID}_${clinicID}`;
}

export function clinicEmploymentsList(state: DemoState): ClinicEmployment[] {
  return [...state.clinicEmployments].sort(
    (a, b) => a.clinicName.localeCompare(b.clinicName) || a.nurseName.localeCompare(b.nurseName),
  );
}

export interface SetClinicEmploymentInput {
  nurseID: string;
  nurseName: string;
  clinicID: string;
  clinicName: string;
  employed: boolean;
}

// Grant/revoke a nurse's clinic membership (spec: 2026-07-25). Super-admin only; the target
// must be a nurse and the clinic must exist. A grant upserts the ClinicEmployment (idempotent
// on the deterministic id) and adds the clinicID to the nurse's clinicIDs; a revoke removes
// both. The clinicIDs fold is what unlocks the Employment view + createServiceInvoice.
export function setClinicEmployment(state: DemoState, input: SetClinicEmploymentInput, actor: Identity, now: number): DemoState {
  if (actor.role !== "superAdmin") throw new BackendError("notPermitted");
  const account = state.accountsByID[input.nurseID];
  if (!account || !account.roles.includes("nurse")) throw new BackendError("validationFailed");
  if (!state.clinicsByID[input.clinicID]) throw new BackendError("validationFailed");

  const id = clinicEmploymentId(input.nurseID, input.clinicID);
  const currentClinicIDs = account.clinicIDs ?? [];

  if (input.employed) {
    const employment: ClinicEmployment = {
      id,
      nurseID: input.nurseID,
      nurseName: input.nurseName,
      clinicID: input.clinicID,
      clinicName: input.clinicName,
      grantedAt: now,
    };
    const clinicEmployments = state.clinicEmployments.some((e) => e.id === id)
      ? state.clinicEmployments.map((e) => (e.id === id ? employment : e))
      : [...state.clinicEmployments, employment];
    const clinicIDs = currentClinicIDs.includes(input.clinicID) ? currentClinicIDs : [...currentClinicIDs, input.clinicID];
    const next = {
      ...state,
      clinicEmployments,
      accountsByID: { ...state.accountsByID, [input.nurseID]: { ...account, clinicIDs } },
    };
    return appendAuditEntry(
      next,
      { actor, action: "clinic_employment_granted", targetType: "account", targetID: input.nurseID, summary: `employed ${input.nurseName} at ${input.clinicName}` },
      now,
    );
  }

  const clinicEmployments = state.clinicEmployments.filter((e) => e.id !== id);
  const clinicIDs = currentClinicIDs.filter((c) => c !== input.clinicID);
  const next = {
    ...state,
    clinicEmployments,
    accountsByID: { ...state.accountsByID, [input.nurseID]: { ...account, clinicIDs } },
  };
  return appendAuditEntry(
    next,
    { actor, action: "clinic_employment_revoked", targetType: "account", targetID: input.nurseID, summary: `removed ${input.nurseName} from ${input.clinicName}` },
    now,
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/demo/__tests__/clinic-employment.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (the new `AuditAction` values, `DemoState` field, and `emptyState` init all line up).

- [ ] **Step 7: Commit**

```bash
git add src/lib/demo/types.ts src/lib/demo/backend.ts src/lib/demo/__tests__/clinic-employment.test.ts
git commit -m "feat(admin): clinic-employment reducer — grant/revoke a nurse's clinic membership"
```

---

### Task 2: `heldIdentities` derives the nurse's clinic identity from grants

**Files:**
- Modify: `src/lib/demo/identity.ts` (add a `clinicEmployments` param + a nurse-derivation block)
- Test: `src/lib/demo/__tests__/held-identities.test.ts` (create)

**Interfaces:**
- Consumes: `ClinicEmployment` (Task 1).
- Produces: new signature
  `heldIdentities(active: Identity, available: Identity[], demoRelationships?: CooperationRelationship[], clinicEmployments?: ClinicEmployment[]): Identity[]`
  — when `available` is empty, appends `{ user: active.user, role: "nurse", context: { kind: "clinic", clinic: { id, name } } }` for each active-nurse grant, deduped.

- [ ] **Step 1: Write the failing test**

Create `src/lib/demo/__tests__/held-identities.test.ts`:

```typescript
// heldIdentities nurse-employment derivation (spec: 2026-07-25). In demo mode (no claims),
// a nurse's granted clinic membership must surface as a clinic-context nurse identity so the
// profile switcher + invoice composer can offer the clinic — mirroring the live claim path.
import { describe, expect, it } from "vitest";
import { heldIdentities } from "../identity";
import type { ClinicEmployment, Identity } from "../types";

const indie: Identity = { user: { id: "u-indie", name: "Indie Nurse" }, role: "nurse", context: { kind: "independent" } };
const employment: ClinicEmployment = { id: "u-indie_clinic-lumiere", nurseID: "u-indie", nurseName: "Indie Nurse", clinicID: "clinic-lumiere", clinicName: "Lumière Clinic", grantedAt: 1 };

describe("heldIdentities — nurse clinic employment", () => {
  it("derives one clinic-context nurse identity for the active nurse's grant", () => {
    const held = heldIdentities(indie, [], [], [employment]);
    const clinic = held.filter((i) => i.role === "nurse" && i.context.kind === "clinic");
    expect(clinic).toHaveLength(1);
    expect(clinic[0].context).toEqual({ kind: "clinic", clinic: { id: "clinic-lumiere", name: "Lumière Clinic" } });
    // The independent identity is retained.
    expect(held.some((i) => i.context.kind === "independent")).toBe(true);
  });

  it("does not leak another nurse's grant", () => {
    const other: ClinicEmployment = { ...employment, id: "u-other_clinic-lumiere", nurseID: "u-other", nurseName: "Other" };
    const held = heldIdentities(indie, [], [], [other]);
    expect(held.some((i) => i.context.kind === "clinic")).toBe(false);
  });

  it("dedupes against an identity the account already holds", () => {
    const alreadyClinic: Identity = { user: { id: "u-indie", name: "Indie Nurse" }, role: "nurse", context: { kind: "clinic", clinic: { id: "clinic-lumiere", name: "Lumière Clinic" } } };
    // available is empty → demo path; base identities come from the active set fallback.
    const held = heldIdentities(alreadyClinic, [], [], [employment]);
    const clinic = held.filter((i) => i.role === "nurse" && i.context.kind === "clinic" && i.context.clinic.id === "clinic-lumiere");
    expect(clinic).toHaveLength(1);
  });

  it("returns available unchanged in live mode (non-empty available)", () => {
    const held = heldIdentities(indie, [indie], [], [employment]);
    expect(held).toEqual([indie]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/demo/__tests__/held-identities.test.ts`
Expected: FAIL — the 4th arg is ignored, so the clinic identity is never derived.

- [ ] **Step 3: Implement the derivation**

In `src/lib/demo/identity.ts`, update the import and signature, and add the nurse block after the existing doctor-relationship loop. Replace the current function signature/body region:

```typescript
import { DEMO_ACCOUNTS } from "./accounts";
import { effectiveRelationshipKinds, type ClinicEmployment, type CooperationRelationship, type Identity } from "./types";

export function heldIdentities(
  active: Identity,
  available: Identity[],
  demoRelationships: CooperationRelationship[] = [],
  clinicEmployments: ClinicEmployment[] = [],
): Identity[] {
  if (available.length) return available;
  const base = DEMO_ACCOUNTS.find((a) => a.identities.some((i) => i.user.id === active.user.id))?.identities ?? [active];
  const identities = [...base];

  // Doctor employee-kind clinic identities (unchanged).
  for (const relationship of demoRelationships) {
    if (relationship.status !== "active" || relationship.counterpartyType !== "clinic") continue;
    if (!effectiveRelationshipKinds(relationship)?.includes("employee")) continue;
    if (relationship.doctorID !== active.user.id) continue;
    const duplicate = identities.some((identity) =>
      identity.role === "doctor"
      && identity.context.kind === "clinic"
      && identity.context.clinic.id === relationship.counterpartyID);
    if (duplicate) continue;
    identities.push({
      user: active.user,
      role: "doctor",
      context: { kind: "clinic", clinic: { id: relationship.counterpartyID, name: relationship.counterpartyName } },
    });
  }

  // Nurse clinic employment (spec: 2026-07-25) — the demo analogue of a live `clinics`
  // "employee" claim. Grants for the active nurse become clinic-context nurse identities,
  // deduped against any the account already holds (e.g. a baked seed membership).
  for (const employment of clinicEmployments) {
    if (employment.nurseID !== active.user.id) continue;
    const duplicate = identities.some((identity) =>
      identity.role === "nurse"
      && identity.context.kind === "clinic"
      && identity.context.clinic.id === employment.clinicID);
    if (duplicate) continue;
    identities.push({
      user: active.user,
      role: "nurse",
      context: { kind: "clinic", clinic: { id: employment.clinicID, name: employment.clinicName } },
    });
  }

  return identities;
}
```

Note: the early `if (demoRelationships.length === 0) return base;` shortcut in the original is removed — the loops already no-op on empty inputs, and keeping it would skip nurse-employment derivation when there are no doctor relationships.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/demo/__tests__/held-identities.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Guard existing callers**

Run: `npx vitest run src/lib/demo/__tests__ src/app src/components`
Expected: PASS — the two extra params are optional; doctor-only callers are unaffected.

- [ ] **Step 6: Commit**

```bash
git add src/lib/demo/identity.ts src/lib/demo/__tests__/held-identities.test.ts
git commit -m "feat(identity): derive a nurse's clinic identity from an employment grant"
```

---

### Task 3: Store surface — `clinicEmployments()` + `setClinicEmployment()` + live mirror

**Files:**
- Modify: `src/lib/demo/store.tsx` (extend the store interface + the value object)
- Modify: `src/lib/firebase/mirror.ts` (add `mirrorSetClinicMembership`)
- Test: none new — thin glue over the Task 1 reducer, following the established `setCooperationRelationship` wiring convention (covered by the reducer tests + the component tests in Tasks 4–5). Verified by typecheck + the existing suite.

**Interfaces:**
- Consumes: `backend.clinicEmploymentsList`, `backend.setClinicEmployment`, `backend.SetClinicEmploymentInput` (Task 1).
- Produces (on the store value):
  - `clinicEmployments: () => ReturnType<typeof backend.clinicEmploymentsList>`
  - `setClinicEmployment: (input: import("./backend").SetClinicEmploymentInput, actor: Identity) => void`
  - `mirrorSetClinicMembership(input): Promise<void>` in `mirror.ts`.

- [ ] **Step 1: Add the interface members**

In `src/lib/demo/store.tsx`, in the store-value interface, right after the `removeCooperationRelationship` member (around line 93):

```typescript
  removeCooperationRelationship: (relationshipID: string, actor: Identity) => void;
  /** Nurse↔clinic employment (spec: 2026-07-25): the active grants + a super-admin
   *  grant/revoke. Demo-writable; live best-effort mirrors to the setClinicMembership callable. */
  clinicEmployments: () => ReturnType<typeof backend.clinicEmploymentsList>;
  setClinicEmployment: (input: import("./backend").SetClinicEmploymentInput, actor: Identity) => void;
```

- [ ] **Step 2: Add the value implementation**

In the returned store value object, right after the `removeCooperationRelationship` implementation (around line 859):

```typescript
      clinicEmployments: () => backend.clinicEmploymentsList(state),
      setClinicEmployment: (input, actor) => {
        // Eager-validate + apply (throws before the async live branch); demo-writable.
        const next = backend.setClinicEmployment(state, input, actor, writeNow());
        if (!live) { setState(() => next); return; }
        void (async () => {
          try {
            const m = await import("@/lib/firebase/mirror");
            await m.mirrorSetClinicMembership(input);
            setRefreshTick((t) => t + 1);
          } catch (e) { setLastSyncError(syncErrorMessage(e)); }
        })();
      },
```

- [ ] **Step 3: Add the mirror function**

In `src/lib/firebase/mirror.ts`, after `mirrorRemoveCooperationRelationship` (around line 61):

```typescript
// Nurse clinic membership (spec: 2026-07-25). `employed` maps to the claim kind: an
// "employee" grant or its removal. Backend callable `setClinicMembership` is a follow-up in
// the functions repo — until it ships, live calls reject and surface via the sync-error banner.
export async function mirrorSetClinicMembership(input: import("@/lib/demo/backend").SetClinicEmploymentInput): Promise<void> {
  await httpsCallable(functions(), "setClinicMembership")({
    userId: input.nurseID,
    clinicId: input.clinicID,
    kind: input.employed ? "employee" : null,
  });
}
```

- [ ] **Step 4: Typecheck + full suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; existing suite green (store value satisfies its interface).

- [ ] **Step 5: Commit**

```bash
git add src/lib/demo/store.tsx src/lib/firebase/mirror.ts
git commit -m "feat(store): clinicEmployments accessor + setClinicEmployment with live mirror"
```

---

### Task 4: Employment view — "Add employee" + Remove on grant-backed nurse rows

**Files:**
- Modify: `src/components/admin/RelationshipsSection.tsx` (Employment view: add-employee control per clinic; make grant-backed nurse member rows removable)
- Test: `src/components/admin/__tests__/clinic-employment-view.test.tsx` (create)

**Interfaces:**
- Consumes: `store.clinicEmployments()`, `store.setClinicEmployment(input, actor)` (Task 3); `store.accounts()`, `store.clinics()` (existing).
- Produces: UI only.

Behaviour:
- In `employmentGroups`, a nurse member row is **grant-backed** iff a `ClinicEmployment` exists with `nurseID === member.id && clinicID === group.clinicID`. Grant-backed rows show a **Remove** button (inline confirm) → `setClinicEmployment({ nurseID, nurseName, clinicID, clinicName, employed: false }, identity)`. Baked rows keep the read-only "Member account" pill.
- Each clinic card footer gets an **"Add employee"** control: a `<select>` of nurses (`accounts` with role `nurse`) not already members of that clinic (`!(member.clinicIDs ?? []).includes(clinicID)` and not already grant-listed), plus an **Add** button → `setClinicEmployment({ ..., employed: true }, identity)`. If no eligible nurse, show "No nurses to add." Errors render inline.

- [ ] **Step 1: Write the failing test**

Create `src/components/admin/__tests__/clinic-employment-view.test.tsx`:

```typescript
// Nurse clinic employment in the Employment view (spec: 2026-07-25). Admins add a nurse to a
// clinic (grant) and remove grant-backed members; baked members stay read-only.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ClinicEmployment, CooperationRelationship, Identity } from "@/lib/demo/types";

const admin: Identity = { user: { id: "u-admin", name: "Priya Nair" }, role: "superAdmin", context: { kind: "independent" } };

const setClinicEmployment = vi.fn();
let relationships: CooperationRelationship[] = [];
let clinicDirectory: { id: string; label: string; unnamed?: boolean }[] = [];
let accounts: { id: string; name: string; email: string; roles: string[]; clinicIDs?: string[]; mustChangePassword: boolean }[] = [];
let clinicEmployments: ClinicEmployment[] = [];

vi.mock("@/lib/demo/auth", () => ({
  useDemoAuth: () => ({ identity: admin, availableIdentities: [admin], selectIdentity: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("@/lib/demo/store", () => ({
  useDemoStore: () => ({
    accounts: () => accounts,
    cooperationRelationships: () => relationships,
    relationshipAuditFor: () => [],
    clinics: () => clinicDirectory,
    listDoctors: () => Promise.resolve([]),
    setCooperationRelationship: vi.fn(),
    removeCooperationRelationship: vi.fn(),
    clinicEmployments: () => clinicEmployments,
    setClinicEmployment,
  }),
}));

import { CooperationRelationshipsSection } from "@/components/admin/RelationshipsSection";

async function openEmployment() {
  render(<CooperationRelationshipsSection />);
  await act(async () => {});
  await userEvent.click(screen.getByRole("button", { name: "Employment" }));
}

beforeEach(() => {
  setClinicEmployment.mockReset();
  relationships = [];
  clinicDirectory = [{ id: "clinic-lumiere", label: "Lumière Clinic" }];
  accounts = [
    { id: "u-ruby", name: "Ruby Walsh", email: "", roles: ["nurse"], clinicIDs: ["clinic-lumiere"], mustChangePassword: false }, // baked member (no grant)
    { id: "u-indie", name: "Indie Nurse", email: "", roles: ["nurse"], clinicIDs: [], mustChangePassword: false },              // addable
  ];
  clinicEmployments = [];
});

describe("Employment view — nurse clinic employment", () => {
  it("adds a nurse as an employee via the picker", async () => {
    await openEmployment();
    const card = screen.getByText("Lumière Clinic").closest("div")!;
    await userEvent.selectOptions(within(card).getByLabelText(/add employee/i), "u-indie");
    await userEvent.click(within(card).getByRole("button", { name: /^Add$/ }));
    expect(setClinicEmployment).toHaveBeenCalledWith(
      { nurseID: "u-indie", nurseName: "Indie Nurse", clinicID: "clinic-lumiere", clinicName: "Lumière Clinic", employed: true },
      admin,
    );
  });

  it("removes a grant-backed nurse member", async () => {
    clinicEmployments = [{ id: "u-indie_clinic-lumiere", nurseID: "u-indie", nurseName: "Indie Nurse", clinicID: "clinic-lumiere", clinicName: "Lumière Clinic", grantedAt: 1 }];
    accounts = [
      { id: "u-ruby", name: "Ruby Walsh", email: "", roles: ["nurse"], clinicIDs: ["clinic-lumiere"], mustChangePassword: false },
      { id: "u-indie", name: "Indie Nurse", email: "", roles: ["nurse"], clinicIDs: ["clinic-lumiere"], mustChangePassword: false },
    ];
    await openEmployment();
    const indieRow = screen.getByText("Indie Nurse").closest("li")!;
    await userEvent.click(within(indieRow).getByRole("button", { name: /remove/i }));
    await userEvent.click(within(indieRow).getByRole("button", { name: /confirm/i }));
    expect(setClinicEmployment).toHaveBeenCalledWith(
      expect.objectContaining({ nurseID: "u-indie", clinicID: "clinic-lumiere", employed: false }),
      admin,
    );
  });

  it("leaves a baked member (no grant) read-only — no Remove button", async () => {
    await openEmployment();
    const rubyRow = screen.getByText("Ruby Walsh").closest("li")!;
    expect(within(rubyRow).queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
    expect(within(rubyRow).getByText(/member account/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/admin/__tests__/clinic-employment-view.test.tsx`
Expected: FAIL — no "Add employee" control / no Remove on nurse rows.

- [ ] **Step 3: Implement the Employment-view changes**

In `src/components/admin/RelationshipsSection.tsx`:

(a) Read the grants in `CooperationRelationshipsSection` (near the other `store.*()` reads, ~line 37):

```typescript
  const clinicEmployments = store.clinicEmployments();
```

(b) Pass what each clinic card needs. Replace the member-row rendering inside the Employment branch so nurse member rows that are grant-backed render a removable row. Change the member `<li>` mapping (the block around lines 137–149) to:

```typescript
                  {g.members.map((m) => {
                    const employment = clinicEmployments.find((e) => e.nurseID === m.id && e.clinicID === g.clinicID);
                    return (
                      <EmploymentMemberRow
                        key={m.id}
                        member={m}
                        clinicID={g.clinicID}
                        clinicName={g.name}
                        employment={employment}
                        identity={identity}
                      />
                    );
                  })}
```

(c) After the `<ul>...</ul>` inside each Employment clinic card (right before the card's closing `</div>`), add the add-employee control. Change the card body so it always renders the control under the list:

```typescript
              )}
              <AddEmployeeControl
                clinicID={g.clinicID}
                clinicName={g.name}
                nurses={accounts.filter((a) => a.roles.includes("nurse") && !(a.clinicIDs ?? []).includes(g.clinicID))}
                identity={identity}
              />
            </div>
```

(d) Add the two components at the end of the file:

```typescript
// One nurse member row in the Employment view. A grant-backed membership (an admin
// ClinicEmployment) is removable; a baked seed membership stays a read-only "Member account".
function EmploymentMemberRow({ member, clinicID, clinicName, employment, identity }: {
  member: AccountRecord;
  clinicID: string;
  clinicName: string;
  employment: import("@/lib/demo/types").ClinicEmployment | undefined;
  identity: Identity;
}) {
  const store = useDemoStore();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  function remove() {
    setError(null);
    try {
      store.setClinicEmployment(
        { nurseID: member.id, nurseName: member.name || member.email || member.id, clinicID, clinicName, employed: false },
        identity,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setConfirming(false);
  }

  return (
    <li className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">{member.name || member.email || member.id}</span>
        <span className="micro block">
          {member.roles.filter((role) => role !== "doctor").map((role) => role === "clinicAdmin" ? "Clinic admin" : role === "nurse" ? "Nurse" : role).join(" · ")}
        </span>
        {error && <span className="micro block" style={{ color: "var(--color-rose)" }}>{error}</span>}
      </span>
      {employment ? (
        confirming ? (
          <span className="flex items-center gap-2">
            <span className="micro" style={{ color: "var(--color-rose)" }}>Remove from clinic?</span>
            <button onClick={remove} className="micro rounded-btn px-2.5 py-1 text-card" style={{ background: "var(--color-rose)" }}>Confirm</button>
            <button onClick={() => setConfirming(false)} className="micro rounded-btn border border-line px-2.5 py-1 text-ink-soft">Cancel</button>
          </span>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="micro flex-none rounded-btn border px-2.5 py-1 hover:opacity-80"
            style={{ borderColor: "var(--color-rose)", color: "var(--color-rose)" }}
          >
            Remove
          </button>
        )
      ) : (
        <span className="micro flex-none rounded-full border border-line px-2 py-0.5 text-ink-soft">Member account</span>
      )}
    </li>
  );
}

// "Add employee" control on a clinic card: employs one of the clinic's non-member nurses.
function AddEmployeeControl({ clinicID, clinicName, nurses, identity }: {
  clinicID: string;
  clinicName: string;
  nurses: AccountRecord[];
  identity: Identity;
}) {
  const store = useDemoStore();
  const [choice, setChoice] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (nurses.length === 0) {
    return <p className="micro px-4 py-3 text-ink-soft">No nurses to add.</p>;
  }
  const selected = nurses.some((n) => n.id === choice) ? choice : nurses[0].id;

  function add() {
    setError(null);
    const nurse = nurses.find((n) => n.id === selected);
    if (!nurse) { setError("Pick a nurse."); return; }
    try {
      store.setClinicEmployment(
        { nurseID: nurse.id, nurseName: nurse.name || nurse.email || nurse.id, clinicID, clinicName, employed: true },
        identity,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2 border-t border-line px-4 py-3">
      <label className="block">
        <span className="micro">Add employee</span>
        <select
          value={selected}
          onChange={(e) => setChoice(e.target.value)}
          className="mt-1 block rounded-field border border-line bg-card px-2.5 py-1.5 text-sm text-ink"
        >
          {nurses.map((n) => <option key={n.id} value={n.id}>{n.name || n.email || n.id}</option>)}
        </select>
      </label>
      <button onClick={add} className="rounded-btn px-3 py-1.5 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>Add</button>
      {error && <p className="micro w-full" style={{ color: "var(--color-rose)" }}>{error}</p>}
    </div>
  );
}
```

Note the empty-card branch: today it renders `No staff yet.` when `g.rels.length === 0 && g.members.length === 0`. Keep that message but still render `AddEmployeeControl` beneath it so a staffless clinic can gain its first nurse — i.e. move `AddEmployeeControl` outside the `g.rels.length === 0 && g.members.length === 0` conditional so it always shows.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/admin/__tests__/clinic-employment-view.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Regression — existing relationship-view tests still pass**

Run: `npx vitest run src/components/admin/__tests__`
Expected: PASS (existing `relationship-views` / `create-relationship-clinic` unaffected — they don't set `clinicEmployments`, so the mocked store returns `undefined`; guard with `store.clinicEmployments?.() ?? []` in the component if any existing test's mock lacks the method).

Note: if `relationship-views.test.tsx`'s store mock lacks `clinicEmployments`, calling it throws. Use `const clinicEmployments = store.clinicEmployments?.() ?? [];` in Step 3(a) to stay backward-compatible with those mocks, OR add `clinicEmployments: () => []` to that test's mock. Prefer the optional-call guard — it also matches the defensive `typeof store.cooperationRelationships === "function"` pattern already used in `profile/page.tsx`.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/RelationshipsSection.tsx src/components/admin/__tests__/clinic-employment-view.test.tsx
git commit -m "feat(admin): add/remove a nurse employee in the Employment view"
```

---

### Task 5: Surface the nurse's clinic in the switcher + invoice composer

**Files:**
- Modify: `src/app/app/profile/page.tsx` (pass `clinicEmployments` into `heldIdentities`)
- Modify: `src/components/app/ServiceInvoiceComposer.tsx` (pass `clinicEmployments` into `heldIdentities`)
- Test: `src/components/app/__tests__/service-invoice-nurse-employment.test.tsx` (create)

**Interfaces:**
- Consumes: `heldIdentities(active, available, demoRelationships, clinicEmployments)` (Task 2); `store.clinicEmployments()` (Task 3).
- Produces: none.

- [ ] **Step 1: Write the failing test**

Create `src/components/app/__tests__/service-invoice-nurse-employment.test.tsx`:

```typescript
// A nurse employed at a clinic (grant, no baked clinic identity) can invoice that clinic
// (spec: 2026-07-25). The composer surfaces the clinic via heldIdentities' grant derivation.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ClinicEmployment, Identity } from "@/lib/demo/types";

// Independent nurse — NO baked clinic identity; the only clinic comes from the grant.
const indie: Identity = { user: { id: "u-indie", name: "Indie Nurse" }, role: "nurse", context: { kind: "independent" } };
const createServiceInvoice = vi.fn();
let clinicEmployments: ClinicEmployment[] = [];

vi.mock("@/lib/demo/auth", () => ({
  useDemoAuth: () => ({ identity: indie, availableIdentities: [], selectIdentity: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("@/lib/demo/store", () => ({
  useDemoStore: () => ({
    serviceInvoicingEnabled: true,
    cooperationRelationships: () => [],
    clinicEmployments: () => clinicEmployments,
    createServiceInvoice,
  }),
}));

import { ServiceInvoiceComposer } from "@/components/app/ServiceInvoiceComposer";

beforeEach(() => {
  createServiceInvoice.mockReset();
  clinicEmployments = [];
});

describe("ServiceInvoiceComposer — employed nurse", () => {
  it("renders nothing when the nurse has no clinic membership", () => {
    const { container } = render(<ServiceInvoiceComposer />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lets a granted nurse issue a service invoice to the clinic", async () => {
    clinicEmployments = [{ id: "u-indie_clinic-lumiere", nurseID: "u-indie", nurseName: "Indie Nurse", clinicID: "clinic-lumiere", clinicName: "Lumière Clinic", grantedAt: 1 }];
    render(<ServiceInvoiceComposer />);
    await act(async () => {});
    expect(screen.getByText(/Lumière Clinic/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Line 1 description"), "June nursing");
    await userEvent.type(screen.getByLabelText("Line 1 amount"), "1000");
    await userEvent.click(screen.getByRole("button", { name: /issue invoice/i }));
    expect(createServiceInvoice).toHaveBeenCalledWith(
      { clinicID: "clinic-lumiere", lines: [{ description: "June nursing", amountCents: 100000 }] },
      indie,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/app/__tests__/service-invoice-nurse-employment.test.tsx`
Expected: FAIL — the composer's `heldIdentities` call ignores grants, so `clinicOptions` is empty and it renders nothing.

- [ ] **Step 3: Pass grants into `heldIdentities` in the composer**

In `src/components/app/ServiceInvoiceComposer.tsx`, update the `heldIdentities` call (line 45):

```typescript
  for (const held of heldIdentities(identity, availableIdentities, store.cooperationRelationships(), store.clinicEmployments())) {
```

- [ ] **Step 4: Pass grants into `heldIdentities` in the profile switcher**

In `src/app/app/profile/page.tsx`, update the `heldIdentities` call (lines 70–74):

```typescript
  const identities = heldIdentities(
    me,
    availableIdentities,
    typeof store.cooperationRelationships === "function" ? store.cooperationRelationships() : [],
    typeof store.clinicEmployments === "function" ? store.clinicEmployments() : [],
  );
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/app/__tests__/service-invoice-nurse-employment.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Full suite + typecheck**

Run: `npx tsc --noEmit && npm test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/components/app/ServiceInvoiceComposer.tsx src/app/app/profile/page.tsx src/components/app/__tests__/service-invoice-nurse-employment.test.tsx
git commit -m "feat(billing): surface a nurse's employed clinic in the switcher + invoice composer"
```

---

### Task 6: Seed a demonstrable grant + manual verification

**Files:**
- Modify: `src/lib/demo/seed.ts` (employ one nurse at Lumière via a `ClinicEmployment` so the demo shows a removable member + a working invoice out of the box — optional but recommended for dogfooding)
- Verify: browser preview

**Interfaces:** none.

- [ ] **Step 1: Seed one grant (optional demo polish)**

In `src/lib/demo/seed.ts`, after `accountsByID` is assembled and folded into state (around line 362), employ Ruby at Lumière as a grant so the Employment view shows a removable row (Ruby is otherwise a baked-only member). Add:

```typescript
  // One admin-granted nurse employment so the demo Employment view has a removable member
  // and Ruby can invoice Lumière out of the box (spec: 2026-07-25).
  state = {
    ...state,
    clinicEmployments: [
      { id: "u-ruby_clinic-lumiere", nurseID: "u-ruby", nurseName: "Ruby Walsh", clinicID: LUMIERE.id, clinicName: LUMIERE.name, grantedAt: SEED_NOW },
    ],
  };
```

(Leave Sarah's Lumière membership baked/read-only, to keep an example of each.)

Confirm `SEED_NOW` and `LUMIERE` are already imported in `seed.ts` (they are used elsewhere in the file); if not, add them.

- [ ] **Step 2: Run the seed/state tests**

Run: `npx vitest run src/lib/demo`
Expected: PASS. If any existing seed snapshot/count test asserts an exact `clinicEmployments` length or Employment-view member composition, update it to expect Ruby's grant.

- [ ] **Step 3: Manual verification in the browser**

Start the dev server (preview_start with the `web` launch config — NOT `web-demo`; in a worktree `web` serves this tree's code). Then:
1. Sign in as **Priya Nair — Platform Admin** → Admin → Relationships → **Employment**. Confirm Lumière lists Ruby with a **Remove** button and Sarah as a read-only Member account, and an **Add employee** control listing any non-member nurse.
2. Add a nurse, confirm the row appears; Remove it, confirm it disappears.
3. Sign in as **Ruby Walsh — Nurse** → Billing/Invoice page → confirm **"Invoice the clinic"** shows Lumière and an invoice can be issued.

Navigate via in-app SPA links (a full page reload resets the in-memory demo store).

- [ ] **Step 4: Screenshot the Employment view + the composer** and share as proof.

- [ ] **Step 5: Commit**

```bash
git add src/lib/demo/seed.ts
git commit -m "chore(demo): seed a nurse clinic-employment grant for dogfooding"
```

---

## Self-Review

**Spec coverage:**
- A1 storage (`ClinicEmployment`, not a cooperation rel) → Task 1. ✓
- clinicIDs fold unlocking Employment view + `createServiceInvoice` → Task 1 (reducer) + Task 1 invoicing test. ✓
- Full-workspace identity derivation → Task 2. ✓
- Store accessor + action + live mirror (`setClinicMembership`) → Task 3. ✓
- B1 admin UI: add-employee + removable grant rows + baked read-only → Task 4. ✓
- Switcher + composer surface the clinic → Task 5. ✓
- Audit actions granted/revoked on the platform log → Task 1. ✓
- Guards (superAdmin / nurse target / clinic exists / idempotent) → Task 1. ✓
- Live follow-up documented, failures surfaced via sync-error banner → Task 3 mirror comment + Global Constraints. ✓
- Scope guard (doctors/prescribing/baked seed untouched) → Task 4 read-only baked rows + Task 2 dedup. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code; test bodies are concrete.

**Type consistency:** `ClinicEmployment` shape, `SetClinicEmploymentInput` (`{ nurseID, nurseName, clinicID, clinicName, employed }`), `clinicEmploymentsList`, `setClinicEmployment`, and the `heldIdentities` 4-arg signature are used identically across Tasks 1–6. Audit actions `clinic_employment_granted` / `clinic_employment_revoked` match between the reducer and the `AuditAction` union.

**Known coupling to watch:** Task 4 Step 5 flags that pre-existing Employment-view tests mock the store without `clinicEmployments`; the optional-call guard (`store.clinicEmployments?.() ?? []`) keeps them green. Task 6 Step 2 flags updating any exact-count seed assertions.

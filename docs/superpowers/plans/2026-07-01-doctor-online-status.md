# Doctor Online/Always-Accept Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a doctor set an independent online/offline status and always-accept-authorisations flag, persisted in both demo and live modes, surfaced as two checkboxes on `/app/availability`.

**Architecture:** A pure per-doctor `DoctorStatus` model in `DemoState` (mirrors the existing `followUpSettingsByUser`/`bookingTokensByUser` per-owner-`Record` convention), a store selector + mutator, a UI card on the existing `DoctorAvailability` component, and live parity wired to the **already-deployed** `setOnlineStatus` Cloud Function (no backend change).

**Tech Stack:** Next.js 16 (App Router), TypeScript, Tailwind v4, Vitest, in-memory demo backend + Firebase live mirror.

**Spec:** `docs/superpowers/specs/2026-07-01-doctor-online-status-design.md`

---

### Task 1: Model + empty state

**Files:**
- Modify: `src/lib/demo/types.ts` (add interface after `TreatmentAvailability`, ~line 216; add field to `DemoState`, ~line 261)
- Modify: `src/lib/demo/backend.ts` (`emptyState`, ~line 53)

- [ ] **Step 1: Add the model interface to `types.ts`**, immediately after the `TreatmentAvailability` interface (after line 216, before the `RepeatUsage` interface):

```ts
// A doctor's online/always-accept status for authorisation requests (feedback: doctor online
// status + always-on authorisations). Independent booleans — always-accept works even while
// offline (spec: "Always-accept overrides availability"). Absent entry -> both false.
export interface DoctorStatus {
  online: boolean;
  alwaysAcceptAuth: boolean;
}
```

- [ ] **Step 2: Add the collection to `DemoState`**, immediately after the existing
  `treatmentAvailabilityByOwner: Record<string, TreatmentAvailability>;` line:

```ts
  doctorStatusByID: Record<string, DoctorStatus>;
```

- [ ] **Step 3: Add it to `emptyState()`** in `backend.ts`, immediately after the existing
  `treatmentAvailabilityByOwner: {},` line:

```ts
    doctorStatusByID: {},
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/demo/types.ts src/lib/demo/backend.ts
git commit -m "feat(availability): doctor-status model + empty state"
```

---

### Task 2: Pure query + mutator (TDD)

**Files:**
- Modify: `src/lib/demo/backend.ts` (new functions near the treatment-availability section)
- Test: `src/lib/demo/__tests__/doctor-status.test.ts` (new)

- [ ] **Step 1: Write the failing test** — create `src/lib/demo/__tests__/doctor-status.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { doctorStatusForUser, setDoctorStatus, emptyState } from "@/lib/demo/backend";

describe("doctorStatusForUser", () => {
  it("defaults to both false when the doctor has no stored status", () => {
    expect(doctorStatusForUser(emptyState(), "u-voss")).toEqual({ online: false, alwaysAcceptAuth: false });
  });

  it("returns the stored status when present", () => {
    const s = { ...emptyState(), doctorStatusByID: { "u-voss": { online: true, alwaysAcceptAuth: false } } };
    expect(doctorStatusForUser(s, "u-voss")).toEqual({ online: true, alwaysAcceptAuth: false });
  });
});

describe("setDoctorStatus", () => {
  it("merges a single-field patch onto the default when no prior status exists", () => {
    const s = setDoctorStatus(emptyState(), "u-voss", { online: true });
    expect(doctorStatusForUser(s, "u-voss")).toEqual({ online: true, alwaysAcceptAuth: false });
  });

  it("merges a patch without disturbing the other field", () => {
    let s = setDoctorStatus(emptyState(), "u-voss", { online: true });
    s = setDoctorStatus(s, "u-voss", { alwaysAcceptAuth: true });
    expect(doctorStatusForUser(s, "u-voss")).toEqual({ online: true, alwaysAcceptAuth: true });
  });

  it("does not mutate the input state (immutability)", () => {
    const before = emptyState();
    const after = setDoctorStatus(before, "u-voss", { online: true });
    expect(before.doctorStatusByID).toEqual({});
    expect(after).not.toBe(before);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/demo/__tests__/doctor-status.test.ts`
Expected: FAIL — `doctorStatusForUser`/`setDoctorStatus` are not exported.

- [ ] **Step 3: Implement the functions** in `backend.ts`, near the treatment-availability
  section (after `removeTreatmentBlock` or any nearby treatment-availability function — group
  with related per-owner config helpers). Add `DoctorStatus` to the existing `./types` import:

```ts
export function doctorStatusForUser(state: DemoState, doctorID: string): DoctorStatus {
  return state.doctorStatusByID[doctorID] ?? { online: false, alwaysAcceptAuth: false };
}

export function setDoctorStatus(state: DemoState, doctorID: string, patch: Partial<DoctorStatus>): DemoState {
  const next = { ...doctorStatusForUser(state, doctorID), ...patch };
  return { ...state, doctorStatusByID: { ...state.doctorStatusByID, [doctorID]: next } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/demo/__tests__/doctor-status.test.ts`
Expected: PASS (all 5 cases).

- [ ] **Step 5: Run the full demo suite to catch regressions**

Run: `npx vitest run src/lib/demo`
Expected: PASS (should be 271 + 5 = 276 or thereabouts in this directory; exact prior count
was 271 across the whole repo — just confirm no failures).

- [ ] **Step 6: Commit**

```bash
git add src/lib/demo/backend.ts src/lib/demo/__tests__/doctor-status.test.ts
git commit -m "feat(availability): doctor-status query + mutator"
```

---

### Task 3: Store selector + mutator

**Files:**
- Modify: `src/lib/demo/store.tsx` (`StoreValue` interface ~line 51; `value` object near
  `treatmentAvailabilityForOwner`, ~line 294)
- Modify: `src/lib/firebase/mirror.ts` (new `mirrorSetOnlineStatus`, placeholder body — filled
  for real in Task 4 since the callable already exists and takes the exact shape below, so this
  can be the real body directly, no placeholder needed)

- [ ] **Step 1: Add store interface members**, immediately after the existing
  `removeTreatmentBlock: (ownerID: string, blockID: string) => void;` line in `StoreValue`:

```ts
  doctorStatusForUser: (doctorID: string) => import("./backend").DoctorStatusResult;
  setDoctorStatus: (doctorID: string, patch: Partial<import("./types").DoctorStatus>) => void;
```

- [ ] **Step 2: Add the `DoctorStatusResult` type alias** in `backend.ts`, next to
  `doctorStatusForUser` (matches the existing `TreatmentAvailabilityResult` pattern used for
  `treatmentAvailabilityForOwner`):

```ts
export type DoctorStatusResult = ReturnType<typeof doctorStatusForUser>;
```

- [ ] **Step 3: Add the mirror function** in `mirror.ts`. The backend `setOnlineStatus`
  callable is already deployed and takes the full pair (not a patch), so this is the real body
  — no placeholder step needed:

```ts
// A doctor toggles online/always-accept status → the existing, already-deployed
// setOnlineStatus callable (writes users/{uid}.onlineStatus/alwaysAcceptAuth, merge:true).
export async function mirrorSetOnlineStatus(status: import("@/lib/demo/types").DoctorStatus): Promise<void> {
  await httpsCallable(functions(), "setOnlineStatus")({ online: status.online, alwaysAcceptAuth: status.alwaysAcceptAuth });
}
```

- [ ] **Step 4: Implement the store members** in the `value` object, immediately after the
  existing `removeTreatmentBlock: (ownerID, blockID) => { ... },` block. Compute the merged
  status eagerly (both for future-proofing consistency with the treatment-availability mutators
  and because the mirror needs the full post-merge pair, not just the patch):

```ts
      doctorStatusForUser: (doctorID) => backend.doctorStatusForUser(state, doctorID),
      setDoctorStatus: (doctorID, patch) => {
        const merged = backend.doctorStatusForUser(backend.setDoctorStatus(state, doctorID, patch), doctorID);
        applyAndMirror(
          (s) => backend.setDoctorStatus(s, doctorID, patch),
          (m) => m.mirrorSetOnlineStatus(merged),
        );
      },
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Run the full demo suite**

Run: `npx vitest run src/lib/demo`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/demo/store.tsx src/lib/demo/backend.ts src/lib/firebase/mirror.ts
git commit -m "feat(availability): store selector + mutator wired to setOnlineStatus"
```

---

### Task 4: Live hydrate — extend `readUserProfile`

**Files:**
- Modify: `src/lib/firebase/hydrate.ts` (`readUserProfile` ~line 101; both `hydrate()` call
  sites ~line 125 and ~line 207; `assembleState` ~line 31; `HydrationRows` ~line 12)

- [ ] **Step 1: Extend `readUserProfile`'s return type and body** to also read
  `onlineStatus`/`alwaysAcceptAuth` from the same `users/{uid}` doc it already fetches (zero
  extra reads):

```ts
async function readUserProfile(uid: string): Promise<{
  followUpSettings: { enabled: boolean; intervalDays: number } | null;
  bookingToken: string | null;
  doctorStatus: { online: boolean; alwaysAcceptAuth: boolean };
}> {
  const snap = await getDoc(doc(firestore(), "users", uid));
  if (!snap.exists()) return { followUpSettings: null, bookingToken: null, doctorStatus: { online: false, alwaysAcceptAuth: false } };
  const d = snap.data();
  const hasFU = d.followUpEnabled !== undefined || d.followUpIntervalDays !== undefined;
  const raw = d.followUpIntervalDays;
  const followUpSettings = hasFU
    ? { enabled: d.followUpEnabled === true, intervalDays: typeof raw === "number" && Number.isFinite(raw) ? Math.min(90, Math.max(1, Math.round(raw))) : 14 }
    : null;
  const bookingToken = typeof d.bookingToken === "string" ? d.bookingToken : null;
  const doctorStatus = { online: d.onlineStatus === "online", alwaysAcceptAuth: d.alwaysAcceptAuth === true };
  return { followUpSettings, bookingToken, doctorStatus };
}
```

- [ ] **Step 2: Add `doctorStatus` to `HydrationRows`**, immediately after the existing
  `bookingToken: string | null;` line (~line 24):

```ts
  doctorStatus: { online: boolean; alwaysAcceptAuth: boolean };
```

- [ ] **Step 3: Populate `doctorStatusByID` in `assembleState`**. Add, right after the existing
  `treatmentAvailabilityByOwner` block (before the final `return { patients, ... }` line), and
  add `doctorStatusByID` to that final returned object:

```ts
  const doctorStatusByID: DemoState["doctorStatusByID"] = { [rows.currentUserID]: rows.doctorStatus };
```

Then update the final return statement to include `doctorStatusByID` alongside the other
fields (it currently ends with `..., availabilityWindows, treatmentAvailabilityByOwner };` —
append `, doctorStatusByID` before the closing `};`).

- [ ] **Step 4: Pass `doctorStatus` at both `hydrate()` call sites.** In the super-admin branch
  (~line 144, right after `bookingToken: profile.bookingToken,`):

```ts
      doctorStatus: profile.doctorStatus,
```

And in the standard branch (~line 220-221, same pattern, right after
`bookingToken: profile.bookingToken,`):

```ts
    doctorStatus: profile.doctorStatus,
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Update the `hydrate.test.ts` fixture.** `src/lib/firebase/__tests__/hydrate.test.ts`
  constructs `const rows: HydrationRows = { ... }` as a literal (~line 4). Add
  `doctorStatus: { online: false, alwaysAcceptAuth: false },` immediately after the existing
  `currentUserID: "u-voss",` line (or anywhere in the object) so it satisfies the now-required
  `HydrationRows.doctorStatus` field.

- [ ] **Step 7: Run the full web test suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/firebase/hydrate.ts src/lib/firebase/__tests__/hydrate.test.ts
git commit -m "feat(availability): hydrate doctor online/always-accept status (zero extra reads)"
```

---

### Task 5: UI — status card on `DoctorAvailability`

**Files:**
- Modify: `src/app/app/availability/page.tsx` (`DoctorAvailability` component, ~line 44)

- [ ] **Step 1: Add the status card**, immediately after the opening `<>` and before the
  existing `<div className="mt-6 rounded-card border border-line bg-card p-5">` ("Publish a
  window" card), inside the `DoctorAvailability` function:

```tsx
  const status = store.doctorStatusForUser(me.user.id);
```

(add this line right after the existing `const windows = store.availabilityWindowsForDoctor(me.user.id);` line)

Then, as the first child inside the returned `<>...</>`, add:

```tsx
      <div className="mt-6 rounded-card border border-line bg-card p-5">
        <h2 className="font-display text-lg text-ink">Your status</h2>
        <div className="mt-3 flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" checked={status.online}
              onChange={(e) => store.setDoctorStatus(me.user.id, { online: e.target.checked })} />
            I&apos;m online now
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" checked={status.alwaysAcceptAuth}
              onChange={(e) => store.setDoctorStatus(me.user.id, { alwaysAcceptAuth: e.target.checked })} />
            Always accept authorisation requests
          </label>
        </div>
      </div>
```

This card renders before "Publish a window", matching the plan's design (status card above the
publish card).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: PASS (UI-only addition, no existing test targets this markup).

- [ ] **Step 4: Commit**

```bash
git add src/app/app/availability/page.tsx
git commit -m "feat(availability): online/always-accept status card on the Authorisation tab"
```

---

### Task 6: Manual verification + PR

- [ ] **Step 1: Start the dev server** (demo mode) and log in as Dr Elena Voss.

- [ ] **Step 2: Navigate to `/app/availability`** (Authorisation tab, the default). Confirm the
  new "Your status" card renders above "Publish a window" with both checkboxes unchecked
  (default state).

- [ ] **Step 3: Toggle "I'm online now" on**, confirm it stays checked after toggling the
  Treatment tab and back (state persists in the session). Toggle "Always accept authorisation
  requests" on independently — confirm toggling one does not affect the other.

- [ ] **Step 4: Toggle both off**, confirm both checkboxes clear independently.

- [ ] **Step 5: Confirm no console errors** during any of the above.

- [ ] **Step 6: Screenshot** the status card (both states — off and on) for the PR.

- [ ] **Step 7: Update the roadmap memory** — mark "doctor online/always-accept status
  (doctor-side)" shipped; note the nurse-facing ad-hoc-request UI remains deferred (needs a
  `listAvailableDoctorsTx` backend extension first).

- [ ] **Step 8: Push + open PR.** Title: `feat(availability): doctor online/always-accept
  status`. Body: summary, spec/plan links, test plan (the manual steps above + automated test
  counts), and an explicit note that this is backend-compatible with the already-deployed
  `setOnlineStatus` callable — no backend PR needed.

---

## Self-Review

**Spec coverage:**
- Independent online/offline + always-accept booleans → Task 1 (model), Task 2 (mutator merges
  a single-field patch without disturbing the other). ✓
- Persisted + read back live → Task 3 (mirror to the deployed `setOnlineStatus` callable), Task
  4 (hydrate reads `users/{uid}` fields, zero extra reads). ✓
- UI on `/app/availability` Authorisation tab, doctor-only → Task 5 (added inside
  `DoctorAvailability`, which is only rendered for `identity.role === "doctor"` per the existing
  page-level branch). ✓
- No validation/enforcement needed (plain booleans) → confirmed, no `BackendError` path added,
  matching the design's explicit call-out. ✓
- Doctor-side only, nurse ad-hoc-request UI deferred → not touched; explicitly noted in the PR
  body (Task 6, Step 8). ✓

**Placeholder scan:** No TBD/TODO; the Task 3 mirror body is real code (the callable already
exists and is deployed), not a stub.

**Type consistency:** `DoctorStatus` (Task 1) used identically in Task 2 (`doctorStatusForUser`/
`setDoctorStatus`), Task 3 (`DoctorStatusResult` alias, store signatures, `mirrorSetOnlineStatus`
parameter), Task 4 (`HydrationRows.doctorStatus`, `assembleState`), and Task 5 (`store.doctorStatusForUser`
return type consumed as `status.online`/`status.alwaysAcceptAuth`). `doctorStatusByID` key name
consistent across `types.ts`, `backend.ts`, `hydrate.ts`.

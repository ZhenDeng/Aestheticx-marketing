# Nurse-Side Ad-Hoc Authorisation Request Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A nurse can discover doctors who are online or always-accepting (even with no published slots) and send an immediate "request now" for an existing patient, completing the doctor-side online/always-accept status shipped in #38.

**Architecture:** A small backend query-union extension (`listAvailableDoctorsTx`) exposes online/always-accept doctors alongside slot-publishing doctors; the web mirrors this with a pure `doctorsWithAvailability` extension + a new pure `requestAdHocAuth` function (reusing the already-shipped `DoctorStatus` gate); the store and `BookConsult` UI wire it end to end. The already-deployed `requestAdHocAuth`/`adHocAuthTx` Cloud Function needs **no changes**.

**Tech Stack:** Firebase Cloud Functions (TypeScript, `australia-southeast1`), Next.js 16, TypeScript, Vitest (unit + Firestore-emulator integration).

**Spec:** `docs/superpowers/specs/2026-07-01-nurse-adhoc-auth-request-design.md`

**Repos:** Task 1 is in `~/Documents/AestheticX` (branch `feat/functions-nurse-adhoc-auth`, already checked out). Tasks 2–6 are in `~/Documents/Aestheticx-marketing` (branch `feat/nurse-adhoc-auth-request`, already checked out).

---

### Task 1: Backend — extend `listAvailableDoctorsTx` (AestheticX repo)

**Files:**
- Modify: `backend/functions/src/appointmentsFn.ts` (`listAvailableDoctorsTx`, ~line 92)
- Modify: `backend/functions/src/nurseAvailability.integration.ts` (existing tests + new ones)

Work from: `/Users/zhendeng/Documents/AestheticX`

- [ ] **Step 1: Update the two existing tests' expectations** in
  `nurseAvailability.integration.ts` — the return shape is widening from
  `{doctorId, doctorName}` to `{doctorId, doctorName, hasSlots, online, alwaysAcceptAuth}`.
  Change the `describe('listAvailableDoctorsTx', ...)` block's two `it`s to:

```ts
describe('listAvailableDoctorsTx', () => {
  it('lists distinct doctors with their display names, sorted by name', async () => {
    await db.collection('users').doc('u-voss').set({ businessName: 'Voss Clinic' })
    await db.collection('users').doc('u-amy').set({ name: 'Dr Amy' })
    await publish('u-voss', '2026-07-01', 540, 570, [540, 550, 560])
    await publish('u-voss', '2026-07-02', 600, 620, [600, 610]) // same doctor, another day
    await publish('u-amy', '2026-07-01', 540, 560, [540, 550])
    const doctors = await listAvailableDoctorsTx(db)
    expect(doctors).toEqual([
      { doctorId: 'u-amy', doctorName: 'Dr Amy', hasSlots: true, online: false, alwaysAcceptAuth: false },
      { doctorId: 'u-voss', doctorName: 'Voss Clinic', hasSlots: true, online: false, alwaysAcceptAuth: false },
    ])
  })
  it('falls back to a default name when the user doc is missing', async () => {
    await publish('u-ghost', '2026-07-01', 540, 560, [540, 550])
    const doctors = await listAvailableDoctorsTx(db)
    expect(doctors).toEqual([{ doctorId: 'u-ghost', doctorName: 'Doctor', hasSlots: true, online: false, alwaysAcceptAuth: false }])
  })

  it('includes an online doctor with no published slots', async () => {
    await db.collection('users').doc('u-online').set({ name: 'Dr Online', onlineStatus: 'online' })
    const doctors = await listAvailableDoctorsTx(db)
    expect(doctors).toEqual([{ doctorId: 'u-online', doctorName: 'Dr Online', hasSlots: false, online: true, alwaysAcceptAuth: false }])
  })

  it('includes an always-accepting doctor with no published slots', async () => {
    await db.collection('users').doc('u-always').set({ name: 'Dr Always', alwaysAcceptAuth: true })
    const doctors = await listAvailableDoctorsTx(db)
    expect(doctors).toEqual([{ doctorId: 'u-always', doctorName: 'Dr Always', hasSlots: false, online: false, alwaysAcceptAuth: true }])
  })

  it('merges all three criteria for one doctor into a single entry, no duplicates', async () => {
    await db.collection('users').doc('u-voss').set({ businessName: 'Voss Clinic', onlineStatus: 'online', alwaysAcceptAuth: true })
    await publish('u-voss', '2026-07-01', 540, 570, [540, 550, 560])
    const doctors = await listAvailableDoctorsTx(db)
    expect(doctors).toEqual([{ doctorId: 'u-voss', doctorName: 'Voss Clinic', hasSlots: true, online: true, alwaysAcceptAuth: true }])
  })

  it('excludes a doctor satisfying none of the three criteria', async () => {
    await db.collection('users').doc('u-idle').set({ name: 'Dr Idle' })
    const doctors = await listAvailableDoctorsTx(db)
    expect(doctors).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend/functions && npx firebase emulators:exec --only firestore 'npx vitest run --config vitest.integration.config.ts src/nurseAvailability.integration.ts'`
Expected: FAIL — actual return objects lack `hasSlots`/`online`/`alwaysAcceptAuth`.

- [ ] **Step 3: Implement the extension.** Replace `listAvailableDoctorsTx` in
  `appointmentsFn.ts`:

```ts
/** Distinct doctors available right now: published slots, online, or always-accepting (testable). */
export async function listAvailableDoctorsTx(database: Firestore): Promise<{
  doctorId: string; doctorName: string; hasSlots: boolean; online: boolean; alwaysAcceptAuth: boolean;
}[]> {
  const [pubs, onlineDocs, alwaysDocs] = await Promise.all([
    database.collection('slotPublications').get(),
    database.collection('users').where('onlineStatus', '==', 'online').get(),
    database.collection('users').where('alwaysAcceptAuth', '==', true).get(),
  ])
  const slotDoctorIds = new Set(pubs.docs.map((d) => d.get('doctorId') as string))
  const onlineIds = new Set(onlineDocs.docs.map((d) => d.id))
  const alwaysIds = new Set(alwaysDocs.docs.map((d) => d.id))
  const allIds = new Set([...slotDoctorIds, ...onlineIds, ...alwaysIds])
  const named = await Promise.all([...allIds].map(async (doctorId) => {
    const u = await database.collection('users').doc(doctorId).get()
    const doctorName = (u.get('businessName') as string | undefined) ?? (u.get('name') as string | undefined) ?? 'Doctor'
    return {
      doctorId, doctorName,
      hasSlots: slotDoctorIds.has(doctorId), online: onlineIds.has(doctorId), alwaysAcceptAuth: alwaysIds.has(doctorId),
    }
  }))
  return named.sort((a, b) => a.doctorName.localeCompare(b.doctorName))
}
```

(The callable wrapper `listAvailableDoctors` at ~line 104 needs no changes — it already just
returns `{ doctors: await listAvailableDoctorsTx(db()) }`.)

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend/functions && npx firebase emulators:exec --only firestore 'npx vitest run --config vitest.integration.config.ts src/nurseAvailability.integration.ts'`
Expected: PASS, all 7 tests (2 updated + 5 new — note "5 new" includes 4 new `it`s written in
Step 1 plus the pre-existing `openSlotsFor` describe block, which is untouched and should still
pass).

- [ ] **Step 5: Run the full unit suite for regressions**

Run: `cd backend/functions && npx vitest run`
Expected: PASS, no regressions (this function has no other callers in the unit-test suite).

- [ ] **Step 6: Typecheck**

Run: `cd backend/functions && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/functions/src/appointmentsFn.ts backend/functions/src/nurseAvailability.integration.ts
git commit -m "feat(functions): expose online/always-accept doctors in listAvailableDoctorsTx"
```

---

### Task 2: Web demo — extend `doctorsWithAvailability` (TDD)

**Files:**
- Modify: `src/lib/demo/backend.ts` (`doctorsWithAvailability`, ~line 505)
- Modify: `src/lib/demo/__tests__/auth-slots.test.ts` (existing test + new ones)

Work from: `/Users/zhendeng/Documents/Aestheticx-marketing`

- [ ] **Step 1: Update the existing test's expectation** in `auth-slots.test.ts` — find the
  `describe("availabilityWindowsForDoctor / doctorsWithAvailability", ...)` block's
  `doctorsWithAvailability` assertion (~line 46) and change it to:

```ts
    expect(doctorsWithAvailability(s)).toEqual([
      { doctorID: "u-voss", doctorName: "Dr Elena Voss", hasSlots: true, online: false, alwaysAcceptAuth: false },
    ]);
```

- [ ] **Step 2: Append new tests** to the same describe block:

```ts
  it("includes an online-only doctor with no published windows", () => {
    const s = setDoctorStatus(emptyState(), "u-online", { online: true });
    expect(doctorsWithAvailability(s)).toEqual([
      { doctorID: "u-online", doctorName: "", hasSlots: false, online: true, alwaysAcceptAuth: false },
    ]);
  });

  it("includes an always-accept-only doctor with no published windows", () => {
    const s = setDoctorStatus(emptyState(), "u-always", { alwaysAcceptAuth: true });
    expect(doctorsWithAvailability(s)).toEqual([
      { doctorID: "u-always", doctorName: "", hasSlots: false, online: false, alwaysAcceptAuth: true },
    ]);
  });

  it("merges all criteria for one doctor into a single entry", () => {
    let s = publishAvailability(emptyState(), { doctorID: "u-voss", dateISO: "2026-07-01", startMinute: 540, endMinute: 570 }, voss).state;
    s = setDoctorStatus(s, "u-voss", { online: true, alwaysAcceptAuth: true });
    const result = doctorsWithAvailability(s);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ doctorID: "u-voss", hasSlots: true, online: true, alwaysAcceptAuth: true });
  });

  it("excludes a doctor satisfying no criteria", () => {
    expect(doctorsWithAvailability(emptyState())).toEqual([]);
  });
```

The file already has (top of file, ~line 1-10): a `voss: Identity` fixture (`{ user: { id: "u-voss", name: "Dr Elena Voss" }, role: "doctor", context: { kind: "independent" } }`) and imports `emptyState, slotsForWindow, publishAvailability, availabilityWindowsForDoctor, doctorsWithAvailability, isSlotTaken, openSlotsForDoctorOnDay, withdrawAvailability, bookAuthSlot, BackendError` from `@/lib/demo/backend`. Add `setDoctorStatus` to that import list (it is not currently imported).

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/lib/demo/__tests__/auth-slots.test.ts`
Expected: FAIL — return shape lacks the three new flags; new tests fail (function not
returning them).

- [ ] **Step 4: Implement.** Replace `doctorsWithAvailability` in `backend.ts`:

```ts
export function doctorsWithAvailability(state: DemoState): {
  doctorID: string; doctorName: string; hasSlots: boolean; online: boolean; alwaysAcceptAuth: boolean;
}[] {
  const names = new Map<string, string>();
  const slotDoctorIDs = new Set<string>();
  for (const w of Object.values(state.availabilityWindows)) {
    if (!names.has(w.doctorID)) names.set(w.doctorID, w.doctorName);
    slotDoctorIDs.add(w.doctorID);
  }
  const statusDoctorIDs = Object.entries(state.doctorStatusByID)
    .filter(([, s]) => s.online || s.alwaysAcceptAuth)
    .map(([id]) => id);
  for (const id of statusDoctorIDs) if (!names.has(id)) names.set(id, "");
  const allIDs = new Set([...slotDoctorIDs, ...statusDoctorIDs]);
  return [...allIDs].map((doctorID) => {
    const status = doctorStatusForUser(state, doctorID);
    return {
      doctorID, doctorName: names.get(doctorID) ?? "",
      hasSlots: slotDoctorIDs.has(doctorID), online: status.online, alwaysAcceptAuth: status.alwaysAcceptAuth,
    };
  });
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/lib/demo/__tests__/auth-slots.test.ts`
Expected: PASS, all cases.

- [ ] **Step 6: Run the full demo suite for regressions**

Run: `npx vitest run src/lib/demo`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/demo/backend.ts src/lib/demo/__tests__/auth-slots.test.ts
git commit -m "feat(availability): union online/always-accept doctors into doctorsWithAvailability"
```

---

### Task 3: Web demo — new `requestAdHocAuth` pure function (TDD)

**Files:**
- Modify: `src/lib/demo/backend.ts` (new function, near `bookAuthSlot`, ~line 559)
- Test: `src/lib/demo/__tests__/adhoc-auth.test.ts` (new)

- [ ] **Step 1: Write the failing test** — create
  `src/lib/demo/__tests__/adhoc-auth.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { requestAdHocAuth, setDoctorStatus, emptyState, BackendError } from "@/lib/demo/backend";
import type { Identity } from "@/lib/demo/types";

const me: Identity = {
  user: { id: "u-nurse", name: "Nurse N" },
  role: "nurse",
  context: { kind: "independent" },
} as unknown as Identity;

describe("requestAdHocAuth", () => {
  it("accepts when the doctor is online (even if not always-accepting)", () => {
    const s = setDoctorStatus(emptyState(), "u-voss", { online: true });
    const { appt } = requestAdHocAuth(s, {
      doctorID: "u-voss", dateISO: "2026-07-01", atMinute: 600, patientID: "p1", patientName: "Pat One", identity: me,
    });
    expect(appt).toMatchObject({
      type: "authSlot", ownerID: "u-voss", dateISO: "2026-07-01",
      startMinute: 600, endMinute: 610, status: "confirmed", patientID: "p1", patientName: "Pat One",
    });
  });

  it("accepts when the doctor is always-accepting (even while offline)", () => {
    const s = setDoctorStatus(emptyState(), "u-voss", { alwaysAcceptAuth: true });
    const { appt } = requestAdHocAuth(s, {
      doctorID: "u-voss", dateISO: "2026-07-01", atMinute: 600, patientID: "p1", patientName: "Pat One", identity: me,
    });
    expect(appt.status).toBe("confirmed");
  });

  it("rejects when the doctor is neither online nor always-accepting", () => {
    expect(() => requestAdHocAuth(emptyState(), {
      doctorID: "u-voss", dateISO: "2026-07-01", atMinute: 600, patientID: "p1", patientName: "Pat One", identity: me,
    })).toThrow(BackendError);
  });

  it("stamps the appointment note with the requesting nurse's name", () => {
    const s = setDoctorStatus(emptyState(), "u-voss", { online: true });
    const { appt } = requestAdHocAuth(s, {
      doctorID: "u-voss", dateISO: "2026-07-01", atMinute: 600, patientID: "p1", patientName: "Pat One", identity: me,
    });
    expect(appt.appointmentNote).toBe("Auth request · Nurse N");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/demo/__tests__/adhoc-auth.test.ts`
Expected: FAIL — `requestAdHocAuth` not exported.

- [ ] **Step 3: Implement**, placed near `bookAuthSlot` in `backend.ts`:

```ts
export interface RequestAdHocAuthInput {
  doctorID: string; dateISO: string; atMinute: number;
  patientID: string; patientName: string; identity: Identity;
}

// Ad-hoc (no published slot) request to an online/always-accepting doctor. No double-book
// check — an ad-hoc request targets the current moment, matching the deployed adHocAuthTx,
// which also has none. Mirrors bookAuthSlot's appointment shape (10-minute, confirmed).
export function requestAdHocAuth(state: DemoState, input: RequestAdHocAuthInput): { state: DemoState; appt: Appointment } {
  const status = doctorStatusForUser(state, input.doctorID);
  if (!status.online && !status.alwaysAcceptAuth) throw new BackendError("notAccepting");
  const appt: Appointment = {
    id: makeID("appt"), type: "authSlot", ownerID: input.doctorID, dateISO: input.dateISO,
    startMinute: input.atMinute, endMinute: input.atMinute + SLOT_MINUTES, status: "confirmed",
    patientID: input.patientID, patientName: input.patientName,
    appointmentNote: `Auth request · ${input.identity.user.name}`,
  };
  return { state: { ...state, appointments: { ...state.appointments, [appt.id]: appt } }, appt };
}
```

IMPORTANT: verify the real `Identity` shape (`user.name` vs `user.id`/`user.givenName` etc.) by
reading `types.ts` — the `bookAuthSlot` function directly above already does
`` `Auth request · ${input.identity.user.name}` ``, so match that exact expression.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/demo/__tests__/adhoc-auth.test.ts`
Expected: PASS, all 4 cases.

- [ ] **Step 5: Run the full demo suite**

Run: `npx vitest run src/lib/demo`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/demo/backend.ts src/lib/demo/__tests__/adhoc-auth.test.ts
git commit -m "feat(availability): pure requestAdHocAuth (existing-patient, right-now only)"
```

---

### Task 4: Store + mirror wiring

**Files:**
- Modify: `src/lib/demo/store.tsx` (`StoreValue` interface ~line 56; `listAvailableDoctors`
  implementation ~line 339; new `requestAdHocAuth` member)
- Modify: `src/lib/firebase/mirror.ts` (`mirrorListAvailableDoctors` ~line 154; new
  `mirrorRequestAdHocAuth`)

- [ ] **Step 1: Widen the `listAvailableDoctors` return type** in `StoreValue`
  (`store.tsx`, ~line 56):

```ts
  listAvailableDoctors: () => Promise<{ doctorID: string; doctorName: string; hasSlots: boolean; online: boolean; alwaysAcceptAuth: boolean }[]>;
```

- [ ] **Step 2: Add `requestAdHocAuth` to `StoreValue`**, immediately after the existing
  `bookAuthSlot: (input: import("./backend").BookAuthSlotInput) => Promise<void>;` line:

```ts
  requestAdHocAuth: (input: import("./backend").RequestAdHocAuthInput) => Promise<void>;
```

- [ ] **Step 3: Update `mirrorListAvailableDoctors`** in `mirror.ts` to parse the widened
  response:

```ts
export async function mirrorListAvailableDoctors(): Promise<{ doctorID: string; doctorName: string; hasSlots: boolean; online: boolean; alwaysAcceptAuth: boolean }[]> {
  const res = await httpsCallable(functions(), "listAvailableDoctors")({});
  const raw = (res.data as { doctors?: unknown }).doctors;
  const doctors = Array.isArray(raw) ? (raw as { doctorId: string; doctorName: string; hasSlots: boolean; online: boolean; alwaysAcceptAuth: boolean }[]) : [];
  return doctors.map((d) => ({ doctorID: d.doctorId, doctorName: d.doctorName, hasSlots: d.hasSlots, online: d.online, alwaysAcceptAuth: d.alwaysAcceptAuth }));
}
```

- [ ] **Step 4: Add `mirrorRequestAdHocAuth`** in `mirror.ts`, near `mirrorBookAuthSlot`:

```ts
export async function mirrorRequestAdHocAuth(p: { doctorID: string; dateISO: string; atMinute: number; patientID: string; counterpartyName: string }): Promise<void> {
  await httpsCallable(functions(), "requestAdHocAuth")({
    doctorId: p.doctorID, dateISO: p.dateISO, atMinute: p.atMinute,
    patientId: p.patientID, counterpartyName: p.counterpartyName,
  });
}
```

- [ ] **Step 5: Implement `requestAdHocAuth` in the store's `value` object** (`store.tsx`),
  immediately after the existing `bookAuthSlot: async (input) => { ... },` block. Follow the
  exact demo/live-branch shape `bookAuthSlot` already uses:

```ts
      requestAdHocAuth: async (input) => {
        if (!live) {
          // Demo: validate against local doctor status (throws notAccepting) + mint the appointment.
          const { appt } = backend.requestAdHocAuth(state, input);
          setState((s) => ({ ...s, appointments: { ...s.appointments, [appt.id]: appt } }));
          return;
        }
        // Live: the server is authoritative (validates online/always-accept, mints the appointment).
        const m = await import("@/lib/firebase/mirror");
        await m.mirrorRequestAdHocAuth({
          doctorID: input.doctorID, dateISO: input.dateISO, atMinute: input.atMinute,
          patientID: input.patientID, counterpartyName: input.identity.user.name,
        });
        setRefreshTick((t) => t + 1);
      },
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Run the full demo suite**

Run: `npx vitest run src/lib/demo`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/demo/store.tsx src/lib/firebase/mirror.ts
git commit -m "feat(availability): store + mirror wiring for requestAdHocAuth"
```

---

### Task 5: UI — "Request now" in `BookConsult`

**Files:**
- Modify: `src/app/app/availability/page.tsx` (`BookConsult` component, ~line 209)

- [ ] **Step 1: Widen the `doctors` state type** — change:

```ts
  const [doctors, setDoctors] = useState<{ doctorID: string; doctorName: string }[]>([]);
```

to:

```ts
  const [doctors, setDoctors] = useState<{ doctorID: string; doctorName: string; hasSlots: boolean; online: boolean; alwaysAcceptAuth: boolean }[]>([]);
```

- [ ] **Step 2: Add ad-hoc-request local state**, immediately after the existing
  `const [slotReload, setSlotReload] = useState(0);` line:

```ts
  const [adHocQuery, setAdHocQuery] = useState("");
  const [requesting, setRequesting] = useState(false);
```

- [ ] **Step 3: Compute the selected doctor's flags**, immediately after the existing
  `const effectiveDoctorID = doctorID ?? doctors[0]?.doctorID ?? null;` line:

```ts
  const effectiveDoctor = doctors.find((d) => d.doctorID === effectiveDoctorID) ?? null;
  const canRequestNow = !!effectiveDoctor && (effectiveDoctor.online || effectiveDoctor.alwaysAcceptAuth);
```

- [ ] **Step 4: Add a "now, floored to 10 minutes" helper**, near the top of the file
  alongside `timeLabel`/`minutesFromTime`:

```ts
function nowFlooredTo10(epochMs: number): number {
  const d = new Date(epochMs);
  return Math.floor((d.getHours() * 60 + d.getMinutes()) / 10) * 10;
}
```

- [ ] **Step 5: Add the ad-hoc request handler**, immediately after the existing `book`
  function:

```ts
  const adHocMatches = adHocQuery.trim() ? store.searchPatients(adHocQuery, me).slice(0, 5) : [];

  async function requestNow(patientID: string, patientName: string) {
    if (!effectiveDoctorID) return;
    setError(null);
    setRequesting(true);
    try {
      await store.requestAdHocAuth({
        doctorID: effectiveDoctorID, dateISO: isoDay(store.now), atMinute: nowFlooredTo10(store.now),
        patientID, patientName, identity: me,
      });
      setBooked(`Sent an ad-hoc request for ${patientName}.`);
      setAdHocQuery("");
    } catch (e) {
      setError(e instanceof BackendError && e.message === "notAccepting"
        ? "That doctor isn't accepting requests right now — pick another."
        : "Could not send the request. Please try again.");
    } finally {
      setRequesting(false);
    }
  }
```

- [ ] **Step 6: Render the "Request now" section.** Insert it immediately after the existing
  "Open slots" `<div>` block and before the `{slot !== null && ( ... )}` block:

```tsx
      {canRequestNow && (
        <div className="rounded-inner border border-line bg-card p-4">
          <p className="text-sm text-ink">Request an ad-hoc consult now for…</p>
          <input value={adHocQuery} onChange={(e) => setAdHocQuery(e.target.value)} placeholder="Search patient…"
            className="mt-2 w-full rounded-inner border border-line px-3 py-2 text-sm text-ink outline-none focus:border-tint" />
          <ul className="mt-1 flex flex-col gap-1">
            {adHocMatches.map((p) => (
              <li key={p.id}>
                <button disabled={requesting} onClick={() => requestNow(p.id, `${p.givenName} ${p.lastName}`)}
                  className="w-full rounded-inner border border-line px-3 py-1.5 text-left text-sm text-ink hover:border-tint disabled:opacity-50">
                  {p.givenName} {p.lastName}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Run the full test suite**

Run: `npx vitest run`
Expected: PASS (UI-only addition; no existing test targets this markup).

- [ ] **Step 9: Commit**

```bash
git add src/app/app/availability/page.tsx
git commit -m "feat(availability): Request-now UI for online/always-accept doctors"
```

---

### Task 6: Manual verification + PRs

- [ ] **Step 1: Start the dev server** (demo mode). Log in as **Sarah Chen** (nurse), open
  `/app/availability` (Authorisation tab, `BookConsult`).

- [ ] **Step 2: Verify discovery.** Log in as **Dr Elena Voss** in a second session (or the same
  session, switching identity), toggle "I'm online now" on `/app/availability`'s Authorisation
  tab (from PR #38). Switch back to Sarah Chen — confirm Dr Voss now appears in the doctor
  dropdown even on a date with no published slots, and a "Request an ad-hoc consult now for…"
  section appears.

- [ ] **Step 3: Send a request.** Search a patient, click their name — confirm a success message
  appears and (if you navigate to `/app/calendar` as Dr Voss) a new confirmed authorisation
  appointment now exists at the current time, rounded down to the nearest 10 minutes.

- [ ] **Step 4: Toggle Dr Voss's status back off** (both online and always-accept) — confirm the
  "Request now" section disappears from Sarah's view (Dr Voss may still appear in the dropdown
  if she has published slots; otherwise she should drop off the list entirely on next fetch).

- [ ] **Step 5: Confirm no console errors** during any of the above.

- [ ] **Step 6: Screenshot** the "Request now" section and a successful request for the PR.

- [ ] **Step 7: Update the roadmap memory** — mark the nurse-side ad-hoc-request flow shipped;
  note this completes the doctor-status feature end to end (no more "shipped but inert" toggle).

- [ ] **Step 8: Push + open two PRs:**
  - Backend (`~/Documents/AestheticX`, branch `feat/functions-nurse-adhoc-auth`): title
    `feat(functions): expose online/always-accept doctors in listAvailableDoctorsTx`.
  - Web (`~/Documents/Aestheticx-marketing`, branch `feat/nurse-adhoc-auth-request`): title
    `feat(availability): nurse-side ad-hoc authorisation request`. Note in the body that it
    depends on the backend PR's `listAvailableDoctorsTx` change to fully light up live (demo
    mode works regardless).

---

## Self-Review

**Spec coverage:**
- Backend query union + flags → Task 1. ✓
- Demo parity for `doctorsWithAvailability` → Task 2. ✓
- Pure `requestAdHocAuth` gated on `DoctorStatus`, existing-patient only, right-now only →
  Task 3 (no dateISO/atMinute picker exposed anywhere — Task 5's UI always computes "now"). ✓
- Store/mirror wiring, demo/live branch matching `bookAuthSlot`'s exact shape → Task 4. ✓
- UI: doctor list includes online/always-accept-only doctors, "Request now" shown whenever
  `online || alwaysAcceptAuth`, alongside (not replacing) "Open slots" → Task 5. ✓
- Out-of-scope items (lead requests, scheduled ad-hoc, doctor-side notification) — untouched,
  no task references them. ✓

**Placeholder scan:** No TBD/TODO. Every code step is complete, runnable code.

**Type consistency:** The `{doctorID, doctorName, hasSlots, online, alwaysAcceptAuth}` shape is
identical across Task 1 (backend, `doctorId`/camelCase-on-the-wire), Task 2
(`doctorsWithAvailability`), Task 4 (`mirrorListAvailableDoctors` translates `doctorId`→
`doctorID`), and Task 5 (`doctors` state, `effectiveDoctor`). `RequestAdHocAuthInput` defined in
Task 3, consumed identically in Task 4 (`StoreValue`, store impl) and Task 5 (`requestNow`).
`BackendError("notAccepting")` consistent between Task 3 (throw) and Task 5 (catch/map to
message).

# Treatment Availability Windows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a clinician configure a treatment working schedule (weekday open/closed + hours) and ad-hoc time blocks, and reject any treatment booking/reschedule that falls outside a window or over a block — across the New-appointment form and calendar drag/resize.

**Architecture:** A pure per-owner `TreatmentAvailability` model in `DemoState`, pure guard `isTimeAvailableForTreatment`, enforced inside `bookTreatmentAppointment` + `rescheduleAppointment` (treatment-type only). The store computes these mutations **eagerly** so a `BackendError` throws synchronously and callers can catch it (drag handlers snap back with a friendly banner). A Treatment tab on `/app/availability` edits the config. Live parity is scaffolded (mapper/hydrate/mirror stubs); Cloud Functions deferred.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind v4, Vitest, in-memory demo backend + Firebase live mirror.

**Spec:** `docs/superpowers/specs/2026-07-01-treatment-availability-windows-design.md`

**Convention note:** Reuse the existing `isoWeekday(dateISO)` in `calendar.ts` which returns **0=Mon … 6=Sun** (export it). The `days` array is indexed Mon-first to match. This supersedes the spec's "0=Sun" wording — behaviour is identical, index base differs.

---

### Task 1: Types + empty state

**Files:**
- Modify: `src/lib/demo/types.ts` (after `AvailabilityWindow`, ~line 195; `DemoState`, ~line 239)
- Modify: `src/lib/demo/backend.ts` (`emptyState`, ~line 53)

- [ ] **Step 1: Add the model interfaces to `types.ts`** after the `AvailabilityWindow` block:

```ts
// A clinician's treatment working schedule (feedback: treatment availability windows).
// `days` is indexed Mon-first (0=Mon … 6=Sun) to match calendar.ts isoWeekday. A treatment
// appointment is bookable only on an open day, within [openMinute, closeMinute), and not
// overlapping a block. Distinct from AvailabilityWindow (authorisation teleconsult slots).
export interface DaySchedule {
  open: boolean;
  openMinute: number;  // minutes from midnight, e.g. 540 = 09:00
  closeMinute: number; // e.g. 1020 = 17:00
}
export interface TreatmentBlock {
  id: string;
  dateISO: string; // yyyy-mm-dd
  startMinute: number;
  endMinute: number;
}
export interface TreatmentAvailability {
  ownerID: string;
  days: DaySchedule[]; // length 7, index = isoWeekday (0=Mon … 6=Sun)
  blocks: TreatmentBlock[];
}
```

- [ ] **Step 2: Add the collection to `DemoState`** (after the `availabilityWindows` line):

```ts
  availabilityWindows: Record<string, AvailabilityWindow>;
  treatmentAvailabilityByOwner: Record<string, TreatmentAvailability>;
```

- [ ] **Step 3: Add it to `emptyState`** in `backend.ts` (after `availabilityWindows: {},`):

```ts
    availabilityWindows: {},
    treatmentAvailabilityByOwner: {},
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no references yet beyond the new field; `emptyState` satisfies `DemoState`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/demo/types.ts src/lib/demo/backend.ts
git commit -m "feat(scheduling): treatment-availability model + empty state"
```

---

### Task 2: Weekday helper + availability query (pure, TDD)

**Files:**
- Modify: `src/lib/demo/calendar.ts` (export `isoWeekday`, ~line 13)
- Modify: `src/lib/demo/backend.ts` (new functions near the auth-slot section, ~line 470)
- Test: `src/lib/demo/__tests__/treatment-availability.test.ts` (new)

- [ ] **Step 1: Write the failing test** — create `src/lib/demo/__tests__/treatment-availability.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isoWeekday } from "@/lib/demo/calendar";
import {
  defaultTreatmentAvailability,
  treatmentAvailabilityForOwner,
  isTimeAvailableForTreatment,
  emptyState,
} from "@/lib/demo/backend";

describe("isoWeekday", () => {
  it("is 0 for Monday and 6 for Sunday", () => {
    expect(isoWeekday("2026-06-29")).toBe(0); // Monday
    expect(isoWeekday("2026-07-05")).toBe(6); // Sunday
  });
});

describe("defaultTreatmentAvailability", () => {
  it("opens Mon–Fri 09:00–17:00 and closes the weekend", () => {
    const cfg = defaultTreatmentAvailability("u-voss");
    expect(cfg.ownerID).toBe("u-voss");
    expect(cfg.days).toHaveLength(7);
    expect(cfg.days[0]).toEqual({ open: true, openMinute: 540, closeMinute: 1020 }); // Mon
    expect(cfg.days[4].open).toBe(true);   // Fri
    expect(cfg.days[5].open).toBe(false);  // Sat
    expect(cfg.days[6].open).toBe(false);  // Sun
    expect(cfg.blocks).toEqual([]);
  });
});

describe("treatmentAvailabilityForOwner", () => {
  it("returns the default when the owner has none", () => {
    expect(treatmentAvailabilityForOwner(emptyState(), "u-x").days[5].open).toBe(false);
  });
  it("returns the stored config when present", () => {
    const stored = { ...defaultTreatmentAvailability("u-x") };
    stored.days = stored.days.map((d) => ({ ...d, open: true }));
    const s = { ...emptyState(), treatmentAvailabilityByOwner: { "u-x": stored } };
    expect(treatmentAvailabilityForOwner(s, "u-x").days[5].open).toBe(true);
  });
});

describe("isTimeAvailableForTreatment", () => {
  const cfg = defaultTreatmentAvailability("u-x");
  it("accepts a valid weekday time within hours", () => {
    expect(isTimeAvailableForTreatment(cfg, "2026-07-01", 600, 630)).toBe(true); // Wed 10:00
  });
  it("rejects a closed weekday", () => {
    expect(isTimeAvailableForTreatment(cfg, "2026-07-05", 600, 630)).toBe(false); // Sunday
  });
  it("rejects before open / after close", () => {
    expect(isTimeAvailableForTreatment(cfg, "2026-07-01", 480, 540)).toBe(false); // 08:00 start
    expect(isTimeAvailableForTreatment(cfg, "2026-07-01", 1000, 1040)).toBe(false); // ends 17:20
  });
  it("rejects a time overlapping a block, but not a block on another date", () => {
    const blocked = { ...cfg, blocks: [{ id: "b1", dateISO: "2026-07-01", startMinute: 780, endMinute: 840 }] };
    expect(isTimeAvailableForTreatment(blocked, "2026-07-01", 800, 830)).toBe(false); // 13:20 inside block
    expect(isTimeAvailableForTreatment(blocked, "2026-07-02", 800, 830)).toBe(true);  // block is on the 1st
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/demo/__tests__/treatment-availability.test.ts`
Expected: FAIL — `isoWeekday`, `defaultTreatmentAvailability`, `treatmentAvailabilityForOwner`, `isTimeAvailableForTreatment` are not exported.

- [ ] **Step 3: Export `isoWeekday`** in `calendar.ts` — change its declaration from `function isoWeekday` to:

```ts
// 0 = Monday … 6 = Sunday
export function isoWeekday(dateISO: string): number {
  return (new Date(toUTC(dateISO)).getUTCDay() + 6) % 7;
}
```

- [ ] **Step 4: Add the query functions** to `backend.ts` (near the auth-slot section, after `emptyState` is defined — put them by the other treatment helpers, ~line 470). Add the import for the new types at the top import block (`DaySchedule`, `TreatmentAvailability` from `./types`):

```ts
// --- Treatment availability windows ---

export function defaultTreatmentAvailability(ownerID: string): TreatmentAvailability {
  const open: DaySchedule = { open: true, openMinute: 540, closeMinute: 1020 };   // 09:00–17:00
  const closed: DaySchedule = { open: false, openMinute: 540, closeMinute: 1020 };
  return { ownerID, days: [open, open, open, open, open, closed, closed], blocks: [] }; // Mon–Fri open
}

export function treatmentAvailabilityForOwner(state: DemoState, ownerID: string): TreatmentAvailability {
  return state.treatmentAvailabilityByOwner[ownerID] ?? defaultTreatmentAvailability(ownerID);
}

export function isTimeAvailableForTreatment(
  config: TreatmentAvailability, dateISO: string, startMinute: number, endMinute: number,
): boolean {
  const day = config.days[isoWeekday(dateISO)];
  if (!day || !day.open) return false;
  if (startMinute < day.openMinute || endMinute > day.closeMinute) return false;
  const overlapsBlock = config.blocks.some(
    (b) => b.dateISO === dateISO && startMinute < b.endMinute && b.startMinute < endMinute,
  );
  return !overlapsBlock;
}
```

Add `isoWeekday` to the existing `calendar` import in `backend.ts` (or import it): check the top of `backend.ts` for how `calendar.ts` helpers are imported and add `isoWeekday` there. If `backend.ts` does not currently import from `./calendar`, add:

```ts
import { isoWeekday } from "./calendar";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/demo/__tests__/treatment-availability.test.ts`
Expected: PASS (all describe blocks so far).

- [ ] **Step 6: Guard against circular import** — confirm `calendar.ts` does not import from `backend.ts` (it doesn't today; it's leaf date math). Run full typecheck:

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/demo/calendar.ts src/lib/demo/backend.ts src/lib/demo/__tests__/treatment-availability.test.ts
git commit -m "feat(scheduling): treatment-availability query + isoWeekday export"
```

---

### Task 3: Config mutators (pure, TDD)

**Files:**
- Modify: `src/lib/demo/backend.ts` (after the query functions from Task 2)
- Test: `src/lib/demo/__tests__/treatment-availability.test.ts` (append)

- [ ] **Step 1: Append failing tests**:

```ts
import {
  setTreatmentDaySchedule,
  addTreatmentBlock,
  removeTreatmentBlock,
  BackendError,
} from "@/lib/demo/backend";

describe("treatment-availability mutators", () => {
  it("setTreatmentDaySchedule patches one day, seeding from the default first", () => {
    const s = setTreatmentDaySchedule(emptyState(), "u-x", 6, { open: true, openMinute: 600, closeMinute: 720 });
    const cfg = treatmentAvailabilityForOwner(s, "u-x");
    expect(cfg.days[6]).toEqual({ open: true, openMinute: 600, closeMinute: 720 }); // Sunday now open
    expect(cfg.days[0].open).toBe(true); // Monday still open (default preserved)
  });

  it("addTreatmentBlock mints an id and appends; removeTreatmentBlock deletes it", () => {
    const added = addTreatmentBlock(emptyState(), "u-x", { dateISO: "2026-07-01", startMinute: 780, endMinute: 840 });
    expect(added.block.id).toBeTruthy();
    expect(treatmentAvailabilityForOwner(added.state, "u-x").blocks).toHaveLength(1);
    const removed = removeTreatmentBlock(added.state, "u-x", added.block.id);
    expect(treatmentAvailabilityForOwner(removed, "u-x").blocks).toHaveLength(0);
  });

  it("addTreatmentBlock rejects end <= start", () => {
    expect(() => addTreatmentBlock(emptyState(), "u-x", { dateISO: "2026-07-01", startMinute: 840, endMinute: 780 }))
      .toThrow(BackendError);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/demo/__tests__/treatment-availability.test.ts`
Expected: FAIL — mutators not exported.

- [ ] **Step 3: Implement the mutators** in `backend.ts` (after the Task 2 functions):

```ts
export function setTreatmentDaySchedule(
  state: DemoState, ownerID: string, weekday: number, patch: Partial<DaySchedule>,
): DemoState {
  const config = treatmentAvailabilityForOwner(state, ownerID);
  const days = config.days.map((d, i) => (i === weekday ? { ...d, ...patch } : d));
  const next = { ...config, ownerID, days };
  return { ...state, treatmentAvailabilityByOwner: { ...state.treatmentAvailabilityByOwner, [ownerID]: next } };
}

export function addTreatmentBlock(
  state: DemoState, ownerID: string, input: { dateISO: string; startMinute: number; endMinute: number },
): { state: DemoState; block: TreatmentBlock } {
  if (input.endMinute <= input.startMinute) throw new BackendError("validationFailed");
  const config = treatmentAvailabilityForOwner(state, ownerID);
  const block: TreatmentBlock = { id: makeID("block"), ...input };
  const next = { ...config, ownerID, blocks: [...config.blocks, block] };
  return { state: { ...state, treatmentAvailabilityByOwner: { ...state.treatmentAvailabilityByOwner, [ownerID]: next } }, block };
}

export function removeTreatmentBlock(state: DemoState, ownerID: string, blockID: string): DemoState {
  const config = treatmentAvailabilityForOwner(state, ownerID);
  const next = { ...config, ownerID, blocks: config.blocks.filter((b) => b.id !== blockID) };
  return { ...state, treatmentAvailabilityByOwner: { ...state.treatmentAvailabilityByOwner, [ownerID]: next } };
}
```

Add `TreatmentBlock` to the `./types` import in `backend.ts`.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/demo/__tests__/treatment-availability.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/demo/backend.ts src/lib/demo/__tests__/treatment-availability.test.ts
git commit -m "feat(scheduling): treatment-availability config mutators"
```

---

### Task 4: Enforcement in book + reschedule (pure, TDD)

**Files:**
- Modify: `src/lib/demo/backend.ts` (`bookTreatmentAppointment` ~line 424, `rescheduleAppointment` ~line 440)
- Test: `src/lib/demo/__tests__/treatment-availability.test.ts` (append)

- [ ] **Step 1: Append failing enforcement tests**:

```ts
import {
  bookTreatmentAppointment,
  rescheduleAppointment,
  publishAvailability,
  bookAuthSlot,
} from "@/lib/demo/backend";
import type { Identity } from "@/lib/demo/types";

// Minimal clinician identity owning appointments as their own user id.
const me: Identity = {
  user: { id: "u-x", givenName: "Test", lastName: "Doc", calendarName: "Dr Doc" },
  role: "doctor",
  context: { kind: "solo" },
} as unknown as Identity;

describe("treatment booking enforcement", () => {
  it("rejects a booking on a closed Sunday", () => {
    expect(() => bookTreatmentAppointment(emptyState(), {
      dateISO: "2026-07-05", startMinute: 600, durationMinutes: 30, identity: me,
    })).toThrow(BackendError);
  });

  it("rejects a booking overlapping a block", () => {
    const s = addTreatmentBlock(emptyState(), "u-x", { dateISO: "2026-07-01", startMinute: 600, endMinute: 660 }).state;
    expect(() => bookTreatmentAppointment(s, {
      dateISO: "2026-07-01", startMinute: 610, durationMinutes: 30, identity: me,
    })).toThrow(BackendError);
  });

  it("accepts a valid weekday booking", () => {
    const { appt } = bookTreatmentAppointment(emptyState(), {
      dateISO: "2026-07-01", startMinute: 600, durationMinutes: 30, identity: me,
    });
    expect(appt.type).toBe("treatment");
  });

  it("rejects a reschedule onto a closed day", () => {
    const { state, appt } = bookTreatmentAppointment(emptyState(), {
      dateISO: "2026-07-01", startMinute: 600, durationMinutes: 30, identity: me,
    });
    expect(() => rescheduleAppointment(state, appt.id, "2026-07-05", 600, 30, me)).toThrow(BackendError);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/demo/__tests__/treatment-availability.test.ts`
Expected: FAIL — bookings currently succeed (no guard); the "rejects" cases throw no error.

- [ ] **Step 3: Add the guard to `bookTreatmentAppointment`** — insert at the top of the function body, before minting the appt:

```ts
export function bookTreatmentAppointment(state: DemoState, input: BookTreatmentInput): { state: DemoState; appt: Appointment } {
  const owner = appointmentOwnerScope(input.identity);
  const end = input.startMinute + input.durationMinutes;
  if (!isTimeAvailableForTreatment(treatmentAvailabilityForOwner(state, owner), input.dateISO, input.startMinute, end)) {
    throw new BackendError("unavailable");
  }
  const appt: Appointment = {
    id: makeID("appt"),
    type: "treatment",
    ownerID: owner,
    // …unchanged…
```

(Replace the existing `ownerID: appointmentOwnerScope(input.identity),` with `ownerID: owner,` to reuse the local.)

- [ ] **Step 4: Add the guard to `rescheduleAppointment`** — only for treatment appts, after the existing permission/status checks and before computing `moved`:

```ts
  if (appt.status !== "awaitingConfirmation" && appt.status !== "confirmed") throw new BackendError("notActive");
  if (appt.type === "treatment") {
    const config = treatmentAvailabilityForOwner(state, appt.ownerID);
    if (!isTimeAvailableForTreatment(config, dateISO, startMinute, startMinute + durationMinutes)) {
      throw new BackendError("unavailable");
    }
  }
  const moved = { ...appt, dateISO, startMinute, endMinute: startMinute + durationMinutes };
```

- [ ] **Step 5: Append an auth-slot-unaffected test** to confirm the type gate (auth reschedule bypasses treatment windows). Add inside the same describe:

```ts
  it("does not gate a non-treatment (authSlot) reschedule by treatment windows", () => {
    let s = publishAvailability(emptyState(), { doctorID: "u-x", dateISO: "2026-07-01", startMinute: 840, endMinute: 900 }, me).state;
    const booked = bookAuthSlot(s, { doctorID: "u-x", dateISO: "2026-07-01", startMinute: 840, patientID: "p1", patientName: "P One", identity: me });
    s = booked.state;
    // Move the authSlot to a Sunday — treatment windows are closed then, but authSlots are exempt.
    expect(() => rescheduleAppointment(s, booked.appt.id, "2026-07-05", 840, 10, me)).not.toThrow();
  });
```

- [ ] **Step 6: Run to verify pass**

Run: `npx vitest run src/lib/demo/__tests__/treatment-availability.test.ts`
Expected: PASS (all cases, including the authSlot exemption).

- [ ] **Step 7: Run the full demo suite to catch regressions**

Run: `npx vitest run src/lib/demo`
Expected: PASS. If a pre-existing book/reschedule test now fails because it targeted a weekend or out-of-hours time, fix that test to use a valid weekday within 09:00–17:00 (those tests assert scheduling mechanics, not availability). Note each change in the commit body.

- [ ] **Step 8: Commit**

```bash
git add src/lib/demo/backend.ts src/lib/demo/__tests__/treatment-availability.test.ts
git commit -m "feat(scheduling): enforce treatment availability on book + reschedule"
```

---

### Task 5: Store — eager throws + config selector/mutators

**Files:**
- Modify: `src/lib/demo/store.tsx` (interface ~lines 46–56; `bookTreatmentAppointment` ~301; `rescheduleAppointment` ~316; add config members)

**Why eager:** `applyAndMirror`/`setState` run the reducer inside React's updater; a `BackendError` thrown there crashes render. Compute eagerly (like `submitRequest`) so the throw is synchronous and callers can `try/catch`.

- [ ] **Step 1: Make `bookTreatmentAppointment` compute eagerly.** Replace the demo branch so the throw happens outside `setState`:

```ts
      bookTreatmentAppointment: (input) => {
        // Compute eagerly so the availability guard throws synchronously (callers catch it).
        const { state: next } = backend.bookTreatmentAppointment(state, input);
        if (!live) { setState(() => next); return; }
        setState(() => next);
        void (async () => {
          try {
            const m = await import("@/lib/firebase/mirror");
            await m.mirrorBookTreatment({
              ownerID: input.identity.context.kind === "clinic" ? input.identity.context.clinic.id : input.identity.user.id,
              dateISO: input.dateISO, startMinute: input.startMinute, durationMinutes: input.durationMinutes,
              patientID: input.patientID, patientName: input.patientName, note: input.note,
            });
            setRefreshTick((t) => t + 1);
          } catch (e) { setLastSyncError(String(e)); }
        })();
      },
```

- [ ] **Step 2: Make `rescheduleAppointment` compute eagerly** so drag handlers can catch:

```ts
      rescheduleAppointment: (id, dateISO, startMinute, durationMinutes, identity) => {
        const next = backend.rescheduleAppointment(state, id, dateISO, startMinute, durationMinutes, identity);
        applyAndMirror(
          () => next,
          (m) => m.mirrorRescheduleAppointment(id, dateISO, startMinute, durationMinutes),
        );
      },
```

- [ ] **Step 3: Add config members to the store interface** (`StoreValue`, near the other availability lines ~46–56):

```ts
  treatmentAvailabilityForOwner: (ownerID: string) => import("./backend").TreatmentAvailabilityResult;
  setTreatmentDaySchedule: (ownerID: string, weekday: number, patch: Partial<import("./types").DaySchedule>) => void;
  addTreatmentBlock: (ownerID: string, input: { dateISO: string; startMinute: number; endMinute: number }) => void;
  removeTreatmentBlock: (ownerID: string, blockID: string) => void;
```

Then add an exported result alias in `backend.ts` next to the function (so the interface type resolves):

```ts
export type TreatmentAvailabilityResult = ReturnType<typeof treatmentAvailabilityForOwner>;
```

- [ ] **Step 4: Implement the config members** in the `value` object (near `availabilityWindowsForDoctor`, ~288). Mint the block id eagerly:

```ts
      treatmentAvailabilityForOwner: (ownerID) => backend.treatmentAvailabilityForOwner(state, ownerID),
      setTreatmentDaySchedule: (ownerID, weekday, patch) =>
        applyAndMirror(
          (s) => backend.setTreatmentDaySchedule(s, ownerID, weekday, patch),
          (m) => m.mirrorSetTreatmentDaySchedule(ownerID, weekday, patch),
        ),
      addTreatmentBlock: (ownerID, input) => {
        const { block } = backend.addTreatmentBlock(state, ownerID, input); // validates + mints id eagerly
        applyAndMirror(
          (s) => {
            const config = backend.treatmentAvailabilityForOwner(s, ownerID);
            const next = { ...config, ownerID, blocks: [...config.blocks, block] };
            return { ...s, treatmentAvailabilityByOwner: { ...s.treatmentAvailabilityByOwner, [ownerID]: next } };
          },
          (m) => m.mirrorAddTreatmentBlock(block),
        );
      },
      removeTreatmentBlock: (ownerID, blockID) =>
        applyAndMirror(
          (s) => backend.removeTreatmentBlock(s, ownerID, blockID),
          (m) => m.mirrorRemoveTreatmentBlock(ownerID, blockID),
        ),
```

- [ ] **Step 5: Typecheck** (mirror functions come in Task 8 — this will fail on the `m.mirror*` names until then, so temporarily verify only the non-mirror compile by checking the rest of the file is well-formed). Instead, defer the mirror wiring:

To keep this task self-contained and green, add **placeholder mirror stubs** now in `src/lib/firebase/mirror.ts` (bodies filled in Task 8):

```ts
export async function mirrorSetTreatmentDaySchedule(_ownerID: string, _weekday: number, _patch: Partial<import("@/lib/demo/types").DaySchedule>): Promise<void> { /* wired in Task 8 */ }
export async function mirrorAddTreatmentBlock(_block: import("@/lib/demo/types").TreatmentBlock): Promise<void> { /* wired in Task 8 */ }
export async function mirrorRemoveTreatmentBlock(_ownerID: string, _blockID: string): Promise<void> { /* wired in Task 8 */ }
```

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Run the full demo suite**

Run: `npx vitest run src/lib/demo`
Expected: PASS (store change is behaviour-preserving for valid times).

- [ ] **Step 7: Commit**

```bash
git add src/lib/demo/store.tsx src/lib/demo/backend.ts src/lib/firebase/mirror.ts
git commit -m "feat(scheduling): store config mutators + eager-throw book/reschedule"
```

---

### Task 6: Calendar drag/resize catch friendly banner

**Files:**
- Modify: `src/app/app/calendar/page.tsx` (drag/resize handlers ~lines 312, 343, 426, 448; the reschedule form ~717; the New-appointment `bookTreatmentAppointment` call ~601)

- [ ] **Step 1: Find the existing error/toast mechanism.** Read the top of `page.tsx` for any `useState` error banner already used (search `setError`/`banner`/`lastSyncError`). If one exists, reuse it. If not, add near the page component's state:

```ts
const [scheduleError, setScheduleError] = useState<string | null>(null);
```

Render it once near the calendar header:

```tsx
{scheduleError && <p className="mt-2 text-sm" style={{ color: "var(--color-rose)" }}>{scheduleError}</p>}
```

- [ ] **Step 2: Wrap each `store.rescheduleAppointment(...)` drag/resize call** (the four sites) in a try/catch that snaps back via the error banner. Pattern for each site:

```ts
    if (targetISO !== appt.dateISO || newStart !== appt.startMinute) {
      try {
        store.rescheduleAppointment(appt.id, targetISO, newStart, duration, me);
        setScheduleError(null);
      } catch (e) {
        setScheduleError(e instanceof BackendError && e.message === "unavailable"
          ? "That time is outside your treatment hours or on a blocked time."
          : "Could not move the appointment. Please try again.");
      }
    }
```

Apply the same wrapper to all four reschedule sites (week/day drag + both resize handlers). Import `BackendError` from `@/lib/demo/backend` at the top if not already imported.

- [ ] **Step 3: Wrap the reschedule form button** (~line 717) and the New-appointment `bookTreatmentAppointment` call (~line 601) in the same try/catch, setting `scheduleError` and only calling `onDone()` on success.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Run the calendar/demo suite**

Run: `npx vitest run src/lib/demo`
Expected: PASS (no behavioural test depends on the banner; guard is UI-only).

- [ ] **Step 6: Commit**

```bash
git add src/app/app/calendar/page.tsx
git commit -m "feat(calendar): surface treatment-availability rejections on drag/resize/book"
```

---

### Task 7: Treatment tab on /app/availability

**Files:**
- Modify: `src/app/app/availability/page.tsx`

- [ ] **Step 1: Add a tab switch** in the default export. Replace the single-role render with a tab state and two panels:

```tsx
export default function AvailabilityPage() {
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  const [tab, setTab] = useState<"authorisation" | "treatment">("authorisation");
  if (!identity) return null;
  if (store.status === "loading") return <p className="text-ink-soft">Loading…</p>;
  if (store.status === "error") return <p className="text-ink-soft">Could not load data. Open the dashboard to retry.</p>;

  return (
    <div>
      <h1 className="font-display text-3xl text-ink">Availability</h1>
      <div className="mt-4 flex gap-2">
        {(["authorisation", "treatment"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className="rounded-btn border px-3 py-1.5 text-sm"
            style={tab === t ? { background: "var(--color-tint)", color: "var(--color-card)", borderColor: "var(--color-tint)" } : { borderColor: "var(--color-line)", color: "var(--color-ink)" }}>
            {t === "authorisation" ? "Authorisation" : "Treatment"}
          </button>
        ))}
      </div>
      {tab === "authorisation"
        ? (identity.role === "doctor" ? <DoctorAvailability me={identity} /> : <BookConsult me={identity} />)
        : <TreatmentSchedule me={identity} />}
    </div>
  );
}
```

Add `useState` to the existing React import.

- [ ] **Step 2: Add the `TreatmentSchedule` component** at the bottom of the file:

```tsx
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function TreatmentSchedule({ me }: { me: Identity }) {
  const store = useDemoStore();
  const ownerID = me.context.kind === "clinic" ? me.context.clinic.id : me.user.id;
  const config = store.treatmentAvailabilityForOwner(ownerID);
  const [blockDate, setBlockDate] = useState(isoDay(store.now));
  const [blockStart, setBlockStart] = useState("12:00");
  const [blockEnd, setBlockEnd] = useState("13:00");
  const [error, setError] = useState<string | null>(null);

  function addBlock() {
    setError(null);
    const s = minutesFromTime(blockStart), e = minutesFromTime(blockEnd);
    if (e <= s) { setError("End time must be after the start time."); return; }
    try { store.addTreatmentBlock(ownerID, { dateISO: blockDate, startMinute: s, endMinute: e }); }
    catch { setError("Could not add the block. Please try again."); }
  }

  return (
    <>
      <div className="mt-6 rounded-card border border-line bg-card p-5">
        <h2 className="font-display text-lg text-ink">Weekly schedule</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {config.days.map((d, i) => (
            <li key={i} className="flex flex-wrap items-center gap-3">
              <span className="w-10 text-sm text-ink">{WEEKDAY_LABELS[i]}</span>
              <label className="flex items-center gap-1 text-sm text-ink-soft">
                <input type="checkbox" checked={d.open}
                  onChange={(ev) => store.setTreatmentDaySchedule(ownerID, i, { open: ev.target.checked })} />
                Open
              </label>
              <input type="time" value={timeLabel(d.openMinute)} disabled={!d.open}
                onChange={(ev) => store.setTreatmentDaySchedule(ownerID, i, { openMinute: minutesFromTime(ev.target.value) })}
                className="rounded-field border border-line px-2 py-1 text-sm text-ink disabled:opacity-40" />
              <span className="text-ink-soft">–</span>
              <input type="time" value={timeLabel(d.closeMinute)} disabled={!d.open}
                onChange={(ev) => store.setTreatmentDaySchedule(ownerID, i, { closeMinute: minutesFromTime(ev.target.value) })}
                className="rounded-field border border-line px-2 py-1 text-sm text-ink disabled:opacity-40" />
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6 rounded-card border border-line bg-card p-5">
        <h2 className="font-display text-lg text-ink">Blocked times</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm text-ink-soft">Date
            <input type="date" value={blockDate} onChange={(e) => setBlockDate(e.target.value)} className="ml-2 rounded-field border border-line px-2 py-1 text-sm text-ink" />
          </label>
          <label className="text-sm text-ink-soft">Start
            <input type="time" value={blockStart} onChange={(e) => setBlockStart(e.target.value)} className="ml-2 rounded-field border border-line px-2 py-1 text-sm text-ink" />
          </label>
          <label className="text-sm text-ink-soft">End
            <input type="time" value={blockEnd} onChange={(e) => setBlockEnd(e.target.value)} className="ml-2 rounded-field border border-line px-2 py-1 text-sm text-ink" />
          </label>
          <button onClick={addBlock} className="rounded-btn px-4 py-2 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>Add block</button>
        </div>
        {error && <p className="mt-2 text-sm" style={{ color: "var(--color-rose)" }}>{error}</p>}
        <ul className="mt-3 flex flex-col gap-2">
          {config.blocks.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 rounded-inner border border-line px-4 py-2">
              <span className="text-sm text-ink">{b.dateISO} · {timeLabel(b.startMinute)}–{timeLabel(b.endMinute)}</span>
              <button onClick={() => store.removeTreatmentBlock(ownerID, b.id)} className="rounded-btn border border-line px-3 py-1 text-sm" style={{ color: "var(--color-rose)" }}>Remove</button>
            </li>
          ))}
          {config.blocks.length === 0 && <li className="text-sm text-ink-soft">No blocked times.</li>}
        </ul>
      </div>
    </>
  );
}
```

- [ ] **Step 2b:** Ensure `useState` and `Identity` are imported (both already imported at top per current file). `timeLabel`, `minutesFromTime`, `isoDay` already exist in this file.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/app/availability/page.tsx
git commit -m "feat(scheduling): treatment-schedule editor tab on /app/availability"
```

---

### Task 8: Live parity — mapper, hydrate, mirror bodies

**Files:**
- Modify: `src/lib/firebase/mappers.ts` (new `mapTreatmentAvailability`)
- Modify: `src/lib/firebase/hydrate.ts` (rows type + population)
- Modify: `src/lib/firebase/mirror.ts` (fill the three stubs from Task 5)

- [ ] **Step 1: Add the mapper** to `mappers.ts` (after `mapAvailabilityWindow`). The backend doc shape mirrors the model: `days` array + `blocks` array under `treatmentAvailability/{ownerId}`:

```ts
// treatmentAvailability/{ownerId} → TreatmentAvailability. days[] is Mon-first (0=Mon…6=Sun).
export function mapTreatmentAvailability(id: string, data: Doc): TreatmentAvailability {
  const rawDays = Array.isArray(data.days) ? (data.days as Doc[]) : [];
  const days: DaySchedule[] = Array.from({ length: 7 }, (_, i) => {
    const d = rawDays[i] ?? {};
    return { open: Boolean((d as Doc).open), openMinute: intValue((d as Doc).openMinute), closeMinute: intValue((d as Doc).closeMinute) };
  });
  const rawBlocks = Array.isArray(data.blocks) ? (data.blocks as Doc[]) : [];
  const blocks: TreatmentBlock[] = rawBlocks.map((b) => ({
    id: str(b.id), dateISO: str(b.dateISO), startMinute: intValue(b.startMinute), endMinute: intValue(b.endMinute),
  }));
  return { ownerID: id, days, blocks };
}
```

Add `TreatmentAvailability, DaySchedule, TreatmentBlock` to the `./types` (or `@/lib/demo/types`) import in `mappers.ts`.

- [ ] **Step 2: Hydrate the owner's config** in `hydrate.ts`. Add to the `Rows` type: `treatmentAvailability?: Row[];`. Then build the map and include it in the returned state:

```ts
  const treatmentAvailabilityByOwner: DemoState["treatmentAvailabilityByOwner"] = {};
  for (const r of rows.treatmentAvailability ?? []) treatmentAvailabilityByOwner[r.id] = mapTreatmentAvailability(r.id, r.data);
```

Add `treatmentAvailabilityByOwner` to the returned object (next to `availabilityWindows`) and import `mapTreatmentAvailability`.

- [ ] **Step 3: Fill the mirror stubs** in `mirror.ts` (replace the Task 5 placeholders). Target future callables (region `australia-southeast1` via the shared `functions()` helper — the existing mirrors already call `httpsCallable(functions(), …)`, which is region-configured):

```ts
export async function mirrorSetTreatmentDaySchedule(ownerID: string, weekday: number, patch: Partial<import("@/lib/demo/types").DaySchedule>): Promise<void> {
  await httpsCallable(functions(), "setTreatmentDaySchedule")({ ownerId: ownerID, weekday, ...patch });
}
export async function mirrorAddTreatmentBlock(block: import("@/lib/demo/types").TreatmentBlock): Promise<void> {
  await httpsCallable(functions(), "addTreatmentBlock")({ id: block.id, dateISO: block.dateISO, startMinute: block.startMinute, endMinute: block.endMinute });
}
export async function mirrorRemoveTreatmentBlock(ownerID: string, blockID: string): Promise<void> {
  await httpsCallable(functions(), "removeTreatmentBlock")({ ownerId: ownerID, blockId: blockID });
}
```

- [ ] **Step 4: Typecheck + full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/firebase/mappers.ts src/lib/firebase/hydrate.ts src/lib/firebase/mirror.ts
git commit -m "feat(scheduling): live parity scaffolding for treatment availability (callables deferred)"
```

---

### Task 9: Seed a demo config + verify data compliance

**Files:**
- Modify: `src/lib/demo/seed.ts` (add a `treatmentAvailabilityByOwner` entry)

- [ ] **Step 1: Seed the demo owner's schedule** so the Treatment tab shows realistic data and a sample block. Add after the `availabilityWindows` seed block (~line 152). Use `TODAY_ISO` for the sample block on a time with no seeded appointment (e.g. Voss has 09:00 authSlot + 10:00 treatment; block 15:30–16:00 which is free):

```ts
    treatmentAvailabilityByOwner: {
      "u-voss": {
        ownerID: "u-voss",
        days: [
          { open: true, openMinute: 540, closeMinute: 1020 }, // Mon
          { open: true, openMinute: 540, closeMinute: 1020 }, // Tue
          { open: true, openMinute: 540, closeMinute: 1020 }, // Wed
          { open: true, openMinute: 540, closeMinute: 1020 }, // Thu
          { open: true, openMinute: 540, closeMinute: 1020 }, // Fri
          { open: false, openMinute: 540, closeMinute: 1020 }, // Sat
          { open: false, openMinute: 540, closeMinute: 1020 }, // Sun
        ],
        blocks: [{ id: "block-seed-1", dateISO: TODAY_ISO, startMinute: 930, endMinute: 960 }], // 15:30–16:00
      },
    },
```

- [ ] **Step 2: Verify seeded treatment appointments comply** with the default/seed schedule. Confirm each `type: "treatment"` seed row lands on an open weekday within 09:00–17:00 and off the block. (Current seed rows are 09:30–10:30 / 12:00–13:00 range — within hours; the block at 15:30 does not overlap them.) If any seed appt is out of hours, move it into hours in the seed.

- [ ] **Step 3: Run the full suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/demo/seed.ts
git commit -m "feat(scheduling): seed demo treatment schedule + sample block"
```

---

### Task 10: Manual verification + PR

- [ ] **Step 1: Start the dev server + open the app** (preview tooling). Log in to the demo, open **Availability → Treatment**.

- [ ] **Step 2: Verify the schedule editor** — toggle Sunday open/closed; change a day's hours; add a block (date + time); remove it. Confirm state persists across tab switches (within the session).

- [ ] **Step 3: Verify enforcement on the calendar** — on `/app/calendar`, try to create a New appointment on a closed weekend day or over the seeded block → the friendly banner shows and no appointment is created. Try a valid weekday time → it books. Drag an existing appointment onto a closed/blocked time → it snaps back with the banner.

- [ ] **Step 4: Screenshot** the Treatment tab and a rejected booking for the PR.

- [ ] **Step 5: Update the roadmap memory** — mark "Treatment availability windows (web)" shipped (demo-complete + live scaffolding; Cloud Functions `setTreatmentDaySchedule`/`addTreatmentBlock`/`removeTreatmentBlock` deferred). Note Calendar sync / online-status / consult-calls still deferred.

- [ ] **Step 6: Push + open PR** with the create-pr flow. Title: `feat(scheduling): treatment availability windows (web)`. Body: summary, spec/plan links, test plan (the manual steps above), screenshots, and the deferred-backend note.

---

## Self-Review

**Spec coverage:**
- Weekday open/closed + hours config → Tasks 1, 3, 7. ✓
- Ad-hoc blocks → Tasks 1, 3, 7. ✓
- "MUST NOT be bookable outside windows or over a block" → Task 4 (book + reschedule), Task 6 (all calendar paths route through these). ✓
- Closed-weekday scenario → Task 4 test (Sunday). ✓
- Ad-hoc-block scenario → Task 4 test (block overlap). ✓
- Demo + live parity → Tasks 5, 8 (mapper/hydrate/mirror; callables deferred per spec). ✓
- Out of scope (calendar sync, online status, consult calls) → untouched. ✓

**Placeholder scan:** Mirror bodies are real (target named callables); Task 5 placeholders are explicitly replaced in Task 8. No TBD/TODO left in code steps.

**Type consistency:** `TreatmentAvailability`/`DaySchedule`/`TreatmentBlock` defined in Task 1 and used identically in 3/5/8. `treatmentAvailabilityForOwner`, `setTreatmentDaySchedule`, `addTreatmentBlock` (returns `{state, block}`), `removeTreatmentBlock` signatures match across backend/store/mirror. `isoWeekday` exported once (Task 2). Error code `unavailable` consistent across backend (Task 4) and UI mapping (Task 6). `TreatmentAvailabilityResult` alias added in Task 5 for the interface.

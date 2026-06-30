# Calendar Create/Edit Implementation Plan (treatment appointments)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create + edit treatment appointments on the web calendar — create (existing patient / block time), reschedule, mark completed/no-show, cancel, confirm — with type/status colours. Demo + live parity.

**Architecture:** Add `noShow`/`cancelled` to `AppointmentStatus`; pure ops in `backend.ts` (book/reschedule/mark + a today-filter read); mirror the deployed `bookTreatment`/`rescheduleAppointment`/`markAppointment` callables; store actions; rebuild the calendar page with a New-appointment form + per-row quick actions.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest.

**Source of truth:** iOS `AXData/InMemoryBackend+Scheduling.swift`, `AXDomain/Appointments.swift`; deployed callables in `backend/functions/src/appointmentsFn.ts`. Design: `docs/superpowers/specs/2026-06-30-calendar-create-edit-design.md`.

**Key facts:**
- `appointmentOwnerScope(identity)` is a private helper already in `backend.ts` (clinic id in a clinic context, else user id). `makeID`, `BackendError` are in `backend.ts`.
- Deployed callable shapes: `bookTreatment({ownerId, dateISO, startMinute, durationMinutes, patientId, patientName, note}) → {appointmentId}`; `rescheduleAppointment({appointmentId, dateISO, startMinute, durationMinutes})`; `markAppointment({appointmentId, status})`. `mirrorConfirmAppointment` already exists.
- Self-double-book is allowed for treatment (no overlap check). The calendar is "today" — create/list use `isoDay(store.now)`.
- The store already has `confirmAppointment`, `searchPatients`, `pendingBookings`; `applyAndMirror` is the optimistic+mirror helper; live create rehydrates (server id).

---

## File Structure
- Modify `src/lib/demo/types.ts` — extend `AppointmentStatus`.
- Modify `src/lib/demo/backend.ts` — `bookTreatmentAppointment`, `rescheduleAppointment`, `markAppointment`, `appointmentsForOwnerOnDay`.
- Modify `src/lib/firebase/mirror.ts` — `mirrorBookTreatment`, `mirrorRescheduleAppointment`, `mirrorMarkAppointment`.
- Modify `src/lib/demo/store.tsx` — read + 3 actions + `StoreValue`.
- Modify `src/app/app/calendar/page.tsx` — New-appointment form + per-row quick actions + colours + today filter.
- Tests: `src/lib/demo/__tests__/appointments-ops.test.ts`.

---

## Task 1: Status enum + pure ops (TDD)

**Files:** Modify `src/lib/demo/types.ts`, `src/lib/demo/backend.ts`; Test `src/lib/demo/__tests__/appointments-ops.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import {
  emptyState, bookTreatmentAppointment, rescheduleAppointment, markAppointment,
  appointmentsForOwnerOnDay, BackendError,
} from "@/lib/demo/backend";
import type { Appointment, DemoState, Identity } from "@/lib/demo/types";

const voss: Identity = { user: { id: "u-voss", name: "Voss" }, role: "doctor", context: { kind: "independent" } };
const sarah: Identity = { user: { id: "u-sarah", name: "Sarah" }, role: "nurse", context: { kind: "independent" } };

const appt = (id: string, ownerID: string, dateISO: string, startMinute: number, status: Appointment["status"]): Appointment =>
  ({ id, type: "treatment", ownerID, dateISO, startMinute, endMinute: startMinute + 30, status });

function withAppts(...a: Appointment[]): DemoState {
  return { ...emptyState(), appointments: Object.fromEntries(a.map((x) => [x.id, x])) };
}

describe("bookTreatmentAppointment", () => {
  it("creates a confirmed treatment appointment owned by the identity scope", () => {
    const { state, appt } = bookTreatmentAppointment(
      emptyState(),
      { dateISO: "2026-06-26", startMinute: 600, durationMinutes: 30, patientID: "p1", patientName: "Mara Boyd", note: "Antiwrinkle", identity: voss },
      Date.UTC(2026, 5, 26),
    );
    expect(appt).toMatchObject({ type: "treatment", status: "confirmed", ownerID: "u-voss", startMinute: 600, endMinute: 630, patientID: "p1", patientName: "Mara Boyd", appointmentNote: "Antiwrinkle" });
    expect(state.appointments[appt.id]).toEqual(appt);
  });
  it("allows a block-time appointment with no patient", () => {
    const { appt } = bookTreatmentAppointment(emptyState(), { dateISO: "2026-06-26", startMinute: 720, durationMinutes: 60, note: "Lunch", identity: voss }, 0);
    expect(appt.patientID).toBeUndefined();
    expect(appt.endMinute).toBe(780);
  });
});

describe("markAppointment", () => {
  it("marks a confirmed appointment no-show", () => {
    const s = markAppointment(withAppts(appt("a1", "u-voss", "2026-06-26", 600, "confirmed")), "a1", "noShow", voss);
    expect(s.appointments.a1.status).toBe("noShow");
  });
  it("rejects marking a terminal (completed) appointment", () => {
    expect(() => markAppointment(withAppts(appt("a1", "u-voss", "2026-06-26", 600, "completed")), "a1", "noShow", voss)).toThrow(BackendError);
  });
  it("rejects another owner's appointment", () => {
    expect(() => markAppointment(withAppts(appt("a1", "u-voss", "2026-06-26", 600, "confirmed")), "a1", "completed", sarah)).toThrow(BackendError);
  });
  it("throws on a missing appointment", () => {
    expect(() => markAppointment(emptyState(), "nope", "completed", voss)).toThrow(BackendError);
  });
});

describe("rescheduleAppointment", () => {
  it("moves the appointment and updates the end", () => {
    const s = rescheduleAppointment(withAppts(appt("a1", "u-voss", "2026-06-26", 600, "confirmed")), "a1", 660, 45, voss);
    expect(s.appointments.a1).toMatchObject({ startMinute: 660, endMinute: 705 });
  });
  it("rejects another owner's appointment", () => {
    expect(() => rescheduleAppointment(withAppts(appt("a1", "u-voss", "2026-06-26", 600, "confirmed")), "a1", 660, 30, sarah)).toThrow(BackendError);
  });
});

describe("appointmentsForOwnerOnDay", () => {
  it("returns the owner's appointments for the day, excluding cancelled, ordered by start", () => {
    const s = withAppts(
      appt("a1", "u-voss", "2026-06-26", 660, "confirmed"),
      appt("a2", "u-voss", "2026-06-26", 540, "confirmed"),
      appt("a3", "u-voss", "2026-07-03", 600, "confirmed"), // other day
      appt("a4", "u-voss", "2026-06-26", 600, "cancelled"), // cancelled
      appt("a5", "u-sarah", "2026-06-26", 540, "confirmed"), // other owner
    );
    expect(appointmentsForOwnerOnDay(s, "u-voss", "2026-06-26").map((a) => a.id)).toEqual(["a2", "a1"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/lib/demo/__tests__/appointments-ops.test.ts` → FAIL.

- [ ] **Step 3a: Status enum in `src/lib/demo/types.ts`**

```ts
export type AppointmentStatus =
  | "awaitingConfirmation"
  | "confirmed"
  | "completed"
  | "noShow"
  | "cancelled";
```

- [ ] **Step 3b: Ops in `src/lib/demo/backend.ts`** (near the other appointment ops — `pendingBookings`/`confirmAppointment`)

```ts
export interface BookTreatmentInput {
  dateISO: string;
  startMinute: number;
  durationMinutes: number;
  patientID?: string;
  patientName?: string;
  note?: string;
  identity: Identity;
}

export function bookTreatmentAppointment(state: DemoState, input: BookTreatmentInput, now: number): { state: DemoState; appt: Appointment } {
  const appt: Appointment = {
    id: makeID("appt"),
    type: "treatment",
    ownerID: appointmentOwnerScope(input.identity),
    dateISO: input.dateISO,
    startMinute: input.startMinute,
    endMinute: input.startMinute + input.durationMinutes,
    status: "confirmed", // a clinician's own booking lands confirmed
    patientID: input.patientID,
    patientName: input.patientName,
    appointmentNote: input.note ? input.note : undefined,
  };
  void now; // ids are sequential in demo; `now` kept for signature parity with other ops
  return { state: { ...state, appointments: { ...state.appointments, [appt.id]: appt } }, appt };
}

export function rescheduleAppointment(
  state: DemoState, id: string, startMinute: number, durationMinutes: number, identity: Identity,
): DemoState {
  const appt = state.appointments[id];
  if (!appt) throw new BackendError("notFound");
  if (appt.ownerID !== appointmentOwnerScope(identity)) throw new BackendError("notPermitted");
  const moved = { ...appt, startMinute, endMinute: startMinute + durationMinutes };
  return { ...state, appointments: { ...state.appointments, [id]: moved } };
}

// completed | noShow | cancelled — only awaiting/confirmed appointments may be marked.
export function markAppointment(
  state: DemoState, id: string, status: Extract<AppointmentStatus, "completed" | "noShow" | "cancelled">, identity: Identity,
): DemoState {
  const appt = state.appointments[id];
  if (!appt) throw new BackendError("notFound");
  if (appt.ownerID !== appointmentOwnerScope(identity)) throw new BackendError("notPermitted");
  if (appt.status !== "awaitingConfirmation" && appt.status !== "confirmed") throw new BackendError("notActive");
  return { ...state, appointments: { ...state.appointments, [id]: { ...appt, status } } };
}

export function appointmentsForOwnerOnDay(state: DemoState, ownerID: string, dateISO: string): Appointment[] {
  return Object.values(state.appointments)
    .filter((a) => a.ownerID === ownerID && a.dateISO === dateISO && a.status !== "cancelled")
    .sort((a, b) => a.startMinute - b.startMinute);
}
```

Add `AppointmentStatus` to the `import type { … } from "./types"` block (`Appointment` is already imported from the self-booking work).

- [ ] **Step 4: Run to verify it passes** — `npx vitest run src/lib/demo/__tests__/appointments-ops.test.ts && npx tsc --noEmit`. Adding `noShow`/`cancelled` to the union is backward-compatible (no existing switch is exhaustive over it; if `tsc` flags one, handle the new cases). PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/demo/types.ts src/lib/demo/backend.ts src/lib/demo/__tests__/appointments-ops.test.ts
git commit -m "feat(calendar): book/reschedule/mark appointment ops + status enum"
```

---

## Task 2: Mirror functions

**Files:** Modify `src/lib/firebase/mirror.ts` (already imports `httpsCallable`, `functions`)

- [ ] **Step 1: Add functions** (near `mirrorConfirmAppointment`)

```ts
export async function mirrorBookTreatment(input: {
  ownerID: string; dateISO: string; startMinute: number; durationMinutes: number;
  patientID?: string; patientName?: string; note?: string;
}): Promise<void> {
  await httpsCallable(functions(), "bookTreatment")({
    ownerId: input.ownerID, dateISO: input.dateISO, startMinute: input.startMinute,
    durationMinutes: input.durationMinutes, patientId: input.patientID ?? null,
    patientName: input.patientName ?? null, note: input.note ?? "",
  });
}
export async function mirrorRescheduleAppointment(id: string, dateISO: string, startMinute: number, durationMinutes: number): Promise<void> {
  await httpsCallable(functions(), "rescheduleAppointment")({ appointmentId: id, dateISO, startMinute, durationMinutes });
}
export async function mirrorMarkAppointment(id: string, status: "completed" | "noShow" | "cancelled"): Promise<void> {
  await httpsCallable(functions(), "markAppointment")({ appointmentId: id, status });
}
```

- [ ] **Step 2: Type-check** — `npx tsc --noEmit` → clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/firebase/mirror.ts
git commit -m "feat(calendar): mirror bookTreatment/reschedule/markAppointment callables"
```

---

## Task 3: Store read + actions

**Files:** Modify `src/lib/demo/store.tsx`

- [ ] **Step 1: Extend `StoreValue`** (after `confirmAppointment`)

```ts
  appointmentsForOwnerOnDay: (ownerID: string, dateISO: string) => ReturnType<typeof backend.appointmentsForOwnerOnDay>;
  bookTreatmentAppointment: (input: import("./backend").BookTreatmentInput) => void;
  rescheduleAppointment: (id: string, startMinute: number, durationMinutes: number, identity: Identity) => void;
  markAppointment: (id: string, status: "completed" | "noShow" | "cancelled", identity: Identity) => void;
```

- [ ] **Step 2: Read + actions** (after the `confirmAppointment` action)

```ts
      appointmentsForOwnerOnDay: (ownerID, dateISO) => backend.appointmentsForOwnerOnDay(state, ownerID, dateISO),
      bookTreatmentAppointment: (input) => {
        // Demo adds locally. Live calls bookTreatment (server-authoritative id) then rehydrates.
        if (!live) { setState((s) => backend.bookTreatmentAppointment(s, input, now).state); return; }
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
      rescheduleAppointment: (id, startMinute, durationMinutes, identity) =>
        applyAndMirror(
          (s) => backend.rescheduleAppointment(s, id, startMinute, durationMinutes, identity),
          (m) => m.mirrorRescheduleAppointment(id, state.appointments[id]?.dateISO ?? "", startMinute, durationMinutes),
        ),
      markAppointment: (id, status, identity) =>
        applyAndMirror(
          (s) => backend.markAppointment(s, id, status, identity),
          (m) => m.mirrorMarkAppointment(id, status),
        ),
```

- [ ] **Step 3: Type-check + store tests** — `npx tsc --noEmit && npx vitest run src/lib/demo/__tests__/store.test.tsx` → clean / pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/demo/store.tsx
git commit -m "feat(calendar): store appointment create/reschedule/mark actions"
```

---

## Task 4: Calendar UI — New appointment + quick actions + colours

**Files:** Modify `src/app/app/calendar/page.tsx`

- [ ] **Step 1: Replace the appointments list block + add a New-appointment form**

Replace the read-only `<ul className="mt-6 …">` appointments list with the interactive version below, and add the imports + state. Keep the existing follow-ups + reminders sections untouched.

Add to the top imports:

```tsx
import { useState } from "react";
```

Inside the component, after `const followUps = …;` add derived data + state:

```tsx
  const dayAppts = store.appointmentsForOwnerOnDay(ownerID, todayISO);
  const [showNew, setShowNew] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
```

(Replace the existing `const appts = …` computation — it is superseded by `dayAppts`; remove the now-unused `appts`.)

Replace the heading + list region:

```tsx
      <div className="mt-6 flex items-center justify-between gap-4">
        <h1 className="font-display text-3xl text-ink">Calendar · Today</h1>
        <button onClick={() => setShowNew((v) => !v)}
                className="rounded-btn px-4 py-2 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>
          New appointment
        </button>
      </div>
      <p className="mt-1 text-ink-soft">
        {identity.context.kind === "clinic" ? identity.context.clinic.name : identity.user.name}
      </p>

      {showNew && <NewAppointmentForm ownerScope={ownerID} todayISO={todayISO} me={me} onDone={() => setShowNew(false)} />}

      <ul className="mt-6 flex flex-col gap-2">
        {dayAppts.map((a) => {
          const isOpen = expanded.has(a.id);
          const border = a.type === "treatment" ? "var(--color-tint)" : "var(--color-gold-deep, var(--color-ink-soft))";
          const statusColor = a.status === "noShow" ? "var(--color-rose)"
            : a.status === "completed" ? "var(--color-tint)"
            : a.status === "awaitingConfirmation" ? "var(--color-ink-soft)" : "var(--color-ink)";
          return (
            <li key={a.id} className="rounded-inner border border-line bg-card px-4 py-3">
              <button onClick={() => setExpanded((p) => { const n = new Set(p); n.has(a.id) ? n.delete(a.id) : n.add(a.id); return n; })}
                      className="flex w-full items-stretch gap-4 text-left">
                <span className="w-28 flex-none text-sm text-ink-soft">{timeLabel(a.startMinute)}–{timeLabel(a.endMinute)}</span>
                <span className="min-w-0 border-l-2 pl-4" style={{ borderColor: border }}>
                  <span className="block font-medium text-ink">{a.patientName ?? "Blocked time"}</span>
                  {a.appointmentNote && <span className="block text-sm text-ink-soft">{a.appointmentNote}</span>}
                </span>
                <span className="micro ml-auto self-center" style={{ color: statusColor }}>{a.status}</span>
              </button>
              {isOpen && <AppointmentActions appt={a} me={me} onDone={() => setExpanded((p) => { const n = new Set(p); n.delete(a.id); return n; })} />}
            </li>
          );
        })}
        {dayAppts.length === 0 && <li className="text-sm text-ink-soft">No appointments today.</li>}
      </ul>
```

- [ ] **Step 2: Add the two child components** (bottom of the file, after the default export's closing brace)

```tsx
function minutesFromTime(value: string): number {
  const [h, m] = value.split(":").map((x) => parseInt(x, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}
function timeValue(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

function NewAppointmentForm({ ownerScope, todayISO, me, onDone }: {
  ownerScope: string; todayISO: string; me: import("@/lib/demo/types").Identity; onDone: () => void;
}) {
  const store = useDemoStore();
  const [blockTime, setBlockTime] = useState(false);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState(30);
  const [note, setNote] = useState("");

  const matches = !blockTime && query.trim() && !picked ? store.searchPatients(query, me).slice(0, 5) : [];
  const canSave = blockTime || picked !== null;

  function save() {
    store.bookTreatmentAppointment({
      dateISO: todayISO, startMinute: minutesFromTime(time), durationMinutes: duration,
      patientID: blockTime ? undefined : picked?.id, patientName: blockTime ? undefined : picked?.name,
      note: note.trim() || undefined, identity: me,
    });
    onDone();
  }

  return (
    <div className="mt-4 rounded-inner border border-line bg-card p-4">
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={blockTime} onChange={(e) => { setBlockTime(e.target.checked); setPicked(null); }} />
        Block time (no patient)
      </label>

      {!blockTime && (
        <div className="mt-3">
          {picked ? (
            <p className="text-sm text-ink">{picked.name} <button onClick={() => setPicked(null)} className="ml-2 text-ink-soft underline">change</button></p>
          ) : (
            <>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search patient…"
                     className="w-full rounded-inner border border-line px-3 py-2 text-sm text-ink outline-none focus:border-tint" />
              <ul className="mt-1 flex flex-col gap-1">
                {matches.map((p) => (
                  <li key={p.id}>
                    <button onClick={() => setPicked({ id: p.id, name: `${p.givenName} ${p.lastName}` })}
                            className="w-full rounded-inner border border-line px-3 py-1.5 text-left text-sm text-ink hover:border-tint">
                      {p.givenName} {p.lastName}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="text-sm text-ink-soft">Start
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="ml-2 rounded-field border border-line px-2 py-1 text-sm text-ink" />
        </label>
        <label className="text-sm text-ink-soft">Duration
          <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="ml-2 rounded-field border border-line px-2 py-1 text-sm text-ink">
            {[15, 30, 45, 60].map((d) => <option key={d} value={d}>{d} min</option>)}
          </select>
        </label>
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Appointment note (optional)"
             className="mt-3 w-full rounded-inner border border-line px-3 py-2 text-sm text-ink outline-none focus:border-tint" />

      <div className="mt-3 flex gap-2">
        <button onClick={save} disabled={!canSave}
                className="rounded-btn px-4 py-2 text-sm font-medium text-card disabled:opacity-40" style={{ background: "var(--color-tint)" }}>
          Add appointment
        </button>
        <button onClick={onDone} className="rounded-btn border border-line px-4 py-2 text-sm text-ink-soft">Cancel</button>
      </div>
    </div>
  );
}

function AppointmentActions({ appt, me, onDone }: {
  appt: import("@/lib/demo/types").Appointment; me: import("@/lib/demo/types").Identity; onDone: () => void;
}) {
  const store = useDemoStore();
  const [time, setTime] = useState(timeValue(appt.startMinute));
  const [duration, setDuration] = useState(appt.endMinute - appt.startMinute);
  const canMark = appt.status === "awaitingConfirmation" || appt.status === "confirmed";

  return (
    <div className="mt-2 border-t border-line pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="rounded-field border border-line px-2 py-1 text-sm text-ink" />
        <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="rounded-field border border-line px-2 py-1 text-sm text-ink">
          {[15, 30, 45, 60].map((d) => <option key={d} value={d}>{d} min</option>)}
        </select>
        <button onClick={() => { store.rescheduleAppointment(appt.id, minutesFromTime(time), duration, me); onDone(); }}
                className="rounded-btn border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-tint">Reschedule</button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {appt.status === "awaitingConfirmation" && (
          <button onClick={() => { store.confirmAppointment(appt.id, me); onDone(); }}
                  className="rounded-btn px-3 py-1.5 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>Confirm</button>
        )}
        {canMark && (
          <>
            <button onClick={() => { store.markAppointment(appt.id, "completed", me); onDone(); }} className="rounded-btn border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-tint">Complete</button>
            <button onClick={() => { store.markAppointment(appt.id, "noShow", me); onDone(); }} className="rounded-btn border border-line px-3 py-1.5 text-sm" style={{ color: "var(--color-rose)" }}>No-show</button>
            <button onClick={() => { store.markAppointment(appt.id, "cancelled", me); onDone(); }} className="rounded-btn border border-line px-3 py-1.5 text-sm" style={{ color: "var(--color-rose)" }}>Cancel</button>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check + full suite + lint + build** — `npx tsc --noEmit && npx vitest run && npx eslint src && npm run build` (run eslint directly, not piped). All green.

- [ ] **Step 4: Commit**

```bash
git add src/app/app/calendar/page.tsx
git commit -m "feat(calendar): new-appointment form + per-row quick actions + status colours"
```

---

## Task 5: Verification gate + demo smoke + PR

- [ ] **Step 1: Full gate** — `npx vitest run && npx tsc --noEmit && npx eslint src && npm run build` (all green).

- [ ] **Step 2: Demo smoke (preview).** `.env.local` makes `npm run dev` run live — `mv .env.local .env.local.bak`, restart preview, restore afterwards. As **Dr Voss**, open **Calendar**:
  - The seeded `2026-07-03` pending booking no longer shows on today (today-filter); only today's appointments list.
  - **New appointment** → search a patient → set time/duration/note → **Add appointment** → it appears in the list at the right time.
  - Expand an appointment → **No-show** recolours the status; **Reschedule** moves it; **Cancel** removes it from the list.
  - No console errors.

- [ ] **Step 3: Push + PR** — `git push -u origin feature/calendar-create-edit` then `gh pr create` (body from the diff).

---

## Self-Review Notes

- **Spec coverage:** create treatment appointment (Tasks 1,4) ✓; block time (Tasks 1,4) ✓; completion state completed/no-show + colours (Tasks 1,4) ✓; cancel (Tasks 1,4) ✓; confirm awaiting (reuse) ✓; reschedule by typed time (Tasks 1,4) ✓; type/status colours + patient name on item (Task 4) ✓; double-book allowed for treatment (no overlap check) ✓.
- **Deferred (per spec):** drag/resize, week/month, public booking, auth slots, calls, sync, notifications, overlap layout, appointment-history section, new-patient-lead linking, edit-note-after-create.
- **Type consistency:** `bookTreatmentAppointment`/`rescheduleAppointment`/`markAppointment`/`appointmentsForOwnerOnDay` identical across layers; mark status is the `completed|noShow|cancelled` subset; callable field names match the deployed functions (`appointmentId`, `ownerId`, `dateISO`, `startMinute`, `durationMinutes`, `patientId`, `patientName`, `note`, `status`).
- **No placeholders:** every step has full code; PR body is the only deferred-to-runtime text.

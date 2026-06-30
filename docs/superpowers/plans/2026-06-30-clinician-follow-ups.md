# Clinician Follow-Ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Opt-in per-clinician follow-up reminders generated `intervalDays` after a treatment note, surfaced at the end of the day's calendar with Done/Ignore — demo + live parity.

**Architecture:** `FollowUpTask`/`FollowUpSettings` types + two `DemoState` slices; pure ops in `backend.ts` (incl. generation folded into `saveTreatmentNote`); mapper + direct-Firestore mirror (`users/{uid}/followUpTasks`, settings on the `users/{uid}` doc — rules already deployed); hydrate loads both; a settings control + a Done/Ignore list on the calendar page; one seeded task for demo.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest; Firebase v11 (`firebase/firestore`).

**Source of truth:** iOS `AXDomain/FollowUp.swift`, `AXData/InMemoryBackend+FollowUps.swift`, `AXData/LiveBackend.swift` (paths/encode), `backend/firestore.rules:24-37`. Design: `docs/superpowers/specs/2026-06-30-clinician-follow-ups-design.md`.

**Key facts:**
- Follow-ups are owned by the **user** (clinician), not the clinic — the calendar queries them by `identity.user.id`, unlike appointments.
- Demo `now` is `SEED_NOW` (2026-06-26); `isoDay(now)` = "2026-06-26", so a seeded task due that day surfaces.
- `displayName(patient)` and `fullName` come from `@/lib/demo/types`; `BackendError`, `makeID`, `appendNote` are in `backend.ts`.
- `mirror.ts` already imports `doc, setDoc, updateDoc, deleteDoc`, `firestore`.

---

## File Structure
- Modify `src/lib/demo/types.ts` — `FollowUpStatus`/`FollowUpTask`/`FollowUpSettings` + two `DemoState` slices.
- Modify `src/lib/demo/backend.ts` — `emptyState` slices, `isoDay`, settings/tasks ops, generation in `saveTreatmentNote`.
- Modify `src/lib/firebase/mappers.ts` — `encodeFollowUpTask`/`mapFollowUpTask`.
- Modify `src/lib/firebase/mirror.ts` — three mirror fns.
- Modify `src/lib/firebase/hydrate.ts` — load tasks + user-doc settings.
- Modify `src/lib/firebase/__tests__/hydrate.test.ts` — fixture fields.
- Modify `src/lib/demo/store.tsx` — reads + actions + `saveTreatmentNote` follow-up mirror.
- Modify `src/lib/demo/seed.ts` — one seeded task due today.
- Modify `src/app/app/calendar/page.tsx` — settings control + Done/Ignore list.
- Tests: `src/lib/demo/__tests__/follow-ups.test.ts`.

---

## Task 1: Model + state + settings/tasks ops (TDD)

**Files:** Modify `src/lib/demo/types.ts`, `src/lib/demo/backend.ts`; Test `src/lib/demo/__tests__/follow-ups.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import {
  emptyState, isoDay, followUpSettingsForUser, setFollowUpSettings,
  followUpTasksForOwnerOn, setFollowUpStatus, BackendError,
} from "@/lib/demo/backend";
import type { FollowUpTask, Identity } from "@/lib/demo/types";

const voss: Identity = { user: { id: "u-voss", name: "Voss" }, role: "doctor", context: { kind: "independent" } };
const sarah: Identity = { user: { id: "u-sarah", name: "Sarah" }, role: "nurse", context: { kind: "independent" } };

const task = (id: string, ownerID: string, dueDateISO: string, status: FollowUpTask["status"] = "pending"): FollowUpTask =>
  ({ id, ownerID, patientID: "p1", patientName: "Pat One", dueDateISO, status });

function withTasks(...tasks: FollowUpTask[]) {
  return { ...emptyState(), followUpTasksByID: Object.fromEntries(tasks.map((t) => [t.id, t])) };
}

describe("isoDay", () => {
  it("formats epoch ms as yyyy-MM-dd in UTC", () => {
    expect(isoDay(Date.UTC(2026, 5, 26, 23, 30))).toBe("2026-06-26");
  });
});

describe("follow-up settings", () => {
  it("defaults to disabled / 14 days", () => {
    expect(followUpSettingsForUser(emptyState(), "u-voss")).toEqual({ enabled: false, intervalDays: 14 });
  });
  it("stores per-user settings", () => {
    const s = setFollowUpSettings(emptyState(), { enabled: true, intervalDays: 7 }, voss);
    expect(followUpSettingsForUser(s, "u-voss")).toEqual({ enabled: true, intervalDays: 7 });
    expect(followUpSettingsForUser(s, "u-sarah")).toEqual({ enabled: false, intervalDays: 14 });
  });
});

describe("followUpTasksForOwnerOn", () => {
  it("returns the owner's pending tasks due on or before the date, oldest first", () => {
    const s = withTasks(
      task("t1", "u-voss", "2026-06-20"),
      task("t2", "u-voss", "2026-06-26"),
      task("t3", "u-voss", "2026-06-30"),          // future — excluded
      task("t4", "u-voss", "2026-06-25", "done"),  // actioned — excluded
      task("t5", "u-sarah", "2026-06-20"),         // other owner — excluded
    );
    expect(followUpTasksForOwnerOn(s, "u-voss", "2026-06-26").map((t) => t.id)).toEqual(["t1", "t2"]);
  });
});

describe("setFollowUpStatus", () => {
  it("updates the owner's own task", () => {
    const s = setFollowUpStatus(withTasks(task("t1", "u-voss", "2026-06-20")), "t1", "done", voss);
    expect(s.followUpTasksByID.t1.status).toBe("done");
  });
  it("rejects another user's task", () => {
    expect(() => setFollowUpStatus(withTasks(task("t1", "u-voss", "2026-06-20")), "t1", "done", sarah)).toThrow(BackendError);
  });
  it("throws on a missing task", () => {
    expect(() => setFollowUpStatus(emptyState(), "nope", "done", voss)).toThrow(BackendError);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/demo/__tests__/follow-ups.test.ts`
Expected: FAIL — exports/types missing.

- [ ] **Step 3a: Types in `src/lib/demo/types.ts`**

Add (near `NoteTemplate`):

```ts
export type FollowUpStatus = "pending" | "done" | "ignored";

export interface FollowUpTask {
  id: string;
  ownerID: string;
  patientID: string;
  patientName: string;   // denormalised for display
  dueDateISO: string;    // "yyyy-MM-dd" (UTC)
  status: FollowUpStatus;
  sourceNoteID?: string;
}

export interface FollowUpSettings { enabled: boolean; intervalDays: number }
```

Add to `DemoState`:

```ts
  followUpTasksByID: Record<string, FollowUpTask>;
  followUpSettingsByUser: Record<string, FollowUpSettings>;
```

- [ ] **Step 3b: Ops in `src/lib/demo/backend.ts`**

Add `FollowUpTask, FollowUpSettings, FollowUpStatus` to the `import type { … } from "./types"` block. Add `followUpTasksByID: {}, followUpSettingsByUser: {},` to `emptyState()`. Then add (near the note-template ops):

```ts
const DAY_MS = 86_400_000;

// Epoch ms -> "yyyy-MM-dd" in UTC (matches iOS followUpISODay).
export function isoDay(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

export function followUpSettingsForUser(state: DemoState, userID: string): FollowUpSettings {
  return state.followUpSettingsByUser[userID] ?? { enabled: false, intervalDays: 14 };
}

export function setFollowUpSettings(state: DemoState, settings: FollowUpSettings, identity: Identity): DemoState {
  return { ...state, followUpSettingsByUser: { ...state.followUpSettingsByUser, [identity.user.id]: settings } };
}

// Pending tasks due on or before dateISO, oldest first (overdue keep showing until actioned).
export function followUpTasksForOwnerOn(state: DemoState, ownerID: string, dateISO: string): FollowUpTask[] {
  return Object.values(state.followUpTasksByID)
    .filter((t) => t.ownerID === ownerID && t.status === "pending" && t.dueDateISO <= dateISO)
    .sort((a, b) => a.dueDateISO.localeCompare(b.dueDateISO));
}

export function setFollowUpStatus(state: DemoState, id: string, status: FollowUpStatus, identity: Identity): DemoState {
  const task = state.followUpTasksByID[id];
  if (!task) throw new BackendError("notFound");
  if (task.ownerID !== identity.user.id) throw new BackendError("notPermitted");
  return { ...state, followUpTasksByID: { ...state.followUpTasksByID, [id]: { ...task, status } } };
}
```

Keep `DAY_MS` even though Task 2 also uses it — define it once here.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/demo/__tests__/follow-ups.test.ts`
Expected: PASS. Then `npx tsc --noEmit` — fix any `DemoState` literal that now needs the two slices (the `assembleState` return — add `followUpTasksByID: {}, followUpSettingsByUser: {}` as a stub; Task 5 fills it).

- [ ] **Step 5: Commit**

```bash
git add src/lib/demo/types.ts src/lib/demo/backend.ts src/lib/firebase/hydrate.ts src/lib/demo/__tests__/follow-ups.test.ts
git commit -m "feat(followups): model + settings/tasks ops + isoDay"
```

---

## Task 2: Generate a follow-up on treatment-note save (TDD)

**Files:** Modify `src/lib/demo/backend.ts`; Test append to `src/lib/demo/__tests__/follow-ups.test.ts`

- [ ] **Step 1: Add the failing test**

```ts
import { saveTreatmentNote, setFollowUpSettings as setFU } from "@/lib/demo/backend";
import type { Patient } from "@/lib/demo/types";

function patientState(): { state: ReturnType<typeof emptyState>; patientID: string } {
  const p: Patient = {
    id: "p1", givenName: "Claire", lastName: "Donovan", dateOfBirth: { year: 1987, month: 7, day: 4 },
    gender: "Female", address: "", phone: "0432", email: "c@e.com", allergies: "NKDA",
    currentMedications: "Nil", owner: { kind: "doctor", id: "u-voss" }, prescribingDoctorIDs: [],
  };
  return { state: { ...emptyState(), patients: { p1: p } }, patientID: "p1" };
}

describe("saveTreatmentNote follow-up generation", () => {
  const NOW = Date.UTC(2026, 5, 26);
  it("schedules a follow-up at now+interval when enabled", () => {
    let { state } = patientState();
    state = setFU(state, { enabled: true, intervalDays: 14 }, voss);
    const r = saveTreatmentNote(state, { patientID: "p1", tickedIDs: [], title: "", body: "Tx", medications: [], identity: voss }, NOW);
    expect(r.followUp).toBeDefined();
    expect(r.followUp!.dueDateISO).toBe("2026-07-10"); // 26 Jun + 14 days
    expect(r.followUp!.sourceNoteID).toBe(r.note.id);
    expect(r.followUp!.ownerID).toBe("u-voss");
    expect(followUpTasksForOwnerOn(r.state, "u-voss", "2026-07-10").map((t) => t.id)).toEqual([r.followUp!.id]);
  });
  it("schedules nothing when disabled", () => {
    const { state } = patientState();
    const r = saveTreatmentNote(state, { patientID: "p1", tickedIDs: [], title: "", body: "Tx", medications: [], identity: voss }, NOW);
    expect(r.followUp).toBeUndefined();
    expect(Object.keys(r.state.followUpTasksByID)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/demo/__tests__/follow-ups.test.ts`
Expected: FAIL — `saveTreatmentNote` result has no `followUp`.

- [ ] **Step 3: Extend `saveTreatmentNote` in `src/lib/demo/backend.ts`**

Add `displayName` to the value import `import { fullName, identityBadge } from "./types";` → `import { fullName, displayName, identityBadge } from "./types";`. Change the return type and tail of `saveTreatmentNote`:

```ts
export function saveTreatmentNote(state: DemoState, input: SaveTreatmentNoteInput, now: number): { state: DemoState; note: Note; followUp?: FollowUpTask } {
```

Replace the final `const withNote = appendNote(...); return withNote;` with:

```ts
  const withNote = appendNote({ ...state, authorisations, usages }, note);

  // Follow-up reminder (opt-in): schedule one intervalDays after the treatment.
  const settings = followUpSettingsForUser(withNote.state, input.identity.user.id);
  if (!settings.enabled) return { state: withNote.state, note };
  const followUp: FollowUpTask = {
    id: makeID("fu"),
    ownerID: input.identity.user.id,
    patientID: input.patientID,
    patientName: displayName(patient),
    dueDateISO: isoDay(now + settings.intervalDays * DAY_MS),
    status: "pending",
    sourceNoteID: note.id,
  };
  const state2 = { ...withNote.state, followUpTasksByID: { ...withNote.state.followUpTasksByID, [followUp.id]: followUp } };
  return { state: state2, note, followUp };
```

(`patient` is already in scope at the top of `saveTreatmentNote`.)

- [ ] **Step 4: Run to verify it passes + full suite**

Run: `npx vitest run src/lib/demo/__tests__/follow-ups.test.ts && npx vitest run && npx tsc --noEmit`
Expected: PASS; no type errors (`seed.ts` and the store both use `.state`/`.note`, still valid).

- [ ] **Step 5: Commit**

```bash
git add src/lib/demo/backend.ts src/lib/demo/__tests__/follow-ups.test.ts
git commit -m "feat(followups): schedule a follow-up on treatment-note save when enabled"
```

---

## Task 3: Mapper (TDD)

**Files:** Modify `src/lib/firebase/mappers.ts`; Test append to `follow-ups.test.ts`

- [ ] **Step 1: Add the failing test**

```ts
import { encodeFollowUpTask, mapFollowUpTask } from "@/lib/firebase/mappers";

describe("follow-up mapper", () => {
  it("round-trips (ownerID comes from the path, not the body)", () => {
    const t: FollowUpTask = { id: "fu1", ownerID: "u-voss", patientID: "p1", patientName: "Pat One", dueDateISO: "2026-07-10", status: "pending", sourceNoteID: "n1" };
    const doc = encodeFollowUpTask(t);
    expect(doc).toMatchObject({ patientId: "p1", patientName: "Pat One", dueDateISO: "2026-07-10", status: "pending", sourceNoteId: "n1" });
    expect(mapFollowUpTask("fu1", "u-voss", doc)).toEqual(t);
  });
  it("defaults an unknown status to pending", () => {
    expect(mapFollowUpTask("fu1", "u-voss", { patientId: "p1", patientName: "P", dueDateISO: "2026-07-10", status: "weird" }).status).toBe("pending");
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/lib/demo/__tests__/follow-ups.test.ts` → FAIL.

- [ ] **Step 3: Implement in `src/lib/firebase/mappers.ts`**

Add `FollowUpTask, FollowUpStatus` to the `from "@/lib/demo/types"` type import. Append:

```ts
export function encodeFollowUpTask(t: FollowUpTask): Doc {
  return { patientId: t.patientID, patientName: t.patientName, dueDateISO: t.dueDateISO, status: t.status, sourceNoteId: t.sourceNoteID ?? null };
}

export function mapFollowUpTask(id: string, ownerID: string, data: Doc): FollowUpTask {
  const raw = str(data.status);
  const status: FollowUpStatus = raw === "done" || raw === "ignored" ? raw : "pending";
  return {
    id, ownerID,
    patientID: str(data.patientId),
    patientName: str(data.patientName),
    dueDateISO: str(data.dueDateISO),
    status,
    sourceNoteID: typeof data.sourceNoteId === "string" ? data.sourceNoteId : undefined,
  };
}
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run src/lib/demo/__tests__/follow-ups.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/firebase/mappers.ts src/lib/demo/__tests__/follow-ups.test.ts
git commit -m "feat(followups): follow-up task Firestore mapper"
```

---

## Task 4: Mirror functions

**Files:** Modify `src/lib/firebase/mirror.ts`

- [ ] **Step 1: Add functions**

Add `encodeFollowUpTask` to the `from "./mappers"` import; add `FollowUpTask, FollowUpSettings, FollowUpStatus` to the `from "@/lib/demo/types"` type import. Append:

```ts
export async function mirrorSaveFollowUpTask(t: FollowUpTask): Promise<void> {
  await setDoc(doc(firestore(), `users/${t.ownerID}/followUpTasks`, t.id), encodeFollowUpTask(t));
}
export async function mirrorSetFollowUpStatus(uid: string, id: string, status: FollowUpStatus): Promise<void> {
  await updateDoc(doc(firestore(), `users/${uid}/followUpTasks`, id), { status });
}
export async function mirrorSetFollowUpSettings(uid: string, settings: FollowUpSettings): Promise<void> {
  await updateDoc(doc(firestore(), "users", uid), { followUpEnabled: settings.enabled, followUpIntervalDays: settings.intervalDays });
}
```

- [ ] **Step 2: Type-check** — `npx tsc --noEmit` → clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/firebase/mirror.ts
git commit -m "feat(followups): mirror task save/status + settings"
```

---

## Task 5: Hydrate tasks + settings

**Files:** Modify `src/lib/firebase/hydrate.ts`, `src/lib/firebase/__tests__/hydrate.test.ts`

- [ ] **Step 1: Imports + `HydrationRows` + `assembleState`**

In `hydrate.ts` add `doc, getDoc` to the `firebase/firestore` import and `mapFollowUpTask` to the `./mappers` import. Extend `HydrationRows`:

```ts
  followUpTasks: Row[];
  followUpSettings: { enabled: boolean; intervalDays: number } | null;
  currentUserID: string;
```

In `assembleState`, replace the stubbed `followUpTasksByID: {}, followUpSettingsByUser: {}` (added in Task 1) by computing them before `return`:

```ts
  const followUpTasksByID: DemoState["followUpTasksByID"] = {};
  for (const r of rows.followUpTasks) followUpTasksByID[r.id] = mapFollowUpTask(r.id, rows.currentUserID, r.data);
  const followUpSettingsByUser: DemoState["followUpSettingsByUser"] = {};
  if (rows.followUpSettings) followUpSettingsByUser[rows.currentUserID] = rows.followUpSettings;
```

and include `followUpTasksByID, followUpSettingsByUser` in the returned object (replace the stub keys).

- [ ] **Step 2: Load in `hydrate` (both branches)**

Add a small helper near `runQuery`:

```ts
async function readUserFollowUpSettings(uid: string): Promise<{ enabled: boolean; intervalDays: number } | null> {
  const snap = await getDoc(doc(firestore(), "users", uid));
  if (!snap.exists()) return null;
  const d = snap.data();
  if (d.followUpEnabled === undefined && d.followUpIntervalDays === undefined) return null;
  return { enabled: d.followUpEnabled === true, intervalDays: typeof d.followUpIntervalDays === "number" ? d.followUpIntervalDays : 14 };
}
```

In **both** `assembleState({ … })` calls add:

```ts
      followUpTasks: await runQuery(`users/${uid}/followUpTasks`),
      followUpSettings: await readUserFollowUpSettings(uid),
      currentUserID: uid,
```

- [ ] **Step 3: Fixture**

In `src/lib/firebase/__tests__/hydrate.test.ts`, add to the `rows` object:

```ts
  followUpTasks: [{ id: "fu1", data: { patientId: "p1", patientName: "Pat", dueDateISO: "2026-07-10", status: "pending" } }],
  followUpSettings: { enabled: true, intervalDays: 7 },
  currentUserID: "u-voss",
```

and assertions in the test body:

```ts
    expect(state.followUpTasksByID.fu1).toMatchObject({ ownerID: "u-voss", dueDateISO: "2026-07-10", status: "pending" });
    expect(state.followUpSettingsByUser["u-voss"]).toEqual({ enabled: true, intervalDays: 7 });
```

- [ ] **Step 4: Type-check + full suite** — `npx tsc --noEmit && npx vitest run` → clean / all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/firebase/hydrate.ts src/lib/firebase/__tests__/hydrate.test.ts
git commit -m "feat(followups): hydrate tasks + settings on sign-in"
```

---

## Task 6: Store reads + actions + treatment-note mirror

**Files:** Modify `src/lib/demo/store.tsx`

- [ ] **Step 1: Extend `StoreValue`**

Add after the `sendAftercare`/templates lines:

```ts
  followUpSettingsForUser: (userID: string) => ReturnType<typeof backend.followUpSettingsForUser>;
  followUpTasksForOwnerOn: (ownerID: string, dateISO: string) => ReturnType<typeof backend.followUpTasksForOwnerOn>;
  setFollowUpSettings: (settings: import("./types").FollowUpSettings, identity: Identity) => void;
  setFollowUpStatus: (id: string, status: import("./types").FollowUpStatus, identity: Identity) => void;
```

- [ ] **Step 2: Reads + actions in the value object**

```ts
      followUpSettingsForUser: (userID) => backend.followUpSettingsForUser(state, userID),
      followUpTasksForOwnerOn: (ownerID, dateISO) => backend.followUpTasksForOwnerOn(state, ownerID, dateISO),
      setFollowUpSettings: (settings, identity) =>
        applyAndMirror(
          (s) => backend.setFollowUpSettings(s, settings, identity),
          (m) => m.mirrorSetFollowUpSettings(identity.user.id, settings),
        ),
      setFollowUpStatus: (id, status, identity) =>
        applyAndMirror(
          (s) => backend.setFollowUpStatus(s, id, status, identity),
          (m) => m.mirrorSetFollowUpStatus(identity.user.id, id, status),
        ),
```

- [ ] **Step 3: Mirror the generated follow-up in the `saveTreatmentNote` action**

Replace the existing `saveTreatmentNote` action body with (adds `followUp` capture + mirror):

```ts
      saveTreatmentNote: (input) => {
        let note: ReturnType<typeof backend.saveTreatmentNote>["note"] | null = null;
        let followUp: ReturnType<typeof backend.saveTreatmentNote>["followUp"] | null = null;
        applyAndMirror(
          (s) => { const r = backend.saveTreatmentNote(s, input, now); note = r.note; followUp = r.followUp ?? null; return r.state; },
          async (m) => {
            if (input.tickedIDs.length) {
              await m.mirrorConsumeRepeats({
                patientId: input.patientID,
                clinicId: clinicId(input.identity),
                authorisationIds: input.tickedIDs,
                note: { title: input.title, body: input.body, medications: input.medications },
              });
            } else if (note) {
              await m.mirrorCreateNote(input.patientID, note);
            }
            if (followUp) await m.mirrorSaveFollowUpTask(followUp);
          },
        );
      },
```

- [ ] **Step 4: Type-check + store tests** — `npx tsc --noEmit && npx vitest run src/lib/demo/__tests__/store.test.tsx` → clean / pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/demo/store.tsx
git commit -m "feat(followups): store reads/actions + mirror generated follow-up"
```

---

## Task 7: Seed a demo follow-up due today

**Files:** Modify `src/lib/demo/seed.ts`

- [ ] **Step 1: Add the seeded task**

Add `FollowUpTask` to the `import type { … } from "./types"`. Just before `return state;`, add:

```ts
  // One pending follow-up due today so the calendar surfacing is demonstrable
  // (a freshly generated task is due +interval, so it would not show on "today").
  const seededFollowUp: FollowUpTask = {
    id: "fu-seed-1", ownerID: "u-voss", patientID: grace.id, patientName: "Grace Huang",
    dueDateISO: TODAY_ISO, status: "pending",
  };
  state = { ...state, followUpTasksByID: { ...state.followUpTasksByID, [seededFollowUp.id]: seededFollowUp } };
```

- [ ] **Step 2: Type-check + seed test** — `npx tsc --noEmit && npx vitest run src/lib/demo/__tests__/seed.test.ts` → clean / pass (if the seed test asserts exact shape, add the new field expectation).

- [ ] **Step 3: Commit**

```bash
git add src/lib/demo/seed.ts
git commit -m "feat(followups): seed one demo follow-up due today"
```

---

## Task 8: Calendar UI — settings control + Done/Ignore list

**Files:** Modify `src/app/app/calendar/page.tsx`

- [ ] **Step 1: Add imports + derived data**

Add to imports:

```tsx
import { isoDay } from "@/lib/demo/backend";
```

Inside the component, after `ownerID`/`appts`, add (note: follow-ups are keyed by the **user**, not the clinic owner scope):

```tsx
  const me = identity;
  const todayISO = isoDay(store.now);
  const settings = store.followUpSettingsForUser(me.user.id);
  const followUps = store.followUpTasksForOwnerOn(me.user.id, todayISO);
```

- [ ] **Step 2: Render the settings control + the follow-up list**

Immediately before the closing `</div>` of the returned tree, add:

```tsx
      <div className="mt-10 rounded-card border border-line bg-card p-5">
        <h2 className="font-display text-lg text-ink">Follow-up reminders</h2>
        <label className="mt-3 flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => store.setFollowUpSettings({ ...settings, enabled: e.target.checked }, me)}
          />
          Remind me to follow up after a treatment
        </label>
        {settings.enabled && (
          <label className="mt-2 flex items-center gap-2 text-sm text-ink-soft">
            Interval
            <input
              type="number" min={1} max={90} value={settings.intervalDays}
              onChange={(e) => {
                const n = Math.min(90, Math.max(1, Number(e.target.value) || 1));
                store.setFollowUpSettings({ ...settings, intervalDays: n }, me);
              }}
              className="w-20 rounded-field border border-line px-2 py-1 text-sm text-ink"
            />
            days after treatment
          </label>
        )}
      </div>

      {followUps.length > 0 && (
        <div className="mt-6">
          <h2 className="font-display text-lg text-ink">Follow-ups due</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {followUps.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 rounded-inner border border-line bg-card px-4 py-3">
                <span className="min-w-0">
                  <span className="block font-medium text-ink">{t.patientName}</span>
                  <span className="micro">due {t.dueDateISO}</span>
                </span>
                <span className="flex flex-none gap-2">
                  <button onClick={() => store.setFollowUpStatus(t.id, "done", me)}
                          className="rounded-btn px-3 py-1.5 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>Done</button>
                  <button onClick={() => store.setFollowUpStatus(t.id, "ignored", me)}
                          className="rounded-btn border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-tint">Ignore</button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
```

- [ ] **Step 3: Type-check + full suite + lint + build** — `npx tsc --noEmit && npx vitest run && npx eslint src && npm run build` → all green.

- [ ] **Step 4: Commit**

```bash
git add src/app/app/calendar/page.tsx
git commit -m "feat(followups): calendar settings control + due-list with done/ignore"
```

---

## Task 9: Verification gate + demo smoke + PR

- [ ] **Step 1: Full gate** — `npx vitest run && npx tsc --noEmit && npx eslint src && npm run build` (all green).

- [ ] **Step 2: Demo smoke (preview).** `.env.local` makes `npm run dev` run live — `mv .env.local .env.local.bak`, restart preview, restore afterwards. As **Dr Voss**:
  - Open **Calendar** → "Follow-up reminders" control present; the seeded "Grace Huang" follow-up is listed under "Follow-ups due".
  - Click **Done** on it → it disappears from the list.
  - Toggle reminders **on**, set interval; open a patient → "Treatment note" → save → no error (the generated task is due +interval, not today, so it does not appear on today's calendar — correct).
  - No console errors.

- [ ] **Step 3: Push + PR** — `git push -u origin feature/clinician-follow-ups` then `gh pr create` (body written from the diff at PR time).

---

## Self-Review Notes

- **Spec coverage:** opt-in + configurable interval (Tasks 1, 8) ✓; opt-out generates nothing (Task 2 disabled case) ✓; tasks shown at end of the day's calendar (Task 8) ✓; done/ignore hides (Task 1 `setFollowUpStatus` + Task 8 buttons; list filters `pending`) ✓; generated `intervalDays` after treatment (Task 2) ✓.
- **Ownership:** tasks are per-user; the calendar queries `me.user.id` (not the clinic owner scope) — explicit in Task 8. `setFollowUpStatus`/`setFollowUpSettings` are own-only.
- **Type consistency:** `FollowUpTask`/`FollowUpSettings`/`FollowUpStatus` identical across types/backend/mappers/mirror/store/seed/UI. Firestore fields: task `{patientId, patientName, dueDateISO, status, sourceNoteId}`; settings `{followUpEnabled, followUpIntervalDays}` on `users/{uid}` (matches iOS).
- **No placeholders:** every step has full code; PR body is the only deferred-to-runtime text.
- **Deferred (per spec):** push/background notifications; a general settings page.

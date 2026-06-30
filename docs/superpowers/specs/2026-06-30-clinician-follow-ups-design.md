# Clinician Follow-Ups — Design

**Goal:** Port the iOS `clinician-follow-ups` capability to the web: an opt-in, per-clinician
follow-up reminder generated a configurable interval after a treatment note, surfaced at the
end of the day's calendar with done/ignore controls. Demo + live parity.

**Source of truth (read directly):**
- `/Users/zhendeng/Documents/AestheticX/openspec/specs/clinician-follow-ups/spec.md`
- `/Users/zhendeng/Documents/AestheticX/AestheticXKit/Sources/AXDomain/FollowUp.swift`
- `/Users/zhendeng/Documents/AestheticX/AestheticXKit/Sources/AXData/InMemoryBackend+FollowUps.swift` (ops + generation)
- `/Users/zhendeng/Documents/AestheticX/AestheticXKit/Sources/AXData/LiveBackend.swift` (paths/encode: tasks at `users/{uid}/followUpTasks`, settings on the `users/{uid}` doc)
- `/Users/zhendeng/Documents/AestheticX/backend/firestore.rules:24-37` (deployed: owner read/write `users/{uid}/followUpTasks`; owner may update `users/{uid}` except roles/clinics/abn/mustChangePassword)

## Model

```ts
type FollowUpStatus = "pending" | "done" | "ignored";

interface FollowUpTask {
  id: string;
  ownerID: string;        // owning clinician
  patientID: string;
  patientName: string;    // denormalised for display
  dueDateISO: string;     // "yyyy-MM-dd" (UTC)
  status: FollowUpStatus;
  sourceNoteID?: string;
}

interface FollowUpSettings { enabled: boolean; intervalDays: number } // defaults: false, 14
```

`DemoState` gains `followUpTasksByID: Record<string, FollowUpTask>` and
`followUpSettingsByUser: Record<string, FollowUpSettings>` (+ `emptyState()`).

## Layers

### Domain (pure, `backend.ts`)
- `isoDay(epochMs): string` — `yyyy-MM-dd` in UTC (matches iOS `followUpISODay`).
- `followUpSettingsForUser(state, userID)` — stored settings or the default `{enabled:false, intervalDays:14}`.
- `setFollowUpSettings(state, settings, identity)` — store under `identity.user.id`.
- `followUpTasksForOwnerOn(state, ownerID, dateISO)` — `pending` tasks with `dueDateISO <= dateISO`,
  oldest first (overdue keep showing until actioned).
- `setFollowUpStatus(state, id, status, identity)` — own-only (`BackendError("notFound")` if missing,
  `BackendError("notPermitted")` if not the owner).
- **Generation:** `saveTreatmentNote` returns `{ state, note, followUp?: FollowUpTask }`. When the
  author's settings are `enabled`, it also appends a task due `isoDay(now + intervalDays·dayMs)`,
  `sourceNoteID = note.id`. (Folded into the existing op, iOS-faithful.)

### Live parity
- **Mapper** (`mappers.ts`): `encodeFollowUpTask` → `{ patientId, patientName, dueDateISO, status, sourceNoteId }`;
  `mapFollowUpTask(id, ownerID, data)` → `FollowUpTask` (status decoded defensively to `pending`).
- **Mirror** (`mirror.ts`): `mirrorSaveFollowUpTask(t)` → `setDoc users/{ownerID}/followUpTasks/{id}`;
  `mirrorSetFollowUpStatus(uid, id, status)` → `updateDoc … {status}`; `mirrorSetFollowUpSettings(uid, settings)`
  → `updateDoc users/{uid} {followUpEnabled, followUpIntervalDays}`.
- **Hydrate** (`hydrate.ts`): load `users/{uid}/followUpTasks` into `followUpTasksByID`; read the
  `users/{uid}` doc and fold `{followUpEnabled, followUpIntervalDays}` into
  `followUpSettingsByUser[uid]` (only when present). Add a single-doc read helper.

### Store (`store.tsx`)
- Reads: `followUpSettingsForUser(userID)`, `followUpTasksForOwnerOn(ownerID, dateISO)`.
- Actions: `setFollowUpSettings(settings, identity)` and `setFollowUpStatus(id, status, identity)` via
  `applyAndMirror`. The `saveTreatmentNote` action additionally mirrors the returned `followUp` (when
  present) with `mirrorSaveFollowUpTask` — independent of the note's own mirror path.

### UI (`/app/calendar`)
- A compact **Follow-up reminders** control: an enable toggle and an interval input (1–90 days);
  changing either calls `setFollowUpSettings`.
- The day's **pending follow-ups** (`followUpTasksForOwnerOn(ownerID, todayISO)`) listed at the **end**
  of the day, each with patient name + due date and **Done** / **Ignore** buttons (`setFollowUpStatus`),
  which hide the task.

### Seed (`seed.ts`)
- Seed one `pending` follow-up task **due today** for the demo nurse owner so the calendar surfacing is
  immediately demonstrable (a freshly generated task is due +interval, so it would not show on "today").

## Data flow
- **Demo:** pure reducers; the seeded task + any generated on treatment-note save.
- **Live:** tasks at `users/{uid}/followUpTasks`, settings on `users/{uid}` (rules already deployed);
  hydrate loads both on sign-in.

## Error handling
Own-only violations throw `BackendError`; live failures surface via `lastSyncError` → `AppShell` banner.

## Testing (TDD)
- `follow-ups.test.ts` — `isoDay` (UTC); settings default + upsert; `followUpTasksForOwnerOn`
  (due-on-or-before filter, excludes done/ignored, oldest-first); `setFollowUpStatus` own-only;
  `saveTreatmentNote` schedules a task when enabled (due = now+interval, correct sourceNoteID) and
  schedules nothing when disabled.
- mapper round-trip (`encodeFollowUpTask`/`mapFollowUpTask`).
- Demo smoke: enable reminders; the seeded task shows on the calendar; Done hides it; Ignore hides it.

## Out of scope (deferred)
- Background/push notifications (the spec's surface is the calendar; push is a separate capability).
- A general `/app/settings` page (the single follow-up control lives on the calendar for now).

# Calendar Create/Edit — Design (treatment appointments)

**Goal:** Make the web calendar create- and edit-capable for treatment appointments —
create (existing patient or block time), reschedule, mark completed/no-show, cancel, and
confirm — with type/status colours. Demo + live parity (the live story is fully wired by
deployed callables).

**Source of truth:**
- `/Users/zhendeng/Documents/AestheticX/openspec/specs/appointments/spec.md` (Treatment
  appointments; Appointment completion state; Double-booking rules; Appointment detail +
  quick actions; Patient name persisted on the appointment).
- iOS `AXData/InMemoryBackend+Scheduling.swift` (`bookTreatmentAppointment`, `rescheduleAppointment`,
  `markAppointment`, `cancelAppointment`), `AXDomain/Appointments.swift` (`AppointmentStatus`).
- Deployed callables (`backend/functions/src/appointmentsFn.ts`): `bookTreatment` ({ownerId?, dateISO,
  startMinute, durationMinutes=30, patientId?, patientName?, note?} → {appointmentId}); `markAppointment`
  ({appointmentId, status: completed|noShow|cancelled}); `rescheduleAppointment` ({appointmentId, dateISO,
  startMinute, durationMinutes?}); `confirmAppointment` ({appointmentId}) — already wired (PR #21).

## Model

`AppointmentStatus` gains `"noShow"` and `"cancelled"` (now: awaitingConfirmation | confirmed |
completed | noShow | cancelled). No new fields on `Appointment`.

## Layers

### Domain (pure, `backend.ts`)
- `appointmentOwnerScope(identity)` already exists (clinic id in a clinic context, else user id).
- `bookTreatmentAppointment(state, input, now): { state, appt }` — `input`
  `{ dateISO, startMinute, durationMinutes, patientID?, patientName?, note?, identity }`; builds a
  `type:"treatment"`, `status:"confirmed"`, `ownerID: appointmentOwnerScope(identity)` appointment via
  `makeID("appt")`, `endMinute = startMinute + durationMinutes`. No overlap check (self-double-book is
  allowed for treatment, per spec).
- `rescheduleAppointment(state, id, startMinute, durationMinutes, identity): DemoState` — appt must exist
  (`notFound`) and be owned (`notPermitted`); set start/end (same day — the calendar is "today").
- `markAppointment(state, id, status, identity): DemoState` — `status` is `completed | noShow | cancelled`;
  appt must exist + owned; **legal-transition guard**: only `awaitingConfirmation`/`confirmed` may be
  marked (terminal states → `BackendError("notActive")`); set status.
- `appointmentsForOwnerOnDay(state, ownerID, dateISO): Appointment[]` — owner + date match, **excluding
  `cancelled`**, sorted by `startMinute`.

### Live parity (`mirror.ts`)
- `mirrorBookTreatment(input)` → `httpsCallable("bookTreatment")({ ownerId, dateISO, startMinute, durationMinutes, patientId, patientName, note })`.
- `mirrorRescheduleAppointment(id, dateISO, startMinute, durationMinutes)` → `httpsCallable("rescheduleAppointment")(...)`.
- `mirrorMarkAppointment(id, status)` → `httpsCallable("markAppointment")({ appointmentId: id, status })`.
- (`mirrorConfirmAppointment` already exists.)

### Store (`store.tsx`)
- Read: `appointmentsForOwnerOnDay(ownerID, dateISO)`.
- Actions: `bookTreatmentAppointment(input)` (demo: apply local; **live: call `bookTreatment` then
  rehydrate** — server-authoritative id, like the aftercare/self-booking create pattern);
  `rescheduleAppointment(id, startMinute, durationMinutes, identity)` and
  `markAppointment(id, status, identity)` via `applyAndMirror`.

### UI — `/app/calendar`
- A **"New appointment"** button → an inline form: patient search (reuse `searchPatients`) **or** a
  "Block time" toggle (no patient); typeable start time (`type="time"` → minutes), duration select
  (15/30/45/60, default 30), optional note. Submit → `store.bookTreatmentAppointment`.
- Each appointment row gets an **expand** → quick actions gated by status: **Confirm** (awaiting only),
  **Reschedule** (time + duration inputs), **Complete**, **No-show**, **Cancel**. Terminal statuses show
  no actions.
- **Colours:** left border by type (treatment = tint, authSlot = a distinct hue); a status chip coloured
  awaiting=ink-soft, confirmed=tint, completed=green-ish (use `--color-tint`), noShow=rose. The list is
  **filtered to today** (`appointmentsForOwnerOnDay(ownerScope, todayISO)`) and **excludes cancelled**.

## Data flow
- **Demo:** pure reducers over `state.appointments`.
- **Live:** `bookTreatment` (rehydrate after), `rescheduleAppointment`, `markAppointment` callables;
  appointments already hydrate.

## Error handling
`notFound`/`notPermitted`/`notActive` throw `BackendError`; live failures surface via `lastSyncError`.

## Testing (TDD)
- `appointments-ops.test.ts` — `bookTreatmentAppointment` (confirmed, default 30, owner scope, block-time
  no-patient); `markAppointment` (each outcome + terminal-state rejection + not-found + not-owner);
  `rescheduleAppointment` (start/end update + not-found); `appointmentsForOwnerOnDay` (date+owner filter,
  cancelled excluded, ordering).
- Demo smoke: New appointment → appears; reschedule moves it; mark no-show recolours; confirm a pending;
  cancel removes it from the list.

## Out of scope (deferred)
- Drag-to-resize/move (typeable time only); week/month views; public booking page; auth-slot publish/book;
  consult calls; Google/Apple calendar sync; booking notifications; overlapping side-by-side layout;
  appointment-history section on the patient file; new-patient-lead → create-patient-from-lead linking;
  editing an appointment note after creation (no deployed edit-note callable).

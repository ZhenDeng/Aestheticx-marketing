# Authorisation-Slot Publish + Book — Design

**Goal:** A doctor publishes availability windows for authorisation teleconsults, exposed as
discrete **10-minute bookable slots**; a nurse books an open slot for an existing patient,
creating an `authSlot` appointment on the doctor's calendar. **No slot may be double-booked.**
A doctor may **withdraw** a window that has no bookings.

**Source of truth:**
- `~/Documents/AestheticX/openspec/specs/appointments/spec.md` — *Authorisation slot
  publication* + *Booking an authorisation teleconsult* (existing-patient path + no-double-book
  + withdraw-empty-window).
- Existing web: `Appointment` (`type: "authSlot" | "treatment"`), `appointmentsForOwnerOnDay`,
  `calendarName`, `searchPatients`, `AppShell` nav.

## Model

New `AvailabilityWindow { id, doctorID, doctorName, dateISO, startMinute, endMinute }`
(`doctorName` denormalised at publish so nurses see who they're booking without a directory).
`DemoState` gains `availabilityWindows: Record<string, AvailabilityWindow>` (added to
`emptyState` + live `hydrate` — live populated later; **demo-complete now**). Slots are
**derived**, not stored. A booked slot is an `authSlot` appointment owned by the doctor at
`dateISO`/`startMinute`.

## Layers

### Domain (pure — `backend.ts`, TDD), `SLOT_MINUTES = 10`
- `slotsForWindow(w): number[]` — start minutes `[start, start+10, …]` while `s+10 <= end`.
- `publishAvailability(state, {doctorID, dateISO, startMinute, endMinute}, identity): {state, window}`
  — identity must be a doctor publishing **their own** (`doctorID === identity.user.id`, else
  `notPermitted`); `end > start` else `validationFailed`; stamps `doctorName`.
- `availabilityWindowsForDoctor(state, doctorID): AvailabilityWindow[]` — sorted date/start.
- `doctorsWithAvailability(state): {doctorID, doctorName}[]` — distinct doctors who published.
- `isSlotTaken(state, doctorID, dateISO, startMinute): boolean` — a non-cancelled `authSlot`
  appointment of that doctor at that day+start.
- `openSlotsForDoctorOnDay(state, doctorID, dateISO): number[]` — union of `slotsForWindow`
  over that doctor's windows on the date, minus taken; sorted unique.
- `withdrawAvailability(state, windowID, identity): DemoState` — window exists + owned (doctor);
  reject (`notActive`) if any non-cancelled `authSlot` appt of the doctor falls in
  `[start, end)` on the date; else remove.
- `bookAuthSlot(state, {doctorID, dateISO, startMinute, patientID, patientName, identity}): {state, appt}`
  — the slot must belong to one of the doctor's windows **and** be open (`isSlotTaken` →
  `BackendError("slotTaken")`, the double-book guard); creates an `authSlot` appointment
  (`ownerID: doctorID`, `endMinute = start + 10`, `status: "confirmed"`, `patientID`,
  `patientName`, `appointmentNote: "Auth request · <booker>"`).

### Store + live
- Reads: `availabilityWindowsForDoctor`, `doctorsWithAvailability`, `openSlotsForDoctorOnDay`.
- Actions: `publishAvailability`, `withdrawAvailability`, `bookAuthSlot` via `applyAndMirror`
  with deferred mirrors (`publishAvailability` / `withdrawAvailability` / `bookAuthSlot`
  Cloud Functions — **deferred backend**, demo-complete; same precedent as prior increments).
- `hydrate` returns `availabilityWindows: {}` (live populated when the backend lands).

### UI — new role-aware page `/app/availability` (+ AppShell "Availability" nav)
- **Doctor view:** a publish form (date + start/end time) → `publishAvailability`; a list of
  their windows showing derived slots (open vs booked) with a **Withdraw** button (blocked
  with a note when the window has bookings).
- **Nurse / clinic view:** list doctors with availability → pick one → its **open slots** for a
  chosen date → pick a slot → search + attach an existing patient → `bookAuthSlot`. A booked
  slot immediately drops out of the open list; a second attempt on a taken slot is rejected.
- Booked auth slots already render on the doctor's calendar (existing `authSlot` colour).

## Data flow
Demo: pure reducers over `availabilityWindows` + `appointments`. Live: deferred callables;
windows hydrate empty until then.

## Error handling
`notPermitted` / `validationFailed` / `notActive` / `slotTaken` throw `BackendError`; live
failures surface via `lastSyncError` + rehydrate.

## Testing (TDD)
- **`auth-slots.test.ts`** — `slotsForWindow` (10-min steps, drops trailing partial);
  `publishAvailability` (doctor-only, own-only, end>start); `openSlotsForDoctorOnDay` (union,
  taken removed, sorted unique); `isSlotTaken`; `withdrawAvailability` (removes empty, rejects
  when booked, owner guard); `bookAuthSlot` (creates authSlot, slot-not-in-window rejected,
  **double-book rejected**).
- **Preview (demo):** as a doctor publish a window → slots appear; sign in as a nurse → see
  the doctor + open slots → book one for a patient → it leaves the open list and shows on the
  doctor's calendar; withdrawing a booked window is blocked.

## Out of scope (deferred)
New-patient-**lead** booking via this flow (existing-patient first); doctor default to
most-recently-called; "Book consult" availability on the patient file; doctor online/offline
status + always-accept; consult-call launch/ringing (iOS-native); the publish/book/withdraw
**Cloud Functions** + live window hydration.

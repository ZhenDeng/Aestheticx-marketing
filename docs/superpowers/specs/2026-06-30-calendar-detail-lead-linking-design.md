# Appointment Detail: Patient Link + New-Lead → Create-Patient — Design

**Goal:** In the day-view appointment detail panel, make the **patient row actionable**:
for an appointment linked to an existing patient it navigates to that patient's file; for
an appointment whose patient is a **new-patient lead** (no file yet) it opens the
create-patient form prefilled from the lead, and on creation **links the appointment** to
the new patient (stamps `patientID`, replaces the lead name). Builds on the timeline +
selection panel shipped in PRs #27–28.

**Source of truth:**
- `~/Documents/AestheticX/openspec/specs/appointments/spec.md` — *Tappable appointment
  detail view with patient link and quick actions* (the patient-row link + create-from-lead
  linking parts; quick actions already shipped).
- Existing web: `src/app/app/calendar/page.tsx` (`DayView` selection panel + `AppointmentActions`),
  `src/components/app/PatientForm.tsx`, `store.createPatient` (returns new id), `Appointment`
  (`patientID?`, `patientName?`), seed lead `"Jordan Lee (new lead)"`.

## Current model

Leads have **no structured fields** today — a lead appointment is simply `patientID`
undefined with a `patientName` like `"Jordan Lee (new lead)"` (block-time has neither). So
prefill is **name-only** (given/last parsed from `patientName`); DOB/phone/email aren't
captured at booking in the web port (deferred — would need lead fields on `Appointment` +
the booking flow).

## Layers

### Domain (pure — `backend.ts`, TDD)
- `calendarName(p): string` — `${preferredName || givenName} ${lastName}` (the denormalised
  calendar form).
- `isLeadAppointment(a): boolean` — `!a.patientID && !!a.patientName`.
- `leadName(a): string` — `patientName` with a trailing `" (new lead)"` stripped.
- `draftFromLead(a): PatientDraft` — `emptyDraft()` with `givenName`/`lastName` split from
  `leadName` (first token = given, remainder = last).
- `linkAppointmentPatient(state, apptId, patientId, identity): DemoState` — appt exists
  (`notFound`) + owned (`notPermitted`); patient exists (`notFound`); set
  `patientID = patientId`, `patientName = calendarName(patient)`.

### Store + live (`store.tsx`, `mirror.ts`)
- `linkAppointmentPatient(apptId, patientId, identity)` via `applyAndMirror`.
- `mirrorLinkAppointmentPatient(id, patientId)` → `httpsCallable("linkAppointmentPatient")`.
  **The callable is a deferred backend task** (not yet deployed) — demo works fully; live
  lights up once the function lands (same precedent as the email-delivery web slice, PR #22).

### Components
- `PatientForm` gains an optional `onCreated?(id: string): void` called in the create branch
  right after `createPatient`, before it navigates. Existing callers are unchanged.
- `DayView` selection panel — the patient row branches:
  - **existing patient** (`patientID`): render the name as a `next/link` to
    `/app/patients/${patientID}`.
  - **lead** (`isLeadAppointment`): show the lead name + a **"Create patient from lead"**
    button (gated on `canCreatePatient`). It reveals an inline `PatientForm mode="create"`
    prefilled via `draftFromLead`, with `onCreated={(id) => store.linkAppointmentPatient(appt.id, id, me)}`;
    PatientForm then navigates to the new patient's file (so the linked appointment resolves
    to it and no longer offers creation).
  - **blocked time** (neither): plain "Blocked time", no row action.

## Data flow
- **Demo:** pure reducers (`createPatient`, `linkAppointmentPatient`).
- **Live:** `createPatient` mirrors (existing); the link mirrors via the deferred
  `linkAppointmentPatient` callable. Patient-row navigation is pure routing in both.

## Error handling
`notFound`/`notPermitted` throw `BackendError`; live mirror failures surface via
`lastSyncError` + rehydrate (existing `applyAndMirror`).

## Testing (TDD)
- **`appointment-lead.test.ts`** — `calendarName` (preferred vs given); `isLeadAppointment`
  (lead vs existing-patient vs block); `leadName` (strips suffix, trims); `draftFromLead`
  (given/last split incl. single-word + multi-word last); `linkAppointmentPatient`
  (stamps id + calendar name, owner guard, missing appt, missing patient).
- **Preview (demo):** existing-patient appt → patient row links to the file; lead appt →
  "Create patient from lead" → prefilled form → create → lands on the new patient file and
  the appointment now resolves to that patient (no longer a lead).

## Out of scope (deferred)
Structured lead fields (DOB/phone/email) on the appointment + capturing them at booking;
the `linkAppointmentPatient` Cloud Function (backend repo); opening the detail view directly
from week/month (they still open the day, where the detail panel lives); appointment-history
section on the patient file; availability windows; calendar sync; notifications.

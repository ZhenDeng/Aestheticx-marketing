# Patient File: Appointment-History Section — Design

**Goal:** Add a **collapsible appointment-history section** to the patient file, collapsed
by default, listing each of the patient's appointments (date, time range, status, and the
appointment note). Completion states (completed / no-show / cancelled) are reflected here.

**Source of truth:**
- `~/Documents/AestheticX/openspec/specs/appointments/spec.md` — *Appointment notes and
  history* ("collapsible appointment-history section, collapsed by default, that lists each
  appointment's time and appointment note") + *Appointment completion state* (reflected in
  the patient's appointment history).
- Existing web: `src/app/app/patients/[id]/page.tsx` (two-column file; `<aside>` holds Active
  authorisations + Manage), `Appointment` (`patientID?`, `dateISO`, `start/endMinute`,
  `status`, `appointmentNote?`).

## Model

No model changes. Appointment notes are already separate from the treatment/general note
stream (they never enter `notesForPatient`), satisfying the spec's separation requirement.

## Layers

### Domain (pure — `backend.ts`, TDD)
- `appointmentsForPatient(state, patientID): Appointment[]` — appointments whose
  `patientID === patientID`, sorted **most-recent-first** (`dateISO` desc, then `startMinute`
  desc). All statuses included (history shows completed / no-show / cancelled too).

### Store (`store.tsx`)
- Read passthrough `appointmentsForPatient(patientID)`.

### UI — patient file `<aside>`
- A new card after "Active authorisations": a header **button toggling `showHistory`**
  (local state, **default false** → collapsed). Collapsed shows the title + count
  (`Appointment history (N)`); expanded lists each appointment, most-recent-first:
  - line 1: `dd Mon yyyy · HH:MM–HH:MM` + a status chip (reuse the calendar status palette:
    no-show = danger, completed = sage, awaiting = ink-soft, cancelled = ink-faint, else
    type colour).
  - line 2 (if present): the `appointmentNote`.
- Empty state: "No appointments." A small date/label helper is local to the page (mirrors
  the calendar's `timeLabel` / `dayLabel` formatting).

## Data flow
Demo + live identical — a pure read over the already-hydrated `state.appointments`.

## Error handling
None (read-only). Section only renders inside an already permission-gated patient file.

## Testing (TDD)
- **`appointments-ops.test.ts`** (extend) — `appointmentsForPatient`: only the patient's
  appointments; ordered most-recent-first across dates and within a day; all statuses
  included (cancelled/no-show present); empty when none.
- **Preview (demo):** the section is collapsed by default; expanding lists the patient's
  appointments newest-first with time + status + note; a patient with none shows the empty
  state.

## Out of scope (deferred)
Re-pointing appointments on patient **merge** (a pre-existing gap: `mergePatients` reassigns
authorisations/usages but not appointments — flag separately); editing an appointment note
from the history; week/month detail; structured lead fields; the `linkAppointmentPatient`
Cloud Function.

# New-patient-lead booking — design

**Date:** 2026-07-02 · **Spec source:** `~/Documents/AestheticX/openspec/specs/appointments/spec.md`
(requirements: *Booking an authorisation teleconsult*, *Add-appointment date selection and patient
search*, *Patient name persisted… calendar items*, *Tappable appointment detail view*).

## Problem

The web app can only book appointments for existing patients (or patient-less block time). The
appointments spec requires booking for a **new patient not yet on file**, captured as a
**new-patient lead** — given name, last name, date of birth, phone, email — displayed as
"new patient" on the calendar, and later convertible to a real patient file with the captured
details prefilled. Today the web fakes this with a name-only string convention
(`"Jordan Lee (new lead)"` in `patientName`) that carries no DOB/phone/email and never leaves the
demo seed: none of the three booking flows (treatment "+", auth-slot, ad-hoc) can create a lead.

The live backend is **already fully lead-ready** — `bookTreatment`, `bookAuthSlot`,
`requestAdHocAuth`, and the public-booking endpoints all accept
`lead: {givenName, lastName, dob, phone, email} | null` (patientId XOR lead), store it on the
appointment doc, and `linkAppointmentTx` clears it on patient linking. This increment is
web-side only; no backend PR.

## Model

```ts
// types.ts — mirrors the backend lead record; dob is ISO yyyy-mm-dd (the public
// booking form uses <input type="date">, so ISO is the wire format producers emit).
export interface AppointmentLead {
  givenName: string;
  lastName: string;
  dob?: string;   // ISO yyyy-mm-dd
  phone?: string;
  email?: string;
}
export interface Appointment { …; lead?: AppointmentLead }
```

A lead appointment has `lead` set and no `patientID`; `patientName` stays undefined (the lead is
the name source). Legacy name-only leads (`patientName` set, no `patientID`, no `lead`) keep
working via fallback so old seeds / any live docs with a bare `patientName` don't regress.

## Pure demo backend (`backend.ts`)

- `BookTreatmentInput`, `BookAuthSlotInput`, `RequestAdHocAuthInput` gain `lead?: AppointmentLead`.
  - `bookAuthSlot` / `requestAdHocAuth`: exactly one of `patientID` | `lead` required
    (`validationFailed` otherwise — matches the callables' `(!patientId && !lead)` guard).
    `RequestAdHocAuthInput.patientID/patientName` become optional to admit the lead arm.
  - `bookTreatmentAppointment`: `patientID` | `lead` | neither (neither = block time, as today).
    A lead must carry a non-empty given or last name (the web UI always requires one; the spec's
    no-name lead is the block-time path we already have).
- `isLeadAppointment(a)` → `!a.patientID && (!!a.lead || !!a.patientName)`.
- `leadName(a)` → structured: `` `${givenName} ${lastName}`.trim() ``; else legacy strip of
  `"(new lead)"`.
- `draftFromLead(a)` → structured lead maps givenName/lastName/phone/email directly and parses
  ISO `dob` → `DateOfBirth {year, month, day}` (invalid/absent → null); legacy falls back to the
  existing first-token/remainder name split.
- `linkAppointmentPatient` additionally **clears `lead`** when stamping the patient (parity with
  `linkAppointmentTx`).
- Seed: Jordan Lee becomes a structured lead (`lead: {givenName, lastName, dob, phone, email}`,
  no `patientName`) so the demo exercises the new path end to end.

## Live parity

- `mapAppointment` reads `data.lead` → `Appointment.lead` (string fields only, ignore junk).
- `mirrorBookTreatment` / `mirrorBookAuthSlot` / `mirrorRequestAdHocAuth` send
  `lead: input.lead ?? null` and `patientId: input.patientID ?? null` (server enforces XOR).
- `store.tsx` live branches pass `lead` through; demo branches already flow it via the inputs.

## UI

Design follows the existing form system (rounded-inner cards, `border-line` inputs,
`text-ink`/`text-ink-soft`, tint CTA) — no new visual language.

**Calendar → New appointment** (`NewAppointmentForm`): the patient area becomes a three-way
choice — existing search (default) · **New patient** checkbox · Block time (unchanged). New-patient
mode swaps the search input for a 5-field grid: Given name*, Last name*, DOB (`<input type=date>`),
Phone, Email. Save disabled until a given or last name is present. Books with `lead`, no
`patientID`/`patientName`.

**Calendar chips + detail**: chips (day/week/month) title-resolve via lead first —
`leadName(a)` with a "new patient" annotation (detail row: `· new patient`, replacing the
off-spec `· new lead` wording). Detail's *Create patient from lead* prefills DOB/phone/email
from the structured lead via `draftFromLead`.

**Availability → Book a consult** (`BookConsult`): both the slot-booking panel and the ad-hoc
"Request now" panel gain a **New patient** toggle under the patient search. Toggled on, the same
5-field grid appears with a Book/Request button; given or last name required. Calls
`bookAuthSlot`/`requestAdHocAuth` with `lead`.

## Out of scope

Doctor default-most-recently-called, consult-call launch, calendar sync, scheduled (non-"now")
ad-hoc requests, patient-search by DOB/phone on the add-appointment form (separate spec
requirement, separate increment), booking notifications.

## Tests

- `appointment-lead.test.ts`: structured `isLeadAppointment`/`leadName`/`draftFromLead`
  (incl. ISO dob → DateOfBirth, bad dob → null, legacy fallbacks), link clears lead.
- Booking: treatment/auth-slot/ad-hoc each book with a lead (appt carries it, no patientID);
  XOR validation throws; treatment block-time still allowed.
- `mappers.test.ts`: `mapAppointment` lead round-trip + absent lead.

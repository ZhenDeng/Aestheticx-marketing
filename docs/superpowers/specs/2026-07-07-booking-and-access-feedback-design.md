# Booking & access feedback — reviewer general notes, return-patient matching, booking message

**Date:** 2026-07-07
**Status:** in progress
**Related:** [reviewer-file-access](2026-07-07-reviewer-file-access-design.md) (item 1 amends it),
[calendar-pending-bookings](2026-07-05-calendar-pending-bookings-design.md),
[treatment-note-access](2026-07-06-treatment-note-access-design.md).

Five feedback items were triaged against the code (2026-07-07). Two were already
implemented; this change addresses the rest and hardens one isolation edge. Owner decisions
recorded inline as **[1a] [2a] [Q2a]**.

## Item-by-item

### 1. Doctor sees an authorised patient's file **except general notes** — CHANGE (owner: **1a**)

Current state: a **prescribing** doctor (approved authorisation) already cannot view another
subject's general/aftercare notes — `PRESCRIBING_DOCTOR.canViewGeneralNotes` is false and the
note filter falls back to own-authored only. **Correct already.** But a **reviewing** doctor (an
open `pending`/`needsEdit` request) currently sees *all* note kinds — `REVIEWER.canViewGeneralNotes`
was deliberately `true` (shipped in [reviewer-file-access](2026-07-07-reviewer-file-access-design.md)).

**Decision [1a]:** general notes must be hidden from the reviewing doctor too. A general note may
carry non-clinical, administrative or personal remarks that are irrelevant to an authorisation
decision. The reviewer keeps read-only access to demographics, allergies/meds, **treatment** notes,
history, forms, and authorisations — everything needed to decide — but no longer sees general or
aftercare notes (except any they authored themselves, via the existing `authorID` fallback).

- `REVIEWER` drops `canViewGeneralNotes` (defaults to `false`). `canView` + `canViewTreatmentNotes`
  stay. Prescriber access is unchanged (already correct) and still wins over reviewer.
- Amends the reviewer-file-access spec: "Depth" is now **treatment notes + demographics/history/
  forms**, not "all note kinds". Its acceptance criterion "read all note kinds" is superseded here.
- **Live parity:** the Firestore *notes-read* rule in the backend repo must mirror this — a
  `hasOpenReviewRequest` reader may read `kind == 'treatment'` notes but NOT general/aftercare
  notes unless `patientFullNoteAccess`. (Backend-repo change, tracked in §External.)

### 2. Patient tab categorised by clinic/nurse, click to drill in — ALREADY DONE (owner: **2a**)

`/app/patients` shows the doctor's own patients flat and an "Other patients" card; `/app/patients/other`
groups granted patients by owner (clinic/nurse) as click-to-expand `<details>` accordions
(`groupPatientsByOwner` + `ownerLabel`). No code change. Nuance accepted by owner: clinic patients
group under the **clinic** name, not the individual nurse inside the clinic (nurse-within-clinic
attribution is not on the `Patient` model). Verified in QA only.

### 3. Booking detects existing vs new patient by name + DOB — NEW (owner: **Q2a**)

Today, converting a booking lead always mints a fresh patient (`createPatient` → new `makeID("p")`),
so a returning patient who self-books produces a duplicate file unless a clinician manually links them.

Add a **return-patient matcher** used at the point a lead would become a new file:

```
matchLeadToPatients(state, lead, identity): Patient[]
```

- **Match key:** `givenName` + `lastName` (trimmed, case-insensitive) **AND** full DOB
  (year+month+day). All three required — a partial/absent DOB yields no confident match (`[]`),
  so we never silently merge distinct people.
- **Scope [item 4]:** matches **only** patients owned by the acting subject — `p.owner` equals
  `ownerFor(identity)`. Never `visiblePatients` (which for a doctor includes granted nurse/clinic
  files). This enforces "return-patient match only within the same identity subject".
- **UI:** in the appointment-detail lead flow ("Create patient from lead"), if the matcher returns
  ≥1 candidate, surface *"Looks like an existing patient: {name} · DOB {…} — [Use this file]"* which
  calls `linkAppointmentPatient(appt.id, candidate.id, me)` instead of creating a duplicate. The
  "create new anyway" path remains.

### 4. Per-subject patient-file isolation — ALREADY ENFORCED + one hardening

Ownership is one immutable `PatientOwner` per file; demo `canView` and live Firestore reads are
owner-scoped; no cross-subject sharing, merge is clinic-admin-intra-clinic only. The item-3 matcher
respects this by construction (same-owner only). **Hardening:** `linkAppointmentPatient` validates the
appointment scope but not the *target patient's* owner, so a crafted call could link an appointment to
a foreign-owned file (not reachable from the UI today). Add a same-subject assert: the linked patient's
`owner` must equal `ownerFor(identity)`, else `notPermitted`.

### 5. Optional patient message/requirements in booking — PARTIAL → in-app surfaced (owner: **Q2a**)

The `Appointment.appointmentNote` field already exists and persists end-to-end (demo + live mirror);
the public booking form already populates it (seed evidence). Two gaps:

- **In-app:** the pending-booking **inbox row does not display** the patient's message, so a clinician
  approving a self-booking can't read what the patient wrote. Surface `appointmentNote` in
  `PendingBookings`. Also upgrade the clinician add-appointment note field from a single-line `<input>`
  to a multi-line `<textarea>`.
- **Patient-facing:** the online form where the *patient* writes the message is external (§External).

## External (backend repo `book.html` + Cloud Functions) — spec only, not in this repo

The patient-facing online booking form and its ingestion functions live on Firebase Hosting, outside
this repo. To fully satisfy items 1, 3 and 5, the backend repo must:

1. **[item 1]** Tighten the Firestore notes-read rule so an open-review reader cannot read
   general/aftercare notes (treatment-only), matching `REVIEWER` here.
2. **[item 5]** Add an optional free-text "Your requirements / message (optional)" `<textarea>` to
   `book.html`, written to the appointment doc's `appointmentNote` (the field already round-trips).
3. **[item 3]** Do return-patient matching **server-side** at booking ingestion or approval — never in
   the public form (an anonymous booker must not be told "we found your record"). Match name + DOB
   **within the target owner subject only**, and attach `patientId` to the pending appointment when a
   unique match is found, leaving ambiguous/none as a lead for the clinician to resolve.

## Acceptance criteria (this repo)

- A reviewing doctor's file view shows treatment notes but **no** general/aftercare notes they did not
  author; a prescribing doctor is unchanged. (unit + component)
- `matchLeadToPatients` returns same-owner name+DOB matches only; different-owner, DOB-mismatch, and
  DOB-absent cases return `[]`. (unit)
- `linkAppointmentPatient` throws `notPermitted` when the target patient is owned by another subject. (unit)
- The lead flow offers to reuse a matched existing file instead of creating a duplicate. (component/QA)
- The pending-booking inbox displays the patient's `appointmentNote` when present. (component/QA)
- Full suite green; build passes.

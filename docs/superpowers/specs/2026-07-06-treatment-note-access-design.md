# Treatment & general note access rules — design

**Date:** 2026-07-06 · **Request (owner feedback on treatment notes):**
1. A treatment note can be written only by a nurse and the prescribing doctor, **without an
   authorisation being required**.
2. A treatment note can be viewed by a nurse, the prescribing doctor, and the clinic admin.
3. A prescribing doctor cannot view a **general** note that is not written by the doctor
   themselves.

## Background — the model these rules land on

A `Patient` record has exactly **one** `owner` (`{kind:"doctor"|"nurse"|"clinic"}`) and,
independently, a list of **prescribing doctors** (`prescribingDoctorIDs`) — populated when a
doctor **approves an authorisation request** for that patient (`approveRequest`,
[backend.ts:350](../../../src/lib/demo/backend.ts)). The same real person treated in two
contexts is two separate records (one per owner); notes never cross records. So every rule
below resolves against a **single record's** owner + prescribing doctors.

Note kinds: `treatment`, `general`, `aftercareRecord`. Access is decided in two places:
`patientPermissions(identity, patient)` (flags) and `visibleNotesForPatient(state, pid,
identity)` (the note stream filter).

## Confirmed access model (per record R, viewer V)

Definitions:
- **owner-doctor-self** — V is the independent doctor who owns R.
- **owner-nurse-self** — V is the independent nurse who owns R.
- **record nurse** — owner-nurse-self **or** a nurse in R's owning clinic.
- **prescribing doctor** — a doctor with `V.id ∈ R.prescribingDoctorIDs`, **or** owner-doctor-self
  (a doctor is the prescribing doctor of their own private patient).
- **clinic admin** — a `clinicAdmin` in R's owning clinic.

| Capability | Who |
|---|---|
| **Write treatment note** (rule 1) | record nurse · prescribing doctor. *Never* clinic admin. No authorisation required (ticking one stays optional). |
| **View treatment notes** (rule 2) | record nurse · prescribing doctor · clinic admin · superAdmin |
| **Write general note** | owner (doctor/nurse) · record nurse · clinic admin · prescribing doctor (rule 3 grants this so "own general note" is meaningful) |
| **View general / aftercare notes** | Everyone with record access **sees all** of them, **except a non-owner doctor**, who sees **only the ones they authored** (rule 3). superAdmin sees all. |

`visibleNotesForPatient` filter, for a viewer who can see the file:
- `treatment` → included iff `canViewTreatmentNotes`.
- `general` / `aftercareRecord` → included iff `canViewGeneralNotes` **or** `note.authorID === V.id`.

## Deltas from today

1. **New permission flag `canViewTreatmentNotes`.** Today treatment notes are shown to
   *anyone who can view the file*; rule 2 restricts them, so the stream filter needs its own
   flag rather than piggy-backing on `canView`.
2. **`saveTreatmentNote` drops the "nurse must tick an authorisation" gate** (`nothingTicked`).
   Today only a doctor could save with zero ticked authorisations; now any permitted writer
   (nurse or prescribing doctor) can. Ticked authorisations, when present, are still validated
   and consumed exactly as before.
3. **Prescribing doctors gain `canWriteGeneralNote`** and see their **own** general/aftercare
   notes (today a prescriber-only doctor had `canWriteGeneralNote:false` and saw *no* general
   notes at all — [notes-ops.test.ts:175](../../../src/lib/demo/__tests__/notes-ops.test.ts)).
4. **`TreatmentNoteForm`**: `canSave` no longer requires a ticked authorisation; the
   authorisation list becomes an *optional* section shown only when usable authorisations
   exist (the "Request one from a doctor first" blocker copy is removed).
5. **`AftercareForm`** prefills the last treatment note's medications; it now sources them
   from `visibleNotesForPatient` (was unfiltered `notesForPatient`) so a viewer who can't see
   treatment notes under rule 2 doesn't get them prefilled — closing an indirect leak the
   narrower treatment-note visibility would otherwise open.

## Consequence worth explicit sign-off — clinic doctors

Rules 2 & 3 are written around "the prescribing doctor". Applied literally (confirmed: *"a
doctor who is neither a prescriber nor the owner of that record does not see it"*), a
**clinic doctor who has not prescribed for a given clinic patient** changes behaviour:

- **Before:** every clinic doctor could write treatment notes and see all notes on any patient
  in their clinic.
- **After:** a clinic doctor sees/writes treatment notes and sees general notes on a clinic
  patient **only once they are that patient's prescribing doctor** (i.e. after approving an
  auth request). Until then they still see the patient file, may still edit details / send
  forms, and see only general notes they authored themselves.

This is the direct, consistent reading of the three rules; it is called out here so the owner
can veto if clinic doctors were meant to keep blanket access. `superAdmin` (read-only, sees
everything), clinic admin (views all notes, writes general only), and the owner-doctor /
owner-nurse private-patient cases are **unchanged**.

## iOS-parity divergence (documented, not hidden)

The web permission model is a faithful port of the iOS `PatientPermissions`. These rules
intentionally diverge the **web** app: nurses no longer need an authorisation to write a
treatment note, treatment-note visibility is narrowed, and non-owner doctors are limited to
their own general notes. iOS is unchanged (separate codebase); the divergence is deliberate
owner feedback.

## Testing

Backend logic is pure and already well covered ([notes-ops.test.ts],
[backend.test.ts]); TDD there:
- Rule 1 — a nurse saves a treatment note with `tickedIDs: []` (no throw; `consumedAuthorisationIDs === []`).
- Rule 1 — ticked authorisations are still validated + consumed (existing coverage stays green).
- Rule 2 — `canViewTreatmentNotes`: true for record nurse / prescribing doctor / clinic admin /
  superAdmin; a non-prescribing, non-owner doctor gets `false` and treatment notes are hidden
  in `visibleNotesForPatient`.
- Rule 3 — a prescribing doctor `canWriteGeneralNote === true`, sees a general note **they**
  authored, and does **not** see a general note authored by someone else; treatment notes
  still visible.
- Gate: full `npm test` + `npm run build` green, changed files lint clean, and a live mobile
  QA pass of the treatment-note flow (nurse saves without an authorisation; doctor sees only
  own general notes).

## Tasks

- [x] Add `canViewTreatmentNotes` to `Permissions` + `perms()` default.
- [x] Rewrite `patientPermissions` grants per the table (all four owner branches).
- [x] Update `visibleNotesForPatient` to the treatment/general filter above.
- [x] Relax `saveTreatmentNote` — remove the nurse `nothingTicked` gate; keep ticked-auth validation/consumption.
- [x] Update `TreatmentNoteForm` — optional authorisation section + `canSave` no longer needs a tick.
- [x] Route `AftercareForm` medication prefill through `visibleNotesForPatient` (leak fix).
- [x] Update/extend `notes-ops.test.ts` for the new model (tests first).
- [x] Verify: `npm test`, `npm run build`, live QA of the note flow (rules 1–3 confirmed).

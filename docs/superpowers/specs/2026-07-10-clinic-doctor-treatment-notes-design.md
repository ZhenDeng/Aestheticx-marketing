# Clinic-employee doctor sees treatment notes (not general notes)

**Date:** 2026-07-10
**Branch:** `feat/clinic-doctor-treatment-notes` (web) + a rules-only companion in `~/Documents/AestheticX`
**Tier:** Core-architecture audit **Tier 2**, item 2 ("Context C clinic-employee doctor blinded").
**Owner sign-off (2026-07-10):** *"doctor should see treatment notes but do not see general note"* —
this reverses the deliberate PR #65 blinding with explicit owner authorization (constitution §23
satisfied).

## Problem

For a **doctor employed by a clinic viewing a patient owned by that clinic** (Context C), the web
permission engine fully blinds the non-prescribing doctor:

- `src/lib/demo/backend.ts` clinic branch (~199–216 pre-#78..#80 drift; re-verify lines): the
  `doctor` case returns `{ canView, canEditDetails, canWriteGeneralNote, canSendForms }` for a
  non-prescriber — `canViewTreatmentNotes: false`, `canViewGeneralNotes: false`.
- Pinned by `src/lib/demo/__tests__/notes-ops.test.ts` ("hides treatment notes from a
  non-prescribing clinic doctor": asserts BOTH flags false and `visibleNotesForPatient === []`).
- `visibleNotesForPatient` enforces: treatment notes need `canViewTreatmentNotes`; general/aftercare
  need `canViewGeneralNotes || authored-by-me`.

The audit found the web STRICTER than the constitution AND divergent from the live firestore.rules.

## Decision (owner)

Non-prescribing clinic-employee doctor, on their clinic's patient:
- `canViewTreatmentNotes: true` — clinical safety: the treating record is visible to a doctor
  working under the clinic's roof.
- `canViewGeneralNotes: false` — unchanged; general/aftercare notes stay nurse/admin territory
  (matches the PRESCRIBING_DOCTOR and REVIEWER grants, which also deny general notes).
- Everything else unchanged: keep `canView/canEditDetails/canWriteGeneralNote/canSendForms`; keep
  `canWriteTreatmentNote: false` (writing stays tied to the prescribing relationship — ticking
  authorisations is prescriber-gated anyway); authored-own-general-notes fallback still applies.

Resulting doctor lattice on a clinic patient: non-prescriber = view treatment notes;
prescriber = view + write treatment notes; neither sees general notes. Nurse/clinicAdmin unchanged
(both kinds visible).

## Web change (Aestheticx-marketing)

1. `backend.ts` clinic branch, non-prescriber doctor return: add `canViewTreatmentNotes: true`
   (update the branch comment — it currently says "treatment + full-general access only via the
   prescribing relationship", which the owner has now revised).
2. Flip the pinning test: `canViewTreatmentNotes` true; `visibleNotesForPatient` returns treatment
   notes but NOT others' general/aftercare notes (extend the fixture so it contains one of each and
   assert exactly the treatment note comes back). Keep `canViewGeneralNotes`/`canWriteTreatmentNote`
   false assertions.
3. Re-check no other test pins the old blinding (grep canViewTreatmentNotes in __tests__).

## Live rules (AestheticX) — VERIFIED 2026-07-10: tightening REQUIRED

The notes read rule gates general/aftercare on `patientFullNoteAccess = isSuperAdmin() ||
patientEditable(patient)`, and for a clinic patient `patientEditable` = `inClinic(ownerId)` — so
**any clinic member, including a doctor-only employee, can read general notes live today** (broader
than the owner decision; the treatment-note half was already granted). Backend change (read side
only, `firestore.rules` notes block ~line 145):

```
function generalNoteReadAccess(patient) {
  return isSuperAdmin()
    || (patient.ownerType == 'clinic'
          ? (isClinicAdmin(patient.ownerId) || (hasRole('nurse') && inClinic(patient.ownerId)))
          : patientEditable(patient));
}
// read: … && (generalNoteReadAccess(p) || resource.data.kind == 'treatment'
//             || resource.data.authorId == uid())
```

- Capability-based, per the multi-role lesson: a doctor+nurse clinic member keeps general-note read
  via `hasRole('nurse')`; a doctor-only member falls through to `kind == 'treatment'`.
- The `authorId == uid()` escape mirrors the web engine's "own general notes always visible"
  (`visibleNotesForPatient`: `canViewGeneralNotes || authored-by-me`) and fixes a pre-existing gap:
  a prescriber-only doctor could not read back their own general note live.
- The notes **create** rule (~line 157) is deliberately untouched: the clinic doctor keeps writing
  general notes (web `canWriteGeneralNote: true`), readable via the author escape.
- Non-clinic patients unchanged (`patientEditable` — owners keep full note access).
- Pre-existing, out of scope: live create blocks a prescriber-only doctor from writing general notes
  while the web grants `canWriteGeneralNote` (parity question for a later increment); live create
  also allows a clinic doctor direct treatment-note writes the web UI never offers.

## Test plan
- notes-ops: updated pinning test (treatment visible, general hidden, write still denied).
- Full suite + tsc + lint; browser QA as a clinic doctor viewing a clinic patient (demo cast: does
  any demo identity hit Context C? Voss is independent-only — may need the temp-identity QA pattern
  from the cross-workspace increment, reverted before commit).
- If rules change: rules-tests + deploy (owner OK) + prod E2E.

## Non-goals
- Granting general-note visibility (owner explicitly declined).
- Touching the prescriber or reviewer grants.

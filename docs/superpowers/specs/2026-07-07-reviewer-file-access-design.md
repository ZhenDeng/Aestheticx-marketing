# Reviewer file access — doctor reads the full patient file while a request is open

**Date:** 2026-07-07
**Status:** in progress
**Supersedes:** the "no patient-document access until approval" half of spec 6.12
(2026-07-06 treatment-note-access). Demographics-in-the-request still stands; this
*adds* read-only file access while a request is in flight.

## Why

A doctor deciding on an authorisation request needs to read the patient's full record
(history, treatment notes, allergies/meds, forms) — not just the embedded summary — before
approving. Previously the doctor gained patient-document access only on approval
(`prescribingDoctorIds`), which is too late: they must approve blind or bounce the request.

## Policy (owner decisions)

- **Scope:** live **and** demo. Live requires backend security-rule + Function changes.
- **Depth:** **read-only** full file. The reviewer may *view* details, allergies/meds,
  **all** note kinds (treatment + general + aftercare), history and forms, but may not edit
  the patient, write notes, send forms, or delete anything until approval.
- **States:** any **open** request addressed to the doctor — `pending` **or** `needsEdit`.
  Access ends when the request is `approved` (access then continues via `prescribingDoctorIds`)
  or if the request is deleted/abandoned.

## Mechanism — `openReviewerDoctorIds` (mirrors `prescribingDoctorIds`)

A denormalised array on each patient doc listing doctors with an open request for that
patient. Invariant: **`D ∈ patient.openReviewerDoctorIds` ⇔ D has ≥1 `pending`/`needsEdit`
request for that patient.** Client-read-only; maintained server-side.

### Backend (AestheticX repo)

1. **Firestore trigger** `onAuthRequestWritten` (`onDocumentWritten('authRequests/{id}')`)
   recomputes the addressed doctor's membership from the remaining open requests on every
   create / resubmit / approve / requireEdit / delete. Platform-agnostic (covers web + iOS).
2. **Rules** — a `hasOpenReviewRequest(patient)` helper added to *read* clauses only:
   - patient read: `patientVisible(p) || hasOpenReviewRequest(p)`
   - notes read: `(patientVisible(p) || hasOpenReviewRequest(p)) && (patientFullNoteAccess(p) || hasOpenReviewRequest(p) || kind == 'treatment')`
   - forms read: `patientVisible(p) || hasOpenReviewRequest(p)`
   `patientVisible` itself is **unchanged** so note-create / request-create do not widen —
   the reviewer gets read only. `openReviewerDoctorIds` is added to the Function-only
   forbidden-keys list on patient create/update.
3. **rules-tests** cover: reviewer reads patient + all note kinds + forms; reviewer cannot
   write patient/notes/forms; a doctor with no open request is denied.

### Web (this repo)

4. **`patientPermissions`** grants a read-only `REVIEWER` permission set
   (`canView`, `canViewTreatmentNotes`, `canViewGeneralNotes`) when
   `identity.role === 'doctor' && patient.openReviewerDoctorIDs.includes(uid)` and the doctor
   is not already the owner/prescriber (prescriber access is richer and wins).
5. **Demo backend** maintains the same invariant: `submitRequest`/`approveRequest` recompute
   `openReviewerDoctorIDs` from the demo request set (mirrors the trigger).
6. **Hydrate** adds a patient query `where('openReviewerDoctorIds', 'array-contains', uid)`
   so a reviewer's open-request patients (+ their notes/forms) load into the doctor's store.
7. **UI** — the doctor's review card links the patient name to the patient file. The patient
   file page already gates every write affordance on permissions, so a reviewer sees it
   read-only automatically.

## Acceptance criteria

- A doctor with a `pending` or `needsEdit` request for patient P can open P's file and read
  all note kinds; the same doctor with no open request for P cannot (`canView` false).
- The reviewer's file view exposes **no** edit / delete / note-write / send-form controls.
- After approval the doctor still reads P (now via `prescribingDoctorIds`); the reviewer flag
  is cleared.
- Live: Firestore rules permit exactly the above reads and deny the writes (rules-tests green).

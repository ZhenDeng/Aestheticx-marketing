# Design: patient create / edit / delete / merge

**Date:** 2026-06-28
**Status:** Approved (brainstorming) — pending spec review
**Repo:** `Aestheticx-marketing` (branch `feature/patient-crud`)
**Source of truth:** iOS `AestheticXKit/Sources/AXData/InMemoryBackend.swift` (patient ops), `AXDomain/PatientValidation.swift`, the hardened `backend/firestore.rules`, and `backend/functions/src/index.ts` (`mergePatients`).

## Goal

Add patient lifecycle management to the web app: create a patient (intake form), edit details, delete,
and merge duplicates — working in both demo (in-memory) and live (Firestore) modes, within the
permissions the hardened rules enforce.

## Decisions (brainstormed)

- Increment 1 of the deferred features; **consent signing is a separate later increment**.
- Includes **create + edit + delete + merge** (owner chose to include delete & merge).
- Owner of a new patient is **derived from the acting identity** (clinic context → clinic-owned;
  independent nurse/doctor → self-owned). Never client-set `prescribingDoctorIds` (rules block it).
- **Merge is clinic-admin + same-clinic only** (the `mergePatients` Cloud Function enforces this);
  the merge UI only appears for clinic admins.

## Domain (`src/lib/demo/backend.ts`, pure, TDD)

Port the patient ops the earlier increment skipped:

- `PATIENT_FIELDS: PatientField[]` and `missingFields(draft): Set<PatientField>` — the 9 mandatory
  fields (givenName, lastName, dateOfBirth, gender, address, phone, email, allergies,
  currentMedications); trimmed-empty counts as missing. Mirrors iOS `PatientValidator`.
- `createPatient(state, draft, identity, now): { state, patient }` — throws on missing fields; derives
  `owner`: clinic context → `{kind:'clinic', id: clinicId}`; else role doctor → `{kind:'doctor', id:
  uid}`; else `{kind:'nurse', id: uid}`. New id `p-<uuid>`. `prescribingDoctorIDs: []`.
- `updatePatient(state, patient, identity): state` — requires `patientPermissions(identity,
  existing).canEditDetails`; preserves `owner` and `prescribingDoctorIDs` from the existing record
  (only demographics + `alert` + `preferredName` change).
- `deletePatient(state, id, identity): state` — requires `canDelete`; removes the patient and its
  `notesByPatient[id]`.
- `mergePatients(state, keepId, removeId, identity): state` — requires `canMerge`; re-points
  `notesByPatient[removeId]` onto `keepId`, re-points authorisations with `patientID === removeId` to
  `keepId`, unions `prescribingDoctorIDs`, deletes the duplicate. Port of iOS
  `InMemoryBackend.mergePatients`.

A `PatientDraft` type (all-string form state + optional gender) is added to `types.ts`.

## Mirror (`src/lib/firebase/mirror.ts`, live) + mappers

- `encodePatient(p)` in `mappers.ts` — Firestore field names per the iOS `encode(_ patient:)`:
  `ownerType`, `ownerId`, `givenName`, `lastName`, `dateOfBirth` (yyyy-MM-dd via `formatDob`), `gender`,
  `address`, `phone`, `email`, `allergies`, `currentMedications`, `prescribingDoctorIds`, `alert?`,
  `preferredName?`.
- `mirrorCreatePatient(p)` → `setDoc(patients/{id}, encodePatientForCreate(p))` — includes the
  mandatory keys the create rule's `hasAll([...])` requires; **omits** `prescribingDoctorIds` (rules
  block it on create).
- `mirrorUpdatePatient(p)` → `updateDoc(patients/{id}, editableFields)` — demographics + `alert` +
  `preferredName` only; never `ownerType`/`ownerId`/`prescribingDoctorIds` (rules block those).
- `mirrorDeletePatient(id)` → `deleteDoc(patients/{id})`.
- `mirrorMergePatients(keepId, removeId)` → `httpsCallable('mergePatients')({ keepId, removeId })`.

## Store actions (optimistic + mirror, both modes)

`createPatient(draft, identity)` → returns the new id (for navigation); `updatePatient(patient,
identity)`; `deletePatient(id, identity)`; `mergePatients(keepId, removeId, identity)`. Each applies
optimistically to the in-memory cache then mirrors (no-op in demo mode), per the existing
`applyAndMirror` pattern.

## UI

- **Patients list** (`/app/patients`): a **"New patient"** button (shown when the identity may create —
  i.e. not super-admin and has a valid owner context) → `/app/patients/new`.
- **`PatientForm`** component (`src/components/app/PatientForm.tsx`), shared by create + edit:
  9 mandatory fields + optional preferred name + alert; gender `<select>` (Male/Female/Other); DOB via
  native `<input type="date">` mapped to/from `{year,month,day}`; live validation; submit disabled
  until valid; cancel returns to the file/list.
- **Create page** (`/app/patients/new`) and **edit page** (`/app/patients/[id]/edit`) render
  `PatientForm`; edit pre-fills from the store and routes back to the file on save.
- **Patient file** (`/app/patients/[id]`): "Edit" link (when `canEditDetails`); "Delete" button with a
  confirm (when `canDelete`) → on success route to the list; **"Merge duplicate"** action only for
  **clinic admins** — pick another same-clinic patient to merge *into* this one, with a confirm showing
  that notes/authorisations move and the duplicate is removed.

## Permissions

Reuse `patientPermissions`. Add a small `canCreatePatient(identity)` helper: `identity.role !==
'superAdmin'` (any nurse/doctor/clinicAdmin in a valid context). Edit/delete/merge gate on the existing
`canEditDetails` / `canDelete` / `canMerge`.

## Testing

- **TDD (offline):** `missingFields`, `createPatient` (owner derivation + validation throw),
  `updatePatient` (owner/prescribers preserved, permission denied for non-editors), `deletePatient`
  (removes patient + notes; permission), `mergePatients` (notes + auths re-pointed, prescribers unioned,
  duplicate gone; permission). Plus an `encodePatient` mapper test. Existing 40+ tests stay green.
- **Demo mode:** verified live via the preview tools (create → appears in list; edit → file updates;
  delete → gone; merge two seed clinic patients as the admin account).
- **Live mode:** manual, via the test account (create a test patient; edit; delete; merge two
  test clinic patients as a clinic-admin test account).

## Caveats (noted, not blockers)

1. **Delete orphans `notes`/`forms` subcollection docs in Firestore** — client deletes don't cascade
   subcollections. Demo mode is clean. A cascade-cleanup Cloud Function is a later follow-up; flagged
   in the PR.
2. **Merge requires a clinic-admin identity and two clinic patients of the same clinic** (server-
   enforced by the Function); the UI restricts the affordance accordingly.

## Out of scope

Consent signing (next increment), patient avatars/photo upload, the doctor "other patients" subpage,
super-admin patient tools, and any cascade-delete Cloud Function.

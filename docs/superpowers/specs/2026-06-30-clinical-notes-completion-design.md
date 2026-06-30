# Clinical-Notes Completion (Increment 1) — Design

**Goal:** Bring the web patient file up to the iOS `clinical-notes` capability for the
note stream, treatment-note authoring, and aftercare email — without attachments or
note-templates (deferred). Demo and live parity throughout.

**Source of truth (read directly for verbatim content):**
- `/Users/zhendeng/Documents/AestheticX/openspec/specs/clinical-notes/spec.md`
- `/Users/zhendeng/Documents/AestheticX/AestheticXKit/Sources/AXDomain/Aftercare.swift` (category templates + composer — copy verbatim)
- `/Users/zhendeng/Documents/AestheticX/AestheticXKit/Sources/AXFeatures/NoteSheets.swift` (`TreatmentNoteSheet`, `AftercareSheet` UX)
- `/Users/zhendeng/Documents/AestheticX/backend/functions/src/index.ts` (`sendAftercare`, `consumeRepeats` callables — deployed contract)

## What already exists (do not rebuild)

- `backend.saveTreatmentNote` — doctor-direct vs nurse-via-ticking, repeat consumption, usages. Fully tested.
- Store actions `saveGeneralNote` / `saveTreatmentNote` and the live mirror path
  (`mirrorConsumeRepeats` for ticked, `mirrorCreateNote` for doctor-direct).
- `Note` type with `kind: "general" | "treatment" | "aftercareRecord"`, `title`, `body`,
  `medications`, `consumedAuthorisationIDs`; `mirrorCreateNote` / `mapNote`.
- Callables region-pinned to `australia-southeast1` in `client.ts`.

So treatment notes are wired end-to-end **except the authoring UI**, and the note type
already anticipates `aftercareRecord`.

## Deliverables

### 1. Unified chronological note stream (patient file)

Render general + treatment + `aftercareRecord` notes in one list, newest-first
(`notesForPatient` already returns chronological; reverse for display). Each row:
- **Title/preview rule:** show `title` if non-empty, else the body's first line + "…".
- Expand on click to reveal the full body.
- Treatment rows additionally show medications (`name · dosage`, batch/expiry where set)
  and, if `consumedAuthorisationIDs.length`, a "consumed N repeat(s)" line.
- Aftercare rows show the sent content (the body already holds the exact sent text).
- A small kind badge distinguishes treatment / aftercare from general.

### 2. Treatment-note authoring UI

A section/sheet on the patient file gated by `perms.canWriteTreatmentNote`:
- **Doctor:** may save with no authorisations ticked (doctor-direct).
- **Nurse:** must tick one or more *usable* authorisations; show the repeat-consumption
  line; "no usable authorisations" guidance when empty.
- **Clinic admin:** option not shown (backend also rejects).
- Editable medications (batch / expiry / dosage), optional title, body.
- Calls the existing `store.saveTreatmentNote` action; inline `BackendError` messages
  (`nothingTicked`, `notActive`, `notPermitted`, `notFound`).

### 3. Aftercare email

- **Domain — `src/lib/demo/aftercare.ts`:** `AftercareCategory` (`antiwrinkle`,
  `skinbooster`, `haFiller`, `fatDissolve`, `fillerDissolve`) with `displayName` and the
  per-category instruction `template` copied **verbatim** from `Aftercare.swift`, plus
  `assembleAftercare(categories)` matching `AftercareComposer.assemble` (each section
  headed `— NAME —`, joined by blank lines, selection order preserved).
- **Op — `backend.recordAftercareSend`:** pure; validates the patient and that the sender
  may send aftercare (role is `nurse` or `doctor` — clinic admins may write general notes
  but MUST NOT send aftercare, per the spec), appends an `aftercareRecord` note whose
  `body` is the exact sent content and `medications` is the chosen list, `now` timestamp.
- **Store action — `sendAftercare({ patientID, content, medications, identity })`:**
  demo applies `recordAftercareSend`; live calls `mirrorSendAftercare` then rehydrates
  (the callable queues `mailOutbox` and writes the `aftercareRecord` note server-side, so
  demo must NOT also write it in live mode — mirror-only, then rehydrate).
- **Mirror — `mirrorSendAftercare`:** `httpsCallable(functions(), "sendAftercare")({ patientId, content, medications })`.
- **UI — aftercare compose sheet/section** gated to nurses and doctors (role ∈ {nurse, doctor}):
  - Tappable category chips; ticking re-assembles the editable body
    (`assembleAftercare(selected)` + the closing "Contact us…" line when any selected).
  - Editable content textarea (seeded with the iOS default copy).
  - "Attach this treatment's medication details" toggle, sourced from the patient's most
    recent treatment note's medications; only shown when such medications exist.
  - Send → store action → the record note appears in the stream.

## Data flow

- **Demo:** pure reducers over in-memory `DemoState`; no network.
- **Live:** `consumeRepeats` / `sendAftercare` callables (region-pinned). Treatment-note
  doctor-direct uses `mirrorCreateNote`. After `sendAftercare`, rehydrate so the
  server-written note appears.

## Error handling

Inline display of `BackendError` reasons for authoring; live failures flow through the
existing `lastSyncError` channel and the page's error banner.

## Testing (TDD)

- `aftercare.test.ts` — `assembleAftercare` verbatim content, ordering, empty case;
  category display names.
- `notes-ops.test.ts` — `recordAftercareSend` appends an `aftercareRecord` note with exact
  content + medications + permission rejection for clinic admin.
- Stream title/preview-rule unit (title vs first-line + "…").
- `store.test.tsx` — aftercare action records a note in demo mode.
- Treatment-note permission/repeat consumption already covered in `backend.test.ts`.

## Deferred (explicitly out of scope — future increments)

- Photo / file attachments + list-row thumbnails + display-name rename (needs a
  file-upload UI over Firebase Storage).
- *Apply a note template* when authoring a treatment note (depends on the unbuilt
  `note-templates` capability — its own spec/plan/PR).

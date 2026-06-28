# Design: in-app consent signing (increment 1)

**Date:** 2026-06-28
**Status:** Approved (brainstorming) — pending spec review
**Repo:** `Aestheticx-marketing` (branch `feature/consent-signing`)
**Source of truth:** iOS `AestheticXKit/Sources/AXDomain/{Forms,FormLibrary}.swift`, `AXData/LiveBackend.swift` (`recordSignedForm`, `form`/`encode(_ form:)`), the hardened `backend/firestore.rules` + `backend/storage.rules`.

## Goal

Let a clinician run a consent **on-device** for a patient: pick a template, answer screening
questions, read the full legal text (incl. the mandatory off-label clause), draw a signature, and
record it. Plus a Forms list/view/delete on the patient file. Demo + live modes, within the rules.

## Scope (decisions)

- Increment 1 of the consent subsystem. **In-app (`onDevice`) channel only.**
- **Drawn signature** on a canvas → PNG. Live: uploaded to Firebase Storage (first Storage use);
  demo: held in-memory as a data URL.
- **Deferred:** remote signing channels (email/QR/link via form-link Functions + a public page);
  server-side **PDF** rendering/download (the view shows the full text + signature instead).

## 1. Domain + template library (`src/lib/demo/forms.ts`, TDD)

Faithful TypeScript ports from the iOS `Forms.swift` + `FormLibrary.swift`:

- `FormTemplateKind` = `"aestheticHistory" | "antiwrinkleConsent" | "skinboosterConsent" |
  "haFillerConsent" | "collagenStimulatorConsent" | "fatDissolveConsent" | "haFillerDissolvingConsent"`
  with `displayName`.
- `SigningChannel` = `"onDevice" | "emailLink" | "qrCode" | "shareLink"` (only `onDevice` used now).
- `FormQuestion` = `{ id, prompt, kind: { type:"yesNo", detailPrompt?:string } | { type:"text" } }`.
- `FormTemplate` = `{ kind, intro, clauses: string[], questions: FormQuestion[], requiresSignature }`
  with a `fullText = [intro, ...clauses]` helper and `includesOffLabelClause`.
- `FormAnswer` = `{ questionID, answer: boolean, detail: string }`.
- `SignedFormRecord` = `{ id, patientID, template, channel, signedAt:number, answers: FormAnswer[],
  intro, clauses: string[], signatureFileId?: string, signatureDataUrl?: string, pdfFileId?: string }`
  (the record **snapshots** the template's intro+clauses, matching the iOS doc, so it preserves exactly
  what was agreed; `signatureDataUrl` is demo-only, never written to Firestore).
- `FORM_LIBRARY`: the off-label / privacy / photography / close clauses + a `template(kind)` builder,
  porting the iOS content **verbatim** (legal text). Consents share a `consent(kind, intro, questions)`
  builder appending `[offLabelClause, privacyClause, photographyClause, consentCloseClause]`.

**Test:** every consent template (all but `aestheticHistory`) includes the off-label clause; the
Aesthetic History template exposes its screening questions; `fullText` starts with the intro.

## 2. State + pure ops (`backend.ts`, TDD)

- Add `formsByPatient: Record<string, SignedFormRecord[]>` to `DemoState` (and `emptyState`).
- `formsForPatient(state, patientID): SignedFormRecord[]` — sorted newest-first.
- `recordSignedForm(state, input, now): { state, form }` — `input = { patientID, template, channel,
  answers, signatureFileId?, signatureDataUrl? }`; requires `patientPermissions(identity, patient)
  .canSendForms`; snapshots `intro`/`clauses` from `FORM_LIBRARY.template(template)`; mints `f-<uuid>`.
- `deleteForm(state, patientID, formId, identity): state` — requires `canSendForms`.

## 3. Storage (`src/lib/firebase/storage.ts`, new)

First Firebase Storage integration. Lazy `storage()` from the existing client app.
- `uploadSignature(patientID, formId, png: Blob): Promise<string>` → uploads to
  **`patients/{patientID}/signatures/{formId}.png`** (NOT under `forms/` — the Storage rules make
  `patients/{id}/forms/**` Function-only; the catch-all `patients/{id}/{allPaths}` allows image
  uploads by a `patientVisible` user) and returns that storage path.
- `signatureUrl(path): Promise<string>` → `getDownloadURL(ref(storage(), path))` for display
  (Storage rules already permit `patientVisible` reads). Demo mode never calls these.

## 4. Mappers + mirror + hydrate

- `mapForm(id, patientID, data)` / `encodeForm(form)` in `mappers.ts` — Firestore field names per iOS
  `form`/`encode(_ form:)`: `template`, `channel`, `signedAt`, `intro`, `clauses`, `answers`
  (`[{questionId, answer, detail}]`), `signatureImageFileId`, `pdfFileId`.
- `mirrorCreateForm(form)` → `setDoc(patients/{id}/forms/{formId}, encodeForm(form))`.
  `mirrorDeleteForm(patientID, formId)` → `deleteDoc(patients/{id}/forms/{formId})`.
  (Forms rules: create/delete allowed for `patientEditable`; the doc carries the snapshot text.)
- **Hydrate**: add a pass loading each visible patient's `forms` subcollection into `formsByPatient`
  (the super-admin branch too), via `mapForm`.

## 5. Store actions (optimistic + mirror)

- `recordForm(input, identity)` — for live mode, the page uploads the signature to Storage first
  (getting the `signatureFileId`), then this action applies `backend.recordSignedForm` optimistically
  and mirrors `mirrorCreateForm`. In demo mode it passes the `signatureDataUrl` and skips Storage.
- `deleteForm(patientID, formId, identity)` — optimistic apply + `mirrorDeleteForm`.

## 6. UI

- **`SignaturePad`** (`src/components/app/SignaturePad.tsx`): a `<canvas>` capturing pointer/touch
  strokes; "Clear"; exports a PNG `Blob` + a data URL; reports whether anything was drawn.
- **Consent flow** (`/app/patients/[id]/consent`): template `<select>` → screening questions (yes/no
  toggle that unfolds a detail input on "yes"; text inputs) → a scrollable **full legal text** panel
  with the off-label clause visually set apart → `SignaturePad` → Submit (disabled until signature
  drawn). On submit: live → `uploadSignature` then `recordForm`; demo → `recordForm` with the data URL.
  Routes back to the patient file.
- **Forms section** on the patient file: lists signed forms (`displayName` · date · channel) with a
  "Sign a consent" button (when `canSendForms`). Each row links to a read-only **view**
  (`/app/patients/[id]/forms/[formId]`) showing the answers, the full snapshotted text, and the
  signature image (`<img>` from `signatureDataUrl` in demo or `signatureUrl(path)` in live), plus a
  **Delete** (confirm) for forms signed in error.

## 7. Testing

- **TDD (offline):** the template library (off-label invariant; question presence), `recordSignedForm`
  (snapshot + permission), `deleteForm`, and `mapForm`/`encodeForm` round-trip. Existing suite stays green.
- **Demo smoke (preview):** as a nurse, run a consent on a patient end-to-end (answer questions, draw a
  signature, submit), see it in the Forms list, open the read-only view (signature shows), delete it.
- **Live (manual, owner, TEST account):** sign a consent for a test patient → confirm the
  `patients/{id}/forms/{id}` doc + the `patients/{id}/signatures/{id}.png` Storage object; the view
  loads the signature via the download URL; delete removes the doc.

## 8. Caveats

1. **No PDF this increment** — the view renders the full text + signature; "Download PDF" arrives with
   the server render (increment 2). The form doc's `pdfFileId` stays empty; the iOS `finalizeSignedForm`
   Function may still render one server-side on doc create — that's fine and out of our scope.
2. **Delete leaves the signature Storage object orphaned** (same client-cascade limitation as patient
   delete). Low risk; a cleanup Function is a later follow-up. Documented.
3. **Storage upload is new** — failures surface via the existing sync-error banner; the optimistic local
   record still shows in-session.

## Out of scope

Remote signing channels (email/QR/link) + the public signing page; server PDF render/download; editing a
signed form (they're immutable — delete + re-sign); consent versioning beyond the snapshot.

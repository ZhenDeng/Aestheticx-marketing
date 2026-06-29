# Design: consent PDF download (increment 2a)

**Date:** 2026-06-29
**Status:** Approved (brainstorming) — pending spec review
**Repo:** `Aestheticx-marketing` (branch `claude/musing-mcnulty-d6d6bd`)
**Source of truth:** iOS/Firebase backend `backend/functions/src/{formFinalize,formPdf}.ts`,
the hardened `backend/storage.rules` + `backend/firestore.rules`; web increment 1
(`docs/superpowers/specs/2026-06-28-consent-signing-design.md`, merged in PR #9).

## Goal

Let a clinician **download the server-rendered consent PDF** from a signed form's read-only view
(`/app/patients/[id]/forms/[formId]`). In **live** mode this surfaces the PDF that the
`finalizeSignedForm` Cloud Function renders on form-create and links back via `pdfFileId`. In **demo**
mode (no Functions) the control is disabled with a "live-only" hint. This is increment **2a** of the
deferred consent work; remote signing channels (2b) are a separate later cycle.

## Backend contract (already deployed; we only consume it)

- `finalizeSignedForm` is an `onDocumentCreated('patients/{patientId}/forms/{formId}')` Function. On every
  form-create — any channel — it renders a PDF with `pdfkit` and:
  - writes it to Storage at **`patients/{patientId}/forms/{formId}.pdf`** (the `{formId}` is the form
    doc id, i.e. the web client's `f-<uuid>`);
  - sets the Firestore field **`pdfFileId`** to that **relative Storage path string**.
- `needsFinalisation(doc) = !doc.pdfFileId && !doc.pdfPath`. The web increment-1 create writes
  `pdfFileId: null`, which is falsy → the Function **will** render. The signature embeds: the Function
  reads `signatureImageFileId` (the `patients/{id}/signatures/{...}.png` the web upload set) and downloads
  it for the PDF. So **web-signed forms get a complete server PDF with the signature**. Confirmed by
  reading `formFinalize.ts`.
- **Storage rules** (`patients/{patientId}/forms/{formFile}`): `allow read: if signedIn() &&
  patientVisible(patientId); allow write: if false;` → an authorised web client **can** `getDownloadURL`
  the PDF; only the Function (Admin SDK) writes it.
- **Timing:** the Function runs **async after** the doc is created (typically seconds). The doc's
  `pdfFileId` therefore appears slightly after signing; the just-signed local optimistic record won't
  carry it until a re-hydrate. The UI handles this with a `pending` state (below).

## 1. Pure/domain layer (TDD) — new `src/lib/demo/formPdf.ts`

Framework-free helpers, unit-tested with Vitest:

- `pdfAvailability(record: Pick<SignedFormRecord, "pdfFileId">, isLive: boolean):
  "ready" | "pending" | "unavailable"`
  - `!isLive` → `"unavailable"` (demo mode: no server PDF exists).
  - `isLive` and a non-empty `pdfFileId` → `"ready"`.
  - `isLive` and missing/empty `pdfFileId` → `"pending"` (still rendering, or not yet hydrated).
- `pdfFilename(displayName: string, patientName: string, signedAtMillis: number): string`
  - Produces e.g. `Antiwrinkle Consent — Claire D — 2026-06-29.pdf`. Date is the signing date
    (`YYYY-MM-DD`, from `signedAtMillis`). Strips characters illegal in filenames (`/ \ : * ? " < > |`)
    and collapses whitespace, so the result is a safe download name.

**Tests:** the three `pdfAvailability` branches (incl. empty-string `pdfFileId` treated as absent), and
`pdfFilename` formatting + sanitisation of an illegal character.

## 2. Firebase layer

- **`src/lib/firebase/storage.ts`** — add a generic resolver and reuse it:
  ```ts
  export async function fileDownloadUrl(path: string): Promise<string> {
    return getDownloadURL(ref(storage(), path));
  }
  ```
  Refactor the existing `signatureUrl` to delegate (`return fileDownloadUrl(path);`) — a small tidy in the
  file we're already editing; behaviour unchanged.
- **`src/lib/firebase/forms.ts`** (new) — a thin live read helper:
  ```ts
  export async function fetchSignedFormPdfPath(patientID: string, formId: string): Promise<string | null>;
  ```
  `getDoc(doc(firestore(), 'patients/{patientID}/forms', formId))`; if it exists, return
  `mapForm(formId, patientID, snap.data()).pdfFileId ?? null` (reuses the existing mapper so field naming
  stays single-sourced). Returns `null` when absent. This is what makes the `pending` → `ready` transition
  possible without a full page re-hydrate.

## 3. UI — `src/app/app/patients/[id]/forms/[formId]/page.tsx`

Add a **"Document"** section beneath the existing Signature block. State derives from
`pdfAvailability(form, isLive)` where `isLive = store.status !== "demo"`:

- **`unavailable` (demo):** a **disabled** "Download PDF" button + caption
  *"The server-rendered PDF is available in live mode."*
- **`ready` (live):** an enabled "Download PDF" button. On click:
  1. `const url = await fileDownloadUrl(form.pdfFileId!)`;
  2. `fetch(url)` → `blob()` → object URL → click a programmatic `<a download={pdfFilename(...)}>` →
     revoke the object URL. This yields a properly named download.
  3. On any fetch/permission error, fall back to `window.open(url, "_blank")` and, failing that, show a
     short inline error.
- **`pending` (live):** caption *"Preparing the PDF…"* + a **"Check again"** button that calls
  `fetchSignedFormPdfPath(id, formId)`; if it returns a path, store it in local component state and flip
  the section to `ready` (no full reload). A brief inline error on failure; the user can retry.

No change to how the page loads the signature (`signatureUrl` still works, now via `fileDownloadUrl`).

## 4. Testing & verification

- **TDD (offline):** `pdfAvailability` + `pdfFilename` (`src/lib/demo/__tests__/form-pdf.test.ts`). Existing
  suite stays green; `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean before PR.
- **Demo smoke (preview):** move `.env.local` aside so the app runs demo mode; as a nurse, open a signed
  form's view and confirm the **disabled** "Download PDF" with the live-only caption. Restore `.env.local`.
- **Live (manual, owner, TEST account):** sign a consent for a TEST patient → wait a few seconds for the
  Function → reload the form view → "Download PDF" downloads the server PDF with the signature embedded;
  immediately after signing (before the Function finishes) the section shows `pending` and "Check again"
  resolves it. Append a **"Consent PDF"** subsection to `docs/superpowers/firebase-live-verification.md`.

## 5. Caveats

1. **Async render lag** — the PDF appears seconds after signing; the `pending` state + "Check again" cover
   it. We do not block the signing flow on the PDF.
2. **Demo has no PDF** — by design (no Functions). The control is disabled, not faked.
3. **No client-side PDF rendering** — we surface the server artefact only (decision 2a, option a).
4. **Cross-origin filename** — we fetch the Storage URL to a blob to honour `pdfFilename`; if the fetch is
   blocked we fall back to opening the URL (the browser then names it from the Storage response).

## Out of scope

Remote signing channels (email/QR/share link) + their handling — that's increment **2b**, a separate
spec/plan/PR that reuses the existing Firebase-hosted `sign.html` (the `createFormLink` URL target).
Client-rendered/fallback PDFs; editing signed forms; consent versioning beyond the snapshot; a Storage
cleanup Function for orphaned objects (a carried-over follow-up).

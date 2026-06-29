# Consent PDF Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Download PDF" affordance to the signed-form read-only view that surfaces the server-rendered consent PDF (`finalizeSignedForm` → `pdfFileId`) in live mode, and shows a disabled "live-only" state in demo mode.

**Architecture:** A tiny pure state-machine + filename helper (TDD); a generic Storage download-URL resolver plus a live Firestore re-read for the async-rendered `pdfFileId`; a new "Document" section in the form view page that branches on `ready | pending | unavailable`.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest; Firebase v11 (`firebase/storage`, `firebase/firestore`). No new dependencies.

**Source of truth:** `docs/superpowers/specs/2026-06-29-consent-pdf-design.md`; iOS `backend/functions/src/{formFinalize,formPdf}.ts`; `backend/storage.rules`.

**Existing context (read these — already implemented in increment 1, PR #9):**
- `src/lib/demo/types.ts` — `SignedFormRecord` (has `pdfFileId?: string`).
- `src/lib/demo/forms.ts` — `templateDisplayName`, `formTemplate`, `FormTemplateKind`.
- `src/lib/firebase/mappers.ts` — `mapForm(id, patientID, data)` reads `pdfFileId` from `data.pdfFileId`.
- `src/lib/firebase/storage.ts` — `uploadSignature`, `signatureUrl` (currently `getDownloadURL(ref(storage(), path))`).
- `src/lib/firebase/client.ts` — `firestore()`, `storage()` (lazy accessors).
- `src/lib/demo/store.tsx` — `useDemoStore()` returns `{ status, state, formsForPatient, deleteForm, ... }`; `Status = "demo" | "loading" | "ready" | "error"`.
- `src/app/app/patients/[id]/forms/[formId]/page.tsx` — the read-only form view we extend.

---

## Task 1: Pure PDF helpers (TDD)

**Files:**
- Create: `src/lib/demo/formPdf.ts`
- Test: `src/lib/demo/__tests__/form-pdf.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/demo/__tests__/form-pdf.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { pdfAvailability, pdfFilename } from "@/lib/demo/formPdf";

describe("pdfAvailability", () => {
  it("is unavailable in demo mode regardless of pdfFileId", () => {
    expect(pdfAvailability({ pdfFileId: "patients/p/forms/f.pdf" }, false)).toBe("unavailable");
  });
  it("is ready in live mode when a pdfFileId is present", () => {
    expect(pdfAvailability({ pdfFileId: "patients/p/forms/f.pdf" }, true)).toBe("ready");
  });
  it("is pending in live mode when pdfFileId is missing or empty", () => {
    expect(pdfAvailability({ pdfFileId: undefined }, true)).toBe("pending");
    expect(pdfAvailability({ pdfFileId: "" }, true)).toBe("pending");
  });
});

describe("pdfFilename", () => {
  it("formats display name, patient, and signing date", () => {
    const millis = new Date(2026, 5, 29, 10, 30).getTime();
    expect(pdfFilename("Antiwrinkle Consent", "Claire D", millis)).toBe("Antiwrinkle Consent — Claire D — 2026-06-29.pdf");
  });
  it("strips illegal filename characters and collapses whitespace", () => {
    const millis = new Date(2026, 0, 2).getTime();
    expect(pdfFilename('HA/Filler:  Consent', 'A"B', millis)).toBe("HAFiller Consent — AB — 2026-01-02.pdf");
  });
  it("omits an empty patient name", () => {
    const millis = new Date(2026, 0, 2).getTime();
    expect(pdfFilename("Consent", "", millis)).toBe("Consent — 2026-01-02.pdf");
  });
});
```

- [ ] **Step 2: Run** — `npm test -- form-pdf` → FAIL ("Cannot find module .../formPdf").

- [ ] **Step 3: Implement `src/lib/demo/formPdf.ts`:**
```ts
// Pure helpers for the consent PDF download. No Firebase/React imports (unit-tested).
import type { SignedFormRecord } from "./types";

// Demo mode has no Cloud Function, so no server PDF exists. In live mode the PDF is
// rendered asynchronously after the form is created, so a just-signed record may not
// carry pdfFileId yet ("pending") until the finalizeSignedForm Function writes it.
export function pdfAvailability(
  record: Pick<SignedFormRecord, "pdfFileId">,
  isLive: boolean,
): "ready" | "pending" | "unavailable" {
  if (!isLive) return "unavailable";
  return record.pdfFileId && record.pdfFileId.length > 0 ? "ready" : "pending";
}

// A human, filesystem-safe download name, e.g. "Antiwrinkle Consent — Claire D — 2026-06-29.pdf".
export function pdfFilename(displayName: string, patientName: string, signedAtMillis: number): string {
  const d = new Date(signedAtMillis);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const clean = (s: string) => s.replace(/[/\\:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
  const parts = [clean(displayName), clean(patientName), date].filter(Boolean);
  return `${parts.join(" — ")}.pdf`;
}
```

- [ ] **Step 4: Run** — `npm test -- form-pdf` → PASS.
- [ ] **Step 5: Commit**
```bash
git add src/lib/demo/formPdf.ts src/lib/demo/__tests__/form-pdf.test.ts
git commit -m "feat(forms): pure PDF availability + filename helpers (TDD)"
```

---

## Task 2: Storage resolver + live pdfFileId re-read

**Files:**
- Modify: `src/lib/firebase/storage.ts`
- Create: `src/lib/firebase/forms.ts`

- [ ] **Step 1: Edit `src/lib/firebase/storage.ts`** — add a generic resolver and route `signatureUrl` through it. Replace the whole file with:
```ts
"use client";

import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "./client";

// Generic: resolve a Storage path to an authenticated download URL.
// (Storage rules permit a patientVisible user to read patients/{id}/forms/**
// and the signatures path.)
export async function fileDownloadUrl(path: string): Promise<string> {
  return getDownloadURL(ref(storage(), path));
}

// Signatures go under patients/{id}/signatures/{formId}.png — NOT patients/{id}/forms/**
// (the Storage rules make the forms/ path Function-only). The catch-all patient path
// allows image uploads by a patientVisible user.
export async function uploadSignature(patientID: string, formId: string, png: Blob): Promise<string> {
  const path = `patients/${patientID}/signatures/${formId}.png`;
  await uploadBytes(ref(storage(), path), png, { contentType: "image/png" });
  return path;
}

export async function signatureUrl(path: string): Promise<string> {
  return fileDownloadUrl(path);
}
```

- [ ] **Step 2: Create `src/lib/firebase/forms.ts`:**
```ts
"use client";

import { doc, getDoc } from "firebase/firestore";
import { firestore } from "./client";
import { mapForm } from "./mappers";

// Live-only: re-read a signed form doc to get its current pdfFileId. The
// finalizeSignedForm Function renders the PDF asynchronously after the form is
// created, so a just-signed form's local record may not carry pdfFileId yet.
// Returns the Storage path, or null if the doc is gone or the PDF isn't ready.
export async function fetchSignedFormPdfPath(patientID: string, formId: string): Promise<string | null> {
  const snap = await getDoc(doc(firestore(), `patients/${patientID}/forms`, formId));
  if (!snap.exists()) return null;
  return mapForm(formId, patientID, snap.data() as Record<string, unknown>).pdfFileId ?? null;
}
```

- [ ] **Step 3: Run** — `npx tsc --noEmit` → clean; `npm test` → still all green (existing `signatureUrl` callers unaffected; `firebase/firestore` exports `doc`/`getDoc` in the installed v11, same as `mirror.ts` uses `doc`).
- [ ] **Step 4: Commit**
```bash
git add src/lib/firebase/storage.ts src/lib/firebase/forms.ts
git commit -m "feat(forms): generic Storage download URL + live pdfFileId re-read"
```

---

## Task 3: "Download PDF" section on the form view

**Files:**
- Modify: `src/app/app/patients/[id]/forms/[formId]/page.tsx`

- [ ] **Step 1: Add the import.** After line 9 (`import { templateDisplayName, formTemplate } from "@/lib/demo/forms";`), add:
```tsx
import { pdfAvailability, pdfFilename } from "@/lib/demo/formPdf";
```

- [ ] **Step 2: Add component state.** After the existing `const [confirming, setConfirming] = useState(false);` line, add:
```tsx
  const [pdfPath, setPdfPath] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
```

- [ ] **Step 3: Add derived values + handlers.** Immediately after the existing `const questions = formTemplate(form.template).questions;` line (after the `if (!patient || !form) return ...` guard, so `form`/`patient` are non-null), add:
```tsx
  const isLive = store.status !== "demo";
  const effectivePdfPath = pdfPath ?? form.pdfFileId ?? null;
  const pdfState = pdfAvailability({ pdfFileId: effectivePdfPath ?? undefined }, isLive);

  async function downloadPdf() {
    if (!effectivePdfPath) return;
    setPdfBusy(true);
    setPdfError(null);
    try {
      const { fileDownloadUrl } = await import("@/lib/firebase/storage");
      const url = await fileDownloadUrl(effectivePdfPath);
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("fetch failed");
        const blob = await res.blob();
        const name = pdfFilename(
          templateDisplayName(form!.template),
          `${patient!.givenName} ${patient!.lastName}`.trim(),
          form!.signedAt,
        );
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objUrl;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(objUrl);
      } catch {
        // Cross-origin/CORS or transient failure: open the URL so the browser
        // can still render/save the PDF (named from the Storage response).
        window.open(url, "_blank", "noopener");
      }
    } catch {
      setPdfError("Could not download the PDF. Please try again.");
    } finally {
      setPdfBusy(false);
    }
  }

  async function checkAgain() {
    setChecking(true);
    setPdfError(null);
    try {
      const { fetchSignedFormPdfPath } = await import("@/lib/firebase/forms");
      const path = await fetchSignedFormPdfPath(id, formId);
      if (path) setPdfPath(path);
      else setPdfError("The PDF is still being prepared. Try again in a moment.");
    } catch {
      setPdfError("Could not check the PDF status. Please try again.");
    } finally {
      setChecking(false);
    }
  }
```

- [ ] **Step 4: Add the JSX section.** Between the Signature block (the closing `)}` after the `resolvedSigUrl` ternary, line ~75) and the `{perms.canSendForms && (` delete block, insert:
```tsx
      <h2 className="mt-6 font-display text-lg text-ink">Document</h2>
      {pdfState === "unavailable" ? (
        <div className="mt-2">
          <button type="button" disabled className="rounded-btn border border-line px-4 py-2 text-sm text-ink-soft opacity-50">
            Download PDF
          </button>
          <p className="mt-1.5 text-sm text-ink-soft">The server-rendered PDF is available in live mode.</p>
        </div>
      ) : pdfState === "ready" ? (
        <div className="mt-2">
          <button type="button" onClick={downloadPdf} disabled={pdfBusy}
            className="rounded-btn px-4 py-2 text-sm font-medium text-card disabled:opacity-50" style={{ background: "var(--color-tint)" }}>
            {pdfBusy ? "Downloading…" : "Download PDF"}
          </button>
          {pdfError && <p className="mt-1.5 text-sm" style={{ color: "var(--color-rose)" }}>{pdfError}</p>}
        </div>
      ) : (
        <div className="mt-2">
          <p className="text-sm text-ink-soft">Preparing the PDF…</p>
          <button type="button" onClick={checkAgain} disabled={checking}
            className="mt-2 rounded-btn border border-line px-4 py-2 text-sm text-ink-soft hover:border-tint disabled:opacity-50">
            {checking ? "Checking…" : "Check again"}
          </button>
          {pdfError && <p className="mt-1.5 text-sm" style={{ color: "var(--color-rose)" }}>{pdfError}</p>}
        </div>
      )}

```

- [ ] **Step 5: Run** — `npx tsc --noEmit` → clean; `npm run lint` → clean (no `no-img-element` added here; dynamic `import()` in handlers is fine); `npm run build` → `/app/patients/[id]/forms/[formId]` compiles.
- [ ] **Step 6: Commit**
```bash
git add "src/app/app/patients/[id]/forms/[formId]/page.tsx"
git commit -m "feat(forms): download consent PDF (live) + live-only demo state"
```

---

## Task 4: Verification gate + demo smoke + live doc + PR

- [ ] **Step 1: Offline gate** — run and confirm all green:
```bash
rm -rf .next && npm run lint && npx tsc --noEmit && npm test && npm run build
```
Expected: lint clean; tsc clean; all tests pass incl. `form-pdf`; build compiles the form view route.

- [ ] **Step 2: Demo-mode smoke (preview).** If `.env.local` exists, move it aside so the app runs demo mode:
```bash
[ -f .env.local ] && mv .env.local .env.local.bak || true
```
Start the dev server (preview tools). As **Sarah (nurse)** on her patient **Claire**: open an existing signed consent (or sign one first via "Sign a consent"), open the form's read-only view, scroll to **Document** → confirm a **disabled** "Download PDF" button with the caption *"The server-rendered PDF is available in live mode."* Capture a screenshot. Then restore:
```bash
[ -f .env.local.bak ] && mv .env.local.bak .env.local || true
```

- [ ] **Step 3: Document live verification** — append this subsection to `docs/superpowers/firebase-live-verification.md` (after the "Consent signing — live checks" section):
```markdown
## Consent PDF download — live checks (manual, owner-run, TEST account only)

With `.env.local` set (live mode), signed in as a **TEST** account that can view a test patient's forms:
1. Sign a consent for a TEST patient (or open one signed moments ago) → on the form's read-only view,
   the **Document** section shows **"Preparing the PDF…"** with a **"Check again"** button while the
   `finalizeSignedForm` Function renders (typically a few seconds).
2. Click **Check again** until it flips to an enabled **"Download PDF"** (or reload the page once the
   Function has run — re-hydrate picks up `pdfFileId`).
3. Click **Download PDF** → the browser downloads the server-rendered PDF named like
   `Antiwrinkle Consent — <Patient> — <date>.pdf`. Confirm it contains the template name, patient,
   signing timestamp, the full clause text, the responses, and the **embedded signature**.
4. Confirm in the Firebase console: the form doc `patients/{id}/forms/{formId}` now has
   `pdfFileId: patients/{id}/forms/{formId}.pdf`, and that object exists in Storage.

⚠️ **Timing note:** the PDF is rendered asynchronously on form-create, so it is normal for the section
to show "Preparing the PDF…" immediately after signing. It is read-only here — the web client never
writes the PDF (Storage rules make `patients/{id}/forms/**` Function-only).
```

- [ ] **Step 4: Commit + PR**
```bash
git add docs/superpowers/firebase-live-verification.md
git commit -m "docs(forms): live verification checklist for consent PDF download"
```
Open the PR with `/create-pr` (base `main`). PR body notes: increment 2a (PDF download only); surfaces the existing `finalizeSignedForm` server PDF via Storage download URL; demo mode shows a disabled live-only state; async render handled by a `pending` + "Check again" state; remote signing channels (2b) are a separate follow-up; no new dependencies.

---

## Self-Review Notes

- **Spec coverage:** pure `pdfAvailability` + `pdfFilename` (design §1 → T1) ✓; `fileDownloadUrl` + `signatureUrl` refactor + `fetchSignedFormPdfPath` (design §2 → T2) ✓; Document section with `unavailable`/`ready`/`pending` states + blob download with window.open fallback (design §3 → T3) ✓; offline gate + demo smoke + live doc + PR (design §4 → T4) ✓; caveats (async lag via `pending`, demo disabled, no client render, cross-origin filename fallback) reflected in T3/T4 ✓.
- **Type consistency:** `pdfAvailability(record, isLive)` / `pdfFilename(displayName, patientName, signedAtMillis)` (T1) are used exactly so in T3; `fileDownloadUrl(path)` (T2) used in T3's `downloadPdf`; `fetchSignedFormPdfPath(patientID, formId)` (T2) used in T3's `checkAgain`; `mapForm(id, patientID, data)` reused in T2 matches `mappers.ts`. `store.status` ("demo") matches `Status` union.
- **Rules alignment:** read-only; `getDownloadURL` on `patients/{id}/forms/{formId}.pdf` is permitted for a `patientVisible` user; no client writes to the Function-only forms path.
- **No placeholders:** every step has full code/commands.

# Remote Consent Signing Channels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a clinician generate a single-use consent signing link from a patient file and deliver it via copy/share, QR code, or email (mailto), pointing at the already-deployed public `sign.html`.

**Architecture:** A small pure helper module (templates/url/email — TDD); a thin `createFormLink` callable wrapper; a `functions()` region fix; a new remote-signing page that mints the link (live) or simulates it (demo) and presents the three channels with a client-generated QR.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest; Firebase v11 (`firebase/functions`); `qrcode` (new dep, local generation).

**Source of truth:** `docs/superpowers/specs/2026-06-29-remote-signing-design.md`; iOS `backend/functions/src/{formLinks,globalOptions}.ts`.

**Existing context (already in `main`, increment 1 / PR #9):**
- `src/lib/demo/forms.ts` — `FORM_TEMPLATE_KINDS`, `FormTemplateKind`, `templateDisplayName`.
- `src/lib/firebase/client.ts` — `functions()` = `getFunctions(getFirebaseApp())` (no region — to fix).
- `src/lib/firebase/mirror.ts` — callable pattern: `httpsCallable(functions(), "name")({...})`.
- `src/lib/demo/store.tsx` — `useDemoStore()` → `{ status, state, ... }`; `Status = "demo" | "loading" | "ready" | "error"`.
- `src/lib/demo/auth.ts` — `useDemoAuth()` → `{ identity }`.
- `src/lib/demo/backend.ts` — `patientPermissions(identity, patient)` → `{ canSendForms, ... }`.
- `src/app/app/patients/[id]/page.tsx:118-125` — the Consent forms header with the "Sign a consent" Link.

---

## Task 1: `functions()` region fix

**Files:**
- Modify: `src/lib/firebase/client.ts`

- [ ] **Step 1: Edit `functions()`.** Replace the existing accessor:
```ts
export function functions(): Functions {
  return getFunctions(getFirebaseApp());
}
```
with (add the region constant directly above it):
```ts
// All Cloud Functions are pinned to australia-southeast1 (data residency; see
// backend globalOptions.ts and the iOS client). The web client must target the
// same region or every callable resolves to the wrong (default) region.
const FUNCTIONS_REGION = "australia-southeast1";
export function functions(): Functions {
  return getFunctions(getFirebaseApp(), FUNCTIONS_REGION);
}
```

- [ ] **Step 2: Run** — `npx tsc --noEmit` → clean; `npm test` → all green (no test exercises live Functions; this is a config correction).
- [ ] **Step 3: Commit**
```bash
git add src/lib/firebase/client.ts
git commit -m "fix(firebase): pin callables to australia-southeast1 region"
```

---

## Task 2: Pure remote-signing helpers (TDD)

**Files:**
- Create: `src/lib/demo/remoteSigning.ts`
- Test: `src/lib/demo/__tests__/remote-signing.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/demo/__tests__/remote-signing.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  remoteSigningTemplateKinds, formSigningUrl, consentEmail, mailtoHref, FORM_LINK_BASE_URL,
} from "@/lib/demo/remoteSigning";

describe("remoteSigningTemplateKinds", () => {
  it("excludes the aesthetic history intake", () => {
    expect(remoteSigningTemplateKinds()).not.toContain("aestheticHistory");
  });
  it("keeps the six consent templates", () => {
    expect(remoteSigningTemplateKinds()).toHaveLength(6);
    expect(remoteSigningTemplateKinds()).toContain("antiwrinkleConsent");
  });
});

describe("formSigningUrl", () => {
  it("builds the public /s/{token} url", () => {
    expect(formSigningUrl("abc123")).toBe(`${FORM_LINK_BASE_URL}/s/abc123`);
  });
});

describe("consentEmail", () => {
  it("greets the patient by name and includes the link and single-use note", () => {
    const { subject, body } = consentEmail("Claire", "https://x/s/t");
    expect(subject.length).toBeGreaterThan(0);
    expect(body).toContain("Claire");
    expect(body).toContain("https://x/s/t");
    expect(body).toContain("once");
  });
  it("falls back to a generic greeting when no name", () => {
    expect(consentEmail("", "https://x/s/t").body.startsWith("Hi,")).toBe(true);
  });
});

describe("mailtoHref", () => {
  it("encodes subject and body and targets the address", () => {
    const href = mailtoHref("p@example.com", "Sign & return", "line1\nline2");
    expect(href.startsWith("mailto:p@example.com?")).toBe(true);
    expect(href).toContain("subject=Sign%20%26%20return");
    expect(href).toContain("body=line1%0Aline2");
  });
});
```

- [ ] **Step 2: Run** — `npm test -- remote-signing` → FAIL ("Cannot find module .../remoteSigning").

- [ ] **Step 3: Implement `src/lib/demo/remoteSigning.ts`:**
```ts
// Pure helpers for remote consent signing links. No Firebase/React imports.
import { FORM_TEMPLATE_KINDS, type FormTemplateKind } from "./forms";

// Matches the backend createFormLink default (FORMS_BASE_URL).
export const FORM_LINK_BASE_URL = "https://aestheticx-91e6b.web.app";

// The deployed public sign.html only renders consent-style questions, so the
// Aesthetic History intake is not offered for remote signing.
export function remoteSigningTemplateKinds(): FormTemplateKind[] {
  return FORM_TEMPLATE_KINDS.filter((k) => k !== "aestheticHistory");
}

export function formSigningUrl(token: string): string {
  return `${FORM_LINK_BASE_URL}/s/${token}`;
}

export function consentEmail(patientName: string, url: string): { subject: string; body: string } {
  const greeting = patientName ? `Hi ${patientName},` : "Hi,";
  const subject = "Your consent form to sign";
  const body = [
    greeting,
    "",
    "Please review and sign your consent form using this secure link:",
    url,
    "",
    "This link expires in 7 days and can be used once.",
  ].join("\n");
  return { subject, body };
}

export function mailtoHref(email: string, subject: string, body: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
```

- [ ] **Step 4: Run** — `npm test -- remote-signing` → PASS.
- [ ] **Step 5: Commit**
```bash
git add src/lib/demo/remoteSigning.ts src/lib/demo/__tests__/remote-signing.test.ts
git commit -m "feat(forms): pure remote-signing helpers (templates/url/email, TDD)"
```

---

## Task 3: `createFormLink` callable wrapper

**Files:**
- Create: `src/lib/firebase/formLinks.ts`

- [ ] **Step 1: Implement `src/lib/firebase/formLinks.ts`:**
```ts
"use client";

import { httpsCallable } from "firebase/functions";
import { functions } from "./client";
import type { FormTemplateKind } from "@/lib/demo/forms";

export interface CreatedFormLink {
  token: string;
  url: string;
}

// Mints a single-use signing link via the backend createFormLink onCall Function.
// Returns the patient-facing URL (pointing at the deployed sign.html).
export async function createFormLink(patientID: string, template: FormTemplateKind): Promise<CreatedFormLink> {
  const res = await httpsCallable(functions(), "createFormLink")({ patientId: patientID, template });
  const data = res.data as { token?: string; url?: string };
  if (!data?.url) throw new Error("createFormLink returned no url");
  return { token: data.token ?? "", url: data.url };
}
```

- [ ] **Step 2: Run** — `npx tsc --noEmit` → clean; `npm test` → all green.
- [ ] **Step 3: Commit**
```bash
git add src/lib/firebase/formLinks.ts
git commit -m "feat(forms): createFormLink callable wrapper"
```

---

## Task 4: Add the `qrcode` dependency

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install** (runtime + types):
```bash
npm install qrcode && npm install -D @types/qrcode
```

- [ ] **Step 2: Verify** the import resolves and types are present:
```bash
node -e "require('qrcode').toDataURL('https://x/s/t').then(u=>console.log(u.slice(0,30)))"
```
Expected: prints a `data:image/png;base64,` prefix. If `qrcode` fails to install, STOP and report.

- [ ] **Step 3: Commit**
```bash
git add package.json package-lock.json
git commit -m "build(deps): add qrcode for signing-link QR generation"
```

---

## Task 5: Remote signing page + entry point

**Files:**
- Create: `src/app/app/patients/[id]/consent/remote/page.tsx`
- Modify: `src/app/app/patients/[id]/page.tsx:118-125`

- [ ] **Step 1: Create `src/app/app/patients/[id]/consent/remote/page.tsx`:**
```tsx
"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { patientPermissions } from "@/lib/demo/backend";
import { templateDisplayName, type FormTemplateKind } from "@/lib/demo/forms";
import { remoteSigningTemplateKinds, consentEmail, mailtoHref, formSigningUrl } from "@/lib/demo/remoteSigning";

export default function RemoteConsentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  const [kind, setKind] = useState<FormTemplateKind>("antiwrinkleConsent");
  const [url, setUrl] = useState<string | null>(null);
  const [demoLink, setDemoLink] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!identity) return null;
  if (store.status === "loading") return <p className="text-ink-soft">Loading…</p>;
  const patient = store.state.patients[id];
  if (!patient || !patientPermissions(identity, patient).canSendForms) {
    return <p className="text-ink-soft">You can&apos;t send forms for this patient.</p>;
  }
  const isLive = store.status !== "demo";

  function reset() {
    setUrl(null);
    setQr(null);
    setCopied(false);
    setError(null);
  }

  async function generate() {
    setBusy(true);
    setError(null);
    setCopied(false);
    setQr(null);
    try {
      let linkUrl: string;
      if (isLive) {
        const { createFormLink } = await import("@/lib/firebase/formLinks");
        linkUrl = (await createFormLink(id, kind)).url;
        setDemoLink(false);
      } else {
        linkUrl = formSigningUrl(crypto.randomUUID());
        setDemoLink(true);
      }
      setUrl(linkUrl);
      const { default: QRCode } = await import("qrcode");
      setQr(await QRCode.toDataURL(linkUrl, { width: 220, margin: 1 }));
    } catch {
      setError("Could not generate a signing link. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setError("Could not copy automatically — select the link and copy it manually.");
    }
  }

  const email = url ? consentEmail(`${patient.givenName} ${patient.lastName}`.trim(), url) : null;

  return (
    <div className="max-w-2xl">
      <Link href={`/app/patients/${id}`} className="text-sm text-ink-soft hover:text-ink">← Back to patient</Link>
      <h1 className="mt-3 font-display text-3xl text-ink">Send a consent to sign</h1>
      <p className="mt-1 text-ink-soft">Generate a single-use link the patient can open to sign on their own device.</p>

      <label className="mt-5 block">
        <span className="micro">Form</span>
        <select value={kind} onChange={(e) => { setKind(e.target.value as FormTemplateKind); reset(); }}
          className="mt-1.5 w-full rounded-field border border-line bg-card px-3 py-2 text-ink">
          {remoteSigningTemplateKinds().map((k) => <option key={k} value={k}>{templateDisplayName(k)}</option>)}
        </select>
      </label>

      <div className="mt-5">
        <button type="button" onClick={generate} disabled={busy}
          className="rounded-btn px-5 py-2.5 text-sm font-medium text-card disabled:opacity-50" style={{ background: "var(--color-tint)" }}>
          {busy ? "Generating…" : url ? "Generate another" : "Generate signing link"}
        </button>
      </div>

      {error && <p className="mt-3 text-sm" style={{ color: "var(--color-rose)" }}>{error}</p>}

      {url && (
        <div className="mt-6 rounded-card border border-line bg-card p-5">
          {demoLink && (
            <p className="mb-3 rounded-inner border-l-4 p-2 text-sm"
              style={{ borderColor: "var(--color-tint)", background: "var(--color-tint-soft)" }}>
              Demo link — not a live link. In live mode this is a tokenised, single-use URL minted by the server.
            </p>
          )}
          <span className="micro">Signing link</span>
          <div className="mt-1.5 flex items-center gap-2">
            <input readOnly value={url} className="w-full rounded-field border border-line bg-card px-3 py-2 text-sm text-ink" />
            <button type="button" onClick={copy}
              className="whitespace-nowrap rounded-btn border border-line px-3 py-2 text-sm text-ink-soft hover:border-tint">
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          {qr && (
            <div className="mt-5">
              <span className="micro">QR code</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="Signing link QR code" width={220} height={220}
                className="mt-1.5 rounded-inner border border-line bg-card" />
            </div>
          )}

          {email && (
            <div className="mt-5">
              <a href={mailtoHref(patient.email, email.subject, email.body)}
                className="inline-block rounded-btn border border-line px-4 py-2 text-sm text-ink-soft hover:border-tint">
                Email to {patient.email || "patient"}
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the entry point** in `src/app/app/patients/[id]/page.tsx`. Replace the Consent forms header's permission block (lines 120-124):
```tsx
          {perms.canSendForms && (
            <Link href={`/app/patients/${id}/consent`} className="rounded-btn px-3 py-1.5 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>
              Sign a consent
            </Link>
          )}
```
with:
```tsx
          {perms.canSendForms && (
            <div className="flex items-center gap-2">
              <Link href={`/app/patients/${id}/consent/remote`} className="rounded-btn border border-line px-3 py-1.5 text-sm font-medium text-ink-soft hover:border-tint">
                Send a link
              </Link>
              <Link href={`/app/patients/${id}/consent`} className="rounded-btn px-3 py-1.5 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>
                Sign a consent
              </Link>
            </div>
          )}
```

- [ ] **Step 3: Run** — `npx tsc --noEmit` → clean; `npm run lint` → clean (the `<img>` carries the `no-img-element` disable comment); `npm run build` → `/app/patients/[id]/consent/remote` compiles.
- [ ] **Step 4: Commit**
```bash
git add "src/app/app/patients/[id]/consent/remote/page.tsx" "src/app/app/patients/[id]/page.tsx"
git commit -m "feat(forms): remote consent signing page (link/QR/email) + entry point"
```

---

## Task 6: Verification gate + demo smoke + live doc + PR

- [ ] **Step 1: Offline gate** — all green:
```bash
rm -rf .next && npm run lint && npx tsc --noEmit && npm test && npm run build
```
Expected: lint (no new errors); tsc clean; tests pass incl. `remote-signing`; build compiles the new route.

- [ ] **Step 2: Demo smoke (preview).** Move `.env.local` aside if present:
```bash
[ -f .env.local ] && mv .env.local .env.local.bak || true
```
Start the dev server (preview tools). As **Sarah (nurse)** on patient **Claire** (`p-2`): open the patient → **Send a link** → pick a consent → **Generate signing link** → confirm: the **"Demo link — not a live link"** banner, a rendered **QR image**, **Copy** flips to "Copied", and the **Email** button is a `mailto:` to the patient. Capture a screenshot. Restore:
```bash
[ -f .env.local.bak ] && mv .env.local.bak .env.local || true
```

- [ ] **Step 3: Document live verification** — in `docs/superpowers/firebase-live-verification.md`, replace the trailing note:
```markdown
Note: PDF download and remote signing channels (email/QR/link) are **not** in this increment — the view
renders the full text + signature instead.
```
with:
```markdown
Note: PDF download ships separately (increment 2a). Remote signing channels are covered next.

## Remote consent signing — live checks (manual, owner-run, TEST account only)

With `.env.local` set (live mode), signed in as a **TEST** account that can send forms for a test patient:
1. Open the test patient → **Consent forms** → **Send a link** → pick a consent template →
   **Generate signing link**. Confirm in the Firestore console a new **`formLinks/{token}`** doc with
   `used: false`, `patientId`, `template`, `createdAtMillis`, and an `autofill` block.
2. **Copy** the link (or scan the **QR**) and open `https://aestheticx-91e6b.web.app/s/{token}` in a
   separate browser/incognito (no app login) → the public page loads the consent with the patient's
   autofill, answer the questions, draw a signature, submit → "Signed — thank you".
3. Confirm the `formLinks/{token}` doc flips to `used: true` (`usedAtMillis` set), and a new
   **`patients/{id}/forms/{formId}`** doc appears with `channel: webLink`. Re-open the link → it shows
   expired/used (single-use burn).
4. Re-hydrate the app (re-sign-in) → the signed form appears under the patient's **Consent forms**.
5. The **Email** button opens the local mail client prefilled to the patient with the link in the body
   (the app does not send email itself).

⚠️ **Notes:** remote links are offered for **consent templates only** (the public page does not render the
Aesthetic History intake). The app cannot show link status (the `formLinks` collection is Functions-only).
```

- [ ] **Step 4: Commit + PR**
```bash
git add docs/superpowers/firebase-live-verification.md
git commit -m "docs(forms): live verification checklist for remote signing"
```
Open the PR with `/create-pr` (base `main`). PR body notes: increment 2b (remote signing channels); calls `createFormLink` and presents the link via copy/QR/mailto; **includes a shared `functions()` region fix** (australia-southeast1) that also corrects increment-1 callables; demo mode simulates a same-shape link; consent-only (excludes Aesthetic History); adds the `qrcode` dependency; the public signing page is unchanged.

---

## Self-Review Notes

- **Spec coverage:** region fix (design §1 → T1) ✓; pure helpers `remoteSigningTemplateKinds`/`formSigningUrl`/`consentEmail`/`mailtoHref` (design §2 → T2) ✓; `createFormLink` wrapper (design §3 → T3) ✓; `qrcode` dep (design §6 → T4) ✓; remote page with copy/QR/email + demo banner + entry point (design §4 → T5) ✓; tests + demo smoke + live doc + PR (design §5 → T6) ✓; caveats (consent-only, no link status, mailto-only, public page unchanged) reflected in T5/T6 ✓.
- **Type consistency:** `remoteSigningTemplateKinds()`/`formSigningUrl(token)`/`consentEmail(name, url)`/`mailtoHref(email, subject, body)` (T2) used exactly so in T5; `createFormLink(patientID, template): { token, url }` (T3) used in T5; `FormTemplateKind` from `@/lib/demo/forms` consistent across T2/T3/T5; `store.status`/`patientPermissions().canSendForms` match the codebase.
- **No placeholders:** every step has full code/commands.
- **Security:** QR generated locally (no third-party); `mailto:` keeps the human in the loop; the link itself is the only PHI vector (single-use, 7-day TTL, by design).

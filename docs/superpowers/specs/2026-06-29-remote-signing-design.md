# Design: remote consent signing channels (increment 2b)

**Date:** 2026-06-29
**Status:** Approved (brainstorming) — pending spec review
**Repo:** `Aestheticx-marketing` (branch `claude/consent-remote-channels`, off `main`)
**Source of truth:** iOS/Firebase backend `backend/functions/src/{formLinks,formLinkPolicy,globalOptions}.ts`,
`backend/web/sign.html`, `backend/firestore.rules`; iOS `AXDomain/Forms.swift` (`SigningChannel`),
`AXFeatures/FormSigningView.swift` (link/QR UX). Web increment 1 (PR #9) for the existing forms types.

## Goal

From a patient file, let a clinician generate a **single-use, tokenised signing link** for a consent and
deliver it three ways — **copy/share**, **QR code**, **email (mailto)** — so the patient signs on the
already-deployed public page (`https://aestheticx-91e6b.web.app/s/{token}`). This is increment **2b**;
the PDF download is the separate 2a PR (#10).

We do **not** build, host, or poll the public signing page — it already exists and is owned by the
backend repo. Our job ends at minting + presenting the link. The signed form arrives back through the
normal hydrate once the patient submits (the backend writes `patients/{id}/forms/{formId}` with
`channel: webLink`).

## Backend contract (already deployed; we only consume `createFormLink`)

- `createFormLink` — **onCall**, region `australia-southeast1`. Input `{ patientId, template }`. Requires
  auth. Reads the patient doc for autofill demographics, writes `formLinks/{token}` (`used:false`,
  `createdAtMillis`, 7-day TTL, `autofill`), returns **`{ token, url }`** where
  `url = ${FORMS_BASE_URL}/s/{token}` (default base `https://aestheticx-91e6b.web.app`).
- `getFormLink` / `submitFormLink` — public onRequest, used by `sign.html` only. **Not called by our app.**
- `formLinks/{token}` rules: `allow read, write: if false` — Functions-only. So our app **cannot** read
  link status; it only holds the `{ token, url }` the callable returned.
- The public `sign.html` renders the **two confirm questions + generic clauses** for any template — it
  does not render the 10-question Aesthetic History intake. Hence remote links are **consent-only**.

## 1. Region fix (shared `client.ts`, required)

All Cloud Functions are pinned to `australia-southeast1` (`setGlobalOptions({ region })` in
`globalOptions.ts`; the iOS client targets the same region). The web client's `functions()` accessor
currently calls `getFunctions(getFirebaseApp())` with the **default `us-central1`**, so every callable —
including increment-1's `approveRequest`/`consumeRepeats`/`mergePatients`/`requireEdit` — targets the
wrong region in live mode. Fix:

```ts
const FUNCTIONS_REGION = "australia-southeast1";
export function functions(): Functions {
  return getFunctions(getFirebaseApp(), FUNCTIONS_REGION);
}
```

This is required for `createFormLink` and incidentally corrects the increment-1 callables. Flagged in the
PR as a shared change. (Demo mode never calls `functions()`, so it is unaffected.)

## 2. Pure/domain layer (TDD) — new `src/lib/demo/remoteSigning.ts`

Framework-free, unit-tested with Vitest:

- `remoteSigningTemplateKinds(): FormTemplateKind[]` — `FORM_TEMPLATE_KINDS` without `"aestheticHistory"`
  (decision 4a; the public page can't render the intake questions).
- `FORM_LINK_BASE_URL = "https://aestheticx-91e6b.web.app"` and
  `formSigningUrl(token: string): string` → `${FORM_LINK_BASE_URL}/s/${token}`. Used to build **demo**
  links; in live we trust the URL the callable returns (authoritative).
- `consentEmail(patientName: string, url: string): { subject: string; body: string }` — minimal PHI
  (patient name only): a short greeting, the secure link, and "this link expires in 7 days and can be
  used once". No clinical detail.
- `mailtoHref(email: string, subject: string, body: string): string` —
  `mailto:${email}?subject=${enc}&body=${enc}` with `encodeURIComponent`.

**Tests:** `remoteSigningTemplateKinds` excludes `aestheticHistory` and keeps the six consents;
`formSigningUrl` shape; `consentEmail` contains the name + url; `mailtoHref` encodes subject/body and
targets the address.

## 3. Firebase layer — new `src/lib/firebase/formLinks.ts`

```ts
import { httpsCallable } from "firebase/functions";
import { functions } from "./client";
import type { FormTemplateKind } from "@/lib/demo/forms";

export interface CreatedFormLink { token: string; url: string }

export async function createFormLink(patientID: string, template: FormTemplateKind): Promise<CreatedFormLink> {
  const res = await httpsCallable(functions(), "createFormLink")({ patientId: patientID, template });
  const data = res.data as { token?: string; url?: string };
  if (!data?.url) throw new Error("createFormLink returned no url");
  return { token: data.token ?? "", url: data.url };
}
```

Thin adapter (not unit-tested, matching `mirror.ts`).

## 4. UI — new route `src/app/app/patients/[id]/consent/remote/page.tsx`

- Guard: `identity`, `store.status !== "loading"`, patient exists, `patientPermissions(...).canSendForms`.
- A consent-only template `<select>` (`remoteSigningTemplateKinds`, default `antiwrinkleConsent`).
- **Generate signing link** button:
  - live (`store.status !== "demo"`): `await createFormLink(id, kind)` → `{ url }`.
  - demo: `formSigningUrl(crypto.randomUUID())` + show a **"Demo link — not a live link"** banner.
- Result panel once a link exists:
  - the URL (selectable) + **Copy** (`navigator.clipboard.writeText`, with a "Copied" tick).
  - a **QR image** generated with the `qrcode` lib (`QRCode.toDataURL(url)` → `<img src=dataUrl>`).
  - an **Email** action: a `mailto:` anchor built from `consentEmail(patientName, url)` +
    `mailtoHref(patient.email, …)` (opens the clinician's mail client, prefilled to the patient).
  - a **Generate another** reset.
- Loading + error states (`createFormLink` can fail: not signed in / network / patient unreadable).
- **Entry point:** a "Send a link" link beside the existing "Sign a consent" button in the patient
  file's Consent forms header (`src/app/app/patients/[id]/page.tsx`).

## 5. Testing & verification

- **TDD (offline):** the four pure helpers (`src/lib/demo/__tests__/remote-signing.test.ts`). Existing
  suite stays green; `npm run lint`, `npx tsc --noEmit`, `npm run build` clean before PR.
- **Demo smoke (preview):** move `.env.local` aside (demo); as a nurse, open a patient → "Send a link" →
  pick a consent → Generate → confirm the **Demo link** banner, a rendered **QR**, **Copy** works, and
  the **Email** button is a `mailto:` to the patient. Restore `.env.local`.
- **Live (manual, owner, TEST account):** append a "Remote signing" section to
  `docs/superpowers/firebase-live-verification.md` — mint a link for a TEST patient (confirm a
  `formLinks/{token}` doc with `used:false`), open `/s/{token}`, sign, then confirm the link burns
  (`used:true`) and a `patients/{id}/forms/{formId}` doc appears (`channel: webLink`) and shows up in the
  patient's Consent forms after re-hydrate.

## 6. New dependency

`qrcode` (+ `@types/qrcode`, dev). Local generation to a data URL — **no PHI leaves the browser** and no
third-party QR service is used.

## 7. Caveats / out of scope

1. **Consent-only links** — Aesthetic History is excluded because the deployed `sign.html` only renders
   consent-style questions. Documented; revisiting the public page is a backend-repo concern.
2. **No in-app link status** — `formLinks/*` is Functions-only, so we can't show "sent/used/expired" in
   the app. The clinician sees the result when the signed form appears via hydrate.
3. **We don't send email** — `mailto:` hands off to the clinician's mail client (they press send); there
   is no email-sending Function and no autonomous send on the user's behalf.
4. **The public signing page is unchanged** — owned by the iOS/backend repo; we only point links at it.
5. **Link grants demographic autofill** — opening the link exposes the patient's autofill demographics
   to whoever holds it (by design, single-use + 7-day TTL). The email body itself carries only the name
   plus the link.

## Out of scope

The PDF download (2a, PR #10); editing/revoking a minted link from the app (no Function for it); changing
the public `sign.html`; consent versioning; a Storage/formLinks cleanup Function.

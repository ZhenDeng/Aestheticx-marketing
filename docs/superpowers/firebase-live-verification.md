# Live verification (manual, owner-run) — production aestheticx-91e6b

The automated suite covers the **pure** layers offline (client gate, mappers, identity, assembleState)
and the demo-mode app. The **live** Firebase path is NOT in CI and must be verified manually by the
owner against production, using a TEST account only. Do not exercise writes against real patients.

## Prerequisites (owner-provided)

1. `.env.local` filled with the Firebase **Web app** config (all six vars):
   ```
   NEXT_PUBLIC_FIREBASE_API_KEY=...
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=aestheticx-91e6b
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
   NEXT_PUBLIC_FIREBASE_APP_ID=...
   ```
2. `localhost:3000` (and the Vercel domain, for deployed use) added to **Firebase Auth → Settings →
   Authorized domains**.
3. A dedicated **TEST account** (email/password) scoped to TEST data, with the correct `roles` /
   `clinics` custom claims set (e.g. a test nurse and a test doctor so the handoff can be exercised).
4. Confirmation that the deployed `firestore.rules` is the current version.

## Steps (run locally with `.env.local` present)

1. `npm run dev`; open `/login` → it shows the **email/password** form (live mode), not preset cards.
2. Sign in with the TEST account → lands on `/app/dashboard`; the header chip reads **"Live"**.
3. `/app/patients` lists the TEST account's real patients (read path + rules OK). Search works.
4. Open a test patient → demographics, alert, notes, and active authorisations render.
5. As a TEST nurse: raise a request on a test patient → it appears immediately (optimistic). Confirm
   in the Firestore console that an `authRequests/{id}` doc was created.
6. Sign out, sign in as a TEST doctor → `/app/authorisations` shows the pending request → **Approve**.
   Confirm in the console that `approveRequest` issued the authorisation + billing event; use the
   in-app refresh (dashboard Retry / re-sign-in) to re-hydrate and see the new authorisation.
7. (Optional) Save a treatment note ticking an authorisation → confirm `consumeRepeats` decremented
   the repeat and wrote the treatment note in one transaction (no duplicate note).
8. Watch the browser console during hydrate for `permission-denied` errors. If any query is rejected
   by the rules, note the exact collection/constraint and align `src/lib/firebase/hydrate.ts` to the
   rule (the queries there mirror the iOS `LiveBackend.hydrate()` intent but must match the deployed
   rules exactly).
9. Sign out → returns to `/login`; refresh → no stale session.

## Failure behaviour

If a write fails to mirror, the app keeps the optimistic local change, shows the amber
"A change could not be saved to the server" banner, and records `lastSyncError`. The server stays
authoritative; a re-hydrate reconciles. No data is silently lost locally, but the server simply won't
have the change.

## App Check (reCAPTCHA v3) — owner steps

1. Firebase console → App Check → register the Web app with the **reCAPTCHA v3** provider; create a v3 site key.
2. Put the key in `.env.local` and Vercel as `NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY`.
3. Local dev: set `NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG=true`, run the app, and copy the debug token the SDK prints to the browser console into **App Check → Apps → Manage debug tokens**.
4. Watch App Check **metrics** (verified vs unverified requests) for **both web AND iOS**.
5. **Do NOT enable enforcement** until the iOS app also ships App Check — enforcement is project-wide and will block any unattested client (including the iOS app) from Firestore/Functions.

## Patient CRUD — live checks (manual, owner-run, TEST account only)

With `.env.local` set (live mode), signed in as a **TEST** account scoped to test data:
1. **Create:** Patients → "New patient" → fill all 9 mandatory fields → Create. Confirm a new
   `patients/{id}` doc appears in the Firestore console with `ownerType`/`ownerId` set and **no**
   `prescribingDoctorIds`.
2. **Edit:** open the test patient → Manage → Edit details → change a field → Save. Confirm the doc
   updated and `ownerType`/`ownerId`/`prescribingDoctorIds` were **not** changed.
3. **Delete:** Manage → Delete patient → confirm. The `patients/{id}` doc is removed.
   ✅ **Cascade cleanup:** the `onPatientDeleted` Cloud Function (backend `cascadeDelete.ts`, PR
   ZhenDeng/Aestheticx#39) now removes the patient's `notes`/`forms` subcollection docs **and** all of
   its `patients/{id}/…` Storage objects. Confirm in the console that the subcollections and Storage
   folder are gone shortly after delete. (Requires the backend Functions to be deployed; if you still
   see orphans, the Functions haven't been deployed to this project yet.)
4. **Merge (clinic-admin only):** sign in as a **clinic-admin** TEST account; on a clinic test patient,
   Manage → "Merge a duplicate into this file" → pick another same-clinic test patient → Merge. Confirm
   the `mergePatients` Function moved notes/forms/authorisations onto the kept patient and deleted the
   duplicate (re-hydrate to see the result). The control only appears for clinic admins.

## Consent signing — live checks (manual, owner-run, TEST account only)

With `.env.local` set (live mode), signed in as a **TEST** account that can send forms for a test patient:
1. Open the test patient → **Consent forms** → "Sign a consent" → pick a template → answer the
   screening questions → draw a signature → "Record signed consent".
2. Confirm in the Firestore console a new **`patients/{id}/forms/{formId}`** doc (with `template`,
   `channel: onDevice`, `intro`/`clauses` snapshot, `answers`, `signatureImageFileId`), and a
   **`patients/{id}/signatures/{formId}.png`** object in Storage.
3. Open the signed form's read-only view → the signature image loads via the Storage download URL, and
   the responses + full consent text render.
4. Delete a form signed in error → the `forms` doc is removed.
   ✅ **Cascade cleanup:** the `onSignedFormDeleted` Cloud Function (backend `cascadeDelete.ts`, PR
   ZhenDeng/Aestheticx#39) now deletes the form's `patients/{id}/signatures/{formId}.png` signature and
   its rendered `patients/{id}/forms/{formId}.pdf` from Storage. Confirm those objects disappear shortly
   after delete. (Requires the backend Functions to be deployed.)

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

In **demo** mode the **Document** section instead shows a disabled **"Download PDF"** with the caption
*"The server-rendered PDF is available in live mode."* (no Cloud Function, so no server PDF exists).

## Remote consent signing — live checks (manual, owner-run, TEST account only)

With `.env.local` set (live mode), signed in as a **TEST** account that can send forms for a test patient:
1. Open the test patient → **Consent forms** → **Send a link** → pick a consent template →
   **Generate signing link**. Confirm in the Firestore console a new **`formLinks/{token}`** doc with
   `used: false`, `patientId`, `template`, `createdAtMillis`, and an `autofill` block.
2. **Copy** the link (or scan the **QR**) and open `https://aestheticx-91e6b.web.app/s/{token}` in a
   separate browser/incognito (no app login) → the public page loads the consent with the patient's
   autofill; answer the questions, draw a signature, submit → "Signed — thank you".
3. Confirm the `formLinks/{token}` doc flips to `used: true` (`usedAtMillis` set), and a new
   **`patients/{id}/forms/{formId}`** doc appears with `channel: webLink`. Re-open the link → it shows
   expired/used (single-use burn).
4. Re-hydrate the app (re-sign-in) → the signed form appears under the patient's **Consent forms**.
5. The **Email** button opens the local mail client prefilled to the patient with the link in the body
   (the app does not send email itself).

⚠️ **Notes:** remote links are offered for **consent templates only** (the public page does not render the
Aesthetic History intake). The app cannot show link status (the `formLinks` collection is Functions-only).
This increment also pins the web client's callables to the **australia-southeast1** region — verify the
existing callables (approve request, consume repeats, merge) still work after deploying.

## Billing dashboard — live checks (manual, owner-run, TEST account only)

With `.env.local` set (live mode), signed in as a **TEST** account:
1. As a TEST **doctor**, approve a request for a TEST patient (raise it as a TEST nurse first), then open
   **Billing** → confirm the **total billable authorisations** count increments and the approval appears
   under the right **month** (UTC `YYYY-MM`) grouped by the **counterparty** (the billing nurse or clinic),
   matching the new `patients`-adjacent `billingEvents/{id}` doc in the Firestore console.
2. Sign in as the **counterparty** (the TEST nurse, or a TEST clinic-admin) → Billing shows the same
   event **grouped by the prescribing doctor** ("Billable to you"). Confirm an unrelated nurse sees **0**.
3. Confirm the role scoping reflects the deployed `billingEvents` rules (doctor / counterparty-nurse /
   clinic-member reads only their own).

⚠️ **Notes:** counts are the **approved-request** grain (not per-medication line items). Party names are
resolved from the demo accounts, so live may show raw ids until a directory exists. Pricing and GST tax
invoices are a later increment (3b) — this dashboard is counts-only.

## Safety reminder

This wires a public-origin web client to a production clinical (PHI) database. Keep it pointed at the
TEST account during verification, never deploy the live config to a public URL without the
authorized-domain + rules review above, and treat any real-patient exposure as an incident.

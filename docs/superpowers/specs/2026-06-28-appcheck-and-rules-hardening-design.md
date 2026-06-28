# Design: App Check hardening + Firestore/Storage rules hardening

**Date:** 2026-06-28
**Status:** Approved (brainstorming) — pending spec review
**Spans two repos:**
- **Marketing** (`Aestheticx-marketing`, this repo): App Check on the web client.
- **Backend** (`AestheticX`, `github.com/ZhenDeng/Aestheticx`, `backend/`): Firestore + Storage rule fixes + rules-tests.

Two independent PRs (one per repo). This design doc + the plan live here for continuity.

## Why

The production Firebase project `aestheticx-91e6b` now answers a **public web origin** over real patient data (PHI). Two hardening tracks:
1. **App Check** — attest that requests come from our genuine app, raising the bar against scripted abuse of the public Firebase config.
2. **Rules hardening** — the security review found live, authenticated-user-exploitable PHI exposures that App Check does **not** address (App Check gates *which app*, not *which user*).

---

## Track A — App Check (web client, monitor-first)

### Decisions
- **Provider: reCAPTCHA v3** (free; swap to Enterprise later via the same client API if needed).
- **Monitoring mode only.** App Check **enforcement is project-wide** — flipping it on in the console would also block the **iOS app** until it ships App Check (App Attest/DeviceCheck). So this work only *registers and sends* App Check tokens from the web client; the enforcement flip is a later, owner-run console step coordinated with iOS. No app behaviour changes when unenforced.
- **Debug token** path so local dev, CI, and the unit tests don't require a real attestation.

### Implementation (marketing repo)
- `src/lib/firebase/client.ts`: after `initializeApp`, call `initializeAppCheck(app, { provider: new ReCaptchaV3Provider(siteKey), isTokenAutoRefreshEnabled: true })` — **only** when both Firebase is configured *and* a site key is present. Guard so it runs once, client-side only.
- New env var `NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY` (added to `.env.example`). When absent, App Check is simply not initialised (no crash) — so demo mode and unconfigured deploys are unaffected.
- **Debug token for dev:** in development, if `NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG === "true"`, set `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true` before init so the SDK prints a debug token to register in the console. Never enabled in production builds.
- A tiny `isAppCheckConfigured()` helper + a focused unit test (the configured/!configured branching, mirroring `isFirebaseConfigured`). The actual reCAPTCHA init is not unit-tested (browser-only; verified live).

### Owner prerequisites (console)
- Register the Web app for **App Check** with the **reCAPTCHA v3** provider; create a v3 site key; put it in `.env.local` + Vercel env as `NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY`.
- For local dev: run once with the debug flag, copy the printed debug token into **App Check → Apps → Manage debug tokens**.
- **Do NOT enable enforcement** until the iOS app also ships App Check. Watch the App Check **metrics** (verified vs unverified) in the console first.

### Out of scope (Track A)
The enforcement flip itself; iOS App Check; reCAPTCHA Enterprise.

---

## Track B — Rules hardening (backend repo)

Each fix is rule-level, paired with **rules-tests** in `backend/rules-tests/` (Vitest + `@firebase/rules-unit-testing`, existing harness with `CLAIMS` fixtures). **Every fix needs both a negative test (exploit blocked) and a positive test (legitimate client write/read still succeeds)** — the field allow-lists must match what the iOS app and web client actually send, or we break production writes. Field sets are taken from the iOS encoders in `AestheticXKit/Sources/AXData/LiveBackend.swift`.

### Critical
- **CRIT-2 — `authRequests` read leaks PHI to all clinic members.** Change `inClinic(resource.data.clinicId)` → `isClinicAdmin(resource.data.clinicId)` so only the nurse, the addressed doctor, clinic **admins**, and super-admin read the embedded `patientSummary`. (Test: employee/contractor read denied; nurse/doctor/admin allowed.)
- **CRIT-1 — `authRequests` create unbounded.** Add: the creating nurse must have `patientVisible(get(patients/$(patientId)).data)`, and `request.resource.data.keys().hasOnly(['patientId','nurseId','nurseName','doctorId','clinicId','status','items','patientSummary','createdAt'])`. (Test: cannot create a request for a non-visible patient; cannot inject extra keys; legit create still works.)
- **CRIT-3 — patient create allows `prescribingDoctorIds` injection.** Add `&& !request.resource.data.keys().hasAny(['prescribingDoctorIds'])` to `patients` create. (Test: nurse creating a patient with `prescribingDoctorIds` is denied; normal create works; that doctor does NOT gain visibility.)
- **CRIT-4 — `appointments` update field-unrestricted.** Add a `diff().affectedKeys().hasAny([...])` block on `['type','ownerId','counterparty','createdBy','slotId','authRequestId']` to the update rule. (Test: owner cannot change `type`/`counterparty`; can still edit time/notes/status.)

### High
- **HIGH-1 — `clinics` read by any doctor.** Remove the `hasRole('doctor')` branch (keep `inClinic` + `isSuperAdmin`). If the request flow needs a doctor to see a clinic name, that's the `doctors`/name-only path, not full clinic docs. (Test: unaffiliated doctor denied; member allowed.)
- **HIGH-2 — `slotPublications`/`slotBookings` world-readable to signed-in.** Scope reads to the doctor, their clinic members, and the booking counterparty (+ super-admin). (Test: unrelated signed-in user denied; participant allowed.)
- **HIGH-3 — Storage uploads have no content-type limit.** Add `request.resource.contentType.matches('image/(jpeg|png|webp|heic)') || == 'application/pdf'` to the `patients/{id}/{allPaths}` write (and image-only on avatars). (Test: not rules-unit-testable for Storage easily — verify via the emulator/storage rules tests if feasible, else document manual check.)
- **HIGH-5 — `notes` create field injection.** Add `keys().hasOnly(['kind','title','body','createdAt','authorId','authorBadge','consumedAuthorisationIds','medications','attachments','aftercareCategories','deliveryStatus'])`. (Test: extra key denied; the real note shapes — general + doctor treatment — still allowed.)

### Medium (worth doing)
- **MED-5 — avatar path `{allPaths=**}` + no type gate.** Constrain to image content-types and a smaller size; keep owner-only write.
- Add clarifying **comments** confirming the intended schema for `availability`, `doctors`, `formTemplates` (the review flagged these as "fine *iff* no PII in the docs"). No rule change unless the owner confirms PII is present — left as a noted follow-up, not a code change here.

### Deploy (owner)
After the PR merges: `cd backend && firebase deploy --only firestore:rules,storage` (the assistant does not deploy). The rules-tests run in CI/locally against the emulator first.

### Risk
The dominant risk is a too-strict `hasOnly`/`diff` allow-list **breaking legitimate production writes** (iOS or web). Mitigation: positive tests mirroring real client payloads for every tightened rule; field lists sourced from the iOS encoders; deploy only after the emulator suite is green.

---

## Testing summary
- **Marketing:** `isAppCheckConfigured` unit test; existing 40 tests stay green; lint/tsc/build clean; App Check init verified live via console metrics (owner).
- **Backend:** extend `backend/rules-tests/firestore.rules.test.js` (and a storage test if practical) — negative + positive cases per fix; `npm test` green against the emulator.

## Out of scope
App Check enforcement flip; iOS App Check; reCAPTCHA Enterprise; the `availability`/`doctors`/`formTemplates` schema changes (pending owner confirmation of whether they hold PII); any non-security refactor of the rules.

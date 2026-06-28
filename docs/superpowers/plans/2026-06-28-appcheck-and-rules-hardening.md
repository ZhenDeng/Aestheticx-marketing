# App Check + Rules Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Firebase App Check (reCAPTCHA v3, monitoring mode) to the marketing web client, and close the security-review findings in the backend Firestore/Storage rules with paired negative+positive rules-tests.

**Architecture:** Two repos, two PRs. Track A (marketing repo `Aestheticx-marketing`, branch `feature/app-check`): App Check init in `src/lib/firebase/client.ts`, env-gated. Track B (backend repo `AestheticX` at `/Users/zhendeng/Documents/AestheticX`, branch `feature/rules-hardening`): rule edits in `backend/firestore.rules` + `backend/storage.rules`, tests in `backend/rules-tests/`.

**Tech Stack:** Firebase Web SDK v11 (`firebase/app-check`), Next.js 16, Vitest; `@firebase/rules-unit-testing` v4 against the Firestore emulator.

**Backend test run command** (from `/Users/zhendeng/Documents/AestheticX/backend`): `firebase emulators:exec --only firestore "cd rules-tests && npm install && npm test"`. (Confirm this matches how the suite is currently run; the test file reads `../firestore.rules` and connects via the emulator env vars that `emulators:exec` sets.)

**Field allow-lists are sourced from the iOS encoders** in `AestheticXKit/Sources/AXData/LiveBackend.swift` — do not invent field names; a too-strict `hasOnly`/`diff` list breaks real writes, which the positive tests catch.

---

# Track A — App Check (marketing repo)

## Task A1: Env-gated App Check init + helper test

**Files:**
- Modify: `.env.example`
- Modify: `src/lib/firebase/client.ts`
- Test: `src/lib/firebase/__tests__/client.test.ts` (extend)

- [ ] **Step 1: Add the env var to `.env.example`** (append):
```
# Firebase App Check (reCAPTCHA v3) site key. When set, the web client attests via
# App Check. Leave blank to disable App Check init (demo/unconfigured deploys).
NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY=
# Dev only: set to "true" to print an App Check debug token to register in the console.
NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG=
```

- [ ] **Step 2: Write the failing test** — append to `src/lib/firebase/__tests__/client.test.ts`:
```ts
import { isAppCheckConfigured } from "@/lib/firebase/client";

describe("isAppCheckConfigured", () => {
  const KEY = "NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY";
  const saved = process.env[KEY];
  afterEach(() => {
    if (saved === undefined) delete process.env[KEY];
    else process.env[KEY] = saved;
  });
  it("is false when no site key is set", () => {
    delete process.env[KEY];
    expect(isAppCheckConfigured()).toBe(false);
  });
  it("is true when a site key is present", () => {
    process.env[KEY] = "site-key-123";
    expect(isAppCheckConfigured()).toBe(true);
  });
});
```

- [ ] **Step 3: Run it** — `npm test -- client` → FAIL (`isAppCheckConfigured` not exported).

- [ ] **Step 4: Implement** — in `src/lib/firebase/client.ts`, add the import and helper, and initialise App Check inside `getFirebaseApp()` once the app exists. Add near the top imports:
```ts
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
```
Add the helper (next to `isFirebaseConfigured`):
```ts
export function appCheckSiteKey(): string {
  return process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY ?? "";
}
export function isAppCheckConfigured(): boolean {
  return appCheckSiteKey().length > 0;
}
```
Replace the existing `getFirebaseApp()` body so App Check is wired once, client-side only, when a site key is present:
```ts
let app: FirebaseApp | undefined;
let appCheckStarted = false;

function startAppCheck(instance: FirebaseApp): void {
  if (appCheckStarted || typeof window === "undefined" || !isAppCheckConfigured()) return;
  appCheckStarted = true;
  // Dev-only debug token: prints a token to register under App Check → debug tokens.
  if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG === "true") {
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  initializeAppCheck(instance, {
    provider: new ReCaptchaV3Provider(appCheckSiteKey()),
    isTokenAutoRefreshEnabled: true,
  });
}

function getFirebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured()) throw new Error("Firebase is not configured");
  if (!app) app = getApps().length ? getApp() : initializeApp(firebaseConfig());
  startAppCheck(app);
  return app;
}
```

- [ ] **Step 5: Run tests** — `npm test -- client` → PASS. Then `npx tsc --noEmit` → clean.

- [ ] **Step 6: Commit**
```bash
git add .env.example src/lib/firebase/client.ts src/lib/firebase/__tests__/client.test.ts
git commit -m "feat(appcheck): init reCAPTCHA v3 App Check on the web client (env-gated, monitor mode)"
```

## Task A2: Track A verification

- [ ] **Step 1:** `npm run lint && npx tsc --noEmit && npm test && npm run build` → all green; 42 tests pass. (App Check is inert without a site key, so demo mode + existing tests are unaffected.)
- [ ] **Step 2: Document** — append an "App Check" section to `docs/superpowers/firebase-live-verification.md`:
```markdown
## App Check (reCAPTCHA v3) — owner steps
1. Firebase console → App Check → register the Web app with the reCAPTCHA v3 provider; create a v3 site key.
2. Put the key in `.env.local` and Vercel as `NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY`.
3. Local dev: set `NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG=true`, run the app, copy the debug token the console-logged SDK prints into App Check → Manage debug tokens.
4. Watch App Check metrics (verified vs unverified) for both web AND iOS.
5. Do NOT enable enforcement until the iOS app also ships App Check — enforcement is project-wide and will block unattested clients.
```
- [ ] **Step 3: Commit**
```bash
git add docs/superpowers/firebase-live-verification.md
git commit -m "docs(appcheck): owner rollout steps + enforcement caveat"
```
Then open the marketing PR with `/create-pr` (base `main`).

---

# Track B — Rules hardening (backend repo)

All Track B tasks run in `/Users/zhendeng/Documents/AestheticX` on branch `feature/rules-hardening`. Each task edits a rule, adds a **negative** test (exploit blocked) and a **positive** test (legit access still works) to `backend/rules-tests/firestore.rules.test.js`, and runs the suite.

**Task B0 (setup):** create the branch.
```bash
cd /Users/zhendeng/Documents/AestheticX && git checkout -b feature/rules-hardening
```

The test harness (existing) exposes: `ctx(uid)` → a Firestore for that auth context using `CLAIMS[uid]`; `assertSucceeds`/`assertFails`; fixtures seeded in `beforeAll` (`patients/p-nurse` owned by nurse `sarah`, `patients/p-clinic` owned by `clinic-lumiere`, `patients/p-doc` owned by `voss`, `authRequests/r-edit`, etc.). Add new fixtures/claims where a task needs them (shown per task).

## Task B1: CRIT-2 — `authRequests` read scoped to clinic admins

**Files:** `backend/firestore.rules`, `backend/rules-tests/firestore.rules.test.js`

- [ ] **Step 1: Add failing tests.** First ensure a clinic-scoped request fixture exists; in the `beforeAll` seeding block add:
```js
await setDoc(doc(db, 'authRequests/r-clinic'),
  { nurseId: 'sarah', doctorId: 'voss', clinicId: 'clinic-lumiere', status: 'pending',
    patientId: 'p-clinic', patientSummary: { name: 'Amara Boyd' }, items: [] })
```
Add an `employee` claim fixture to `CLAIMS`:
```js
  ruby: { roles: ['nurse'], clinics: { 'clinic-lumiere': 'employee' } },
```
Add tests:
```js
describe('authRequests read scoping (CRIT-2)', () => {
  it('clinic employee CANNOT read a clinic request (PHI in patientSummary)', () =>
    assertFails(getDoc(doc(ctx('ruby'), 'authRequests/r-clinic'))))
  it('clinic admin CAN read it', () =>
    assertSucceeds(getDoc(doc(ctx('admin'), 'authRequests/r-clinic'))))
  it('the addressed doctor CAN read it', () =>
    assertSucceeds(getDoc(doc(ctx('voss'), 'authRequests/r-clinic'))))
})
```

- [ ] **Step 2: Run** (emulators:exec command above) → the employee test FAILS (employee currently allowed).

- [ ] **Step 3: Edit the rule** in `backend/firestore.rules` `match /authRequests/{requestId}` read (lines ~124-127): replace `inClinic(resource.data.clinicId)` with `isClinicAdmin(resource.data.clinicId)`:
```
      allow read: if signedIn() &&
        (resource.data.nurseId == uid() || resource.data.doctorId == uid()
         || (resource.data.clinicId != null && isClinicAdmin(resource.data.clinicId))
         || isSuperAdmin());
```

- [ ] **Step 4: Run** → all three pass.
- [ ] **Step 5: Commit**
```bash
git add backend/firestore.rules backend/rules-tests/firestore.rules.test.js
git commit -m "fix(rules): authRequests read limited to clinic admins (CRIT-2)"
```

## Task B2: CRIT-1 — `authRequests` create bounds + patientVisible

**Files:** `backend/firestore.rules`, test file

- [ ] **Step 1: Add failing tests:**
```js
describe('authRequests create bounds (CRIT-1)', () => {
  const ok = { nurseId: 'sarah', doctorId: 'voss', clinicId: null, status: 'pending',
    patientId: 'p-nurse', patientSummary: { name: 'x' }, items: [], createdAt: 1 }
  it('nurse creates a bounded request for her own patient', () =>
    assertSucceeds(setDoc(doc(ctx('sarah'), 'authRequests/r-ok'), ok)))
  it('cannot create a request for a patient she cannot see', () =>
    assertFails(setDoc(doc(ctx('sarah'), 'authRequests/r-bad1'), { ...ok, patientId: 'p-doc' })))
  it('cannot inject extra keys', () =>
    assertFails(setDoc(doc(ctx('sarah'), 'authRequests/r-bad2'), { ...ok, sneaky: true })))
})
```

- [ ] **Step 2: Run** → the "cannot see" and "extra keys" tests FAIL (currently allowed).

- [ ] **Step 3: Edit the rule** — replace the `authRequests` `allow create` (lines ~128-131) with:
```
      allow create: if hasRole('nurse')
        && request.resource.data.nurseId == uid()
        && request.resource.data.status == 'pending'
        && (request.resource.data.clinicId == null || inClinic(request.resource.data.clinicId))
        && patientVisible(get(/databases/$(database)/documents/patients/$(request.resource.data.patientId)).data)
        && request.resource.data.keys().hasOnly(['patientId', 'nurseId', 'nurseName', 'doctorId',
              'clinicId', 'status', 'items', 'patientSummary', 'createdAt']);
```
(Field list per the iOS `encode(_ request:)`: patientId, nurseId, nurseName, doctorId, clinicId, status, createdAt, items, patientSummary.)

- [ ] **Step 4: Run** → all pass (the positive `r-ok` write confirms the allow-list isn't too strict).
- [ ] **Step 5: Commit**
```bash
git add backend/firestore.rules backend/rules-tests/firestore.rules.test.js
git commit -m "fix(rules): bound authRequests create to visible patient + known fields (CRIT-1)"
```

## Task B3: CRIT-3 — block `prescribingDoctorIds` on patient create

**Files:** `backend/firestore.rules`, test file

- [ ] **Step 1: Add failing tests:**
```js
describe('patient create cannot inject prescribingDoctorIds (CRIT-3)', () => {
  const intake = { ...PATIENT_BASE, ownerType: 'nurse', ownerId: 'sarah' }
  it('normal create by owner nurse succeeds', () =>
    assertSucceeds(setDoc(doc(ctx('sarah'), 'patients/p-crit3-ok'), intake)))
  it('create with prescribingDoctorIds is denied', () =>
    assertFails(setDoc(doc(ctx('sarah'), 'patients/p-crit3-bad'),
      { ...intake, prescribingDoctorIds: ['voss'] })))
})
```

- [ ] **Step 2: Run** → the injection test FAILS (currently allowed).

- [ ] **Step 3: Edit the rule** — add one clause to `patients` `allow create` (after the `hasAll([...])` line, before the `;`):
```
        && !request.resource.data.keys().hasAny(['prescribingDoctorIds'])
```

- [ ] **Step 4: Run** → both pass.
- [ ] **Step 5: Commit**
```bash
git add backend/firestore.rules backend/rules-tests/firestore.rules.test.js
git commit -m "fix(rules): block prescribingDoctorIds injection on patient create (CRIT-3)"
```

## Task B4: CRIT-4 — `appointments` update field lock

**Files:** `backend/firestore.rules`, test file

- [ ] **Step 1: Add fixture + failing tests.** In `beforeAll`:
```js
await setDoc(doc(db, 'appointments/ap-voss'),
  { ownerId: 'voss', type: 'treatment', dateISO: '2026-06-26', startMinute: 540, endMinute: 570, status: 'confirmed' })
```
Tests:
```js
describe('appointments update field lock (CRIT-4)', () => {
  it('owner edits time/notes/status', () =>
    assertSucceeds(updateDoc(doc(ctx('voss'), 'appointments/ap-voss'),
      { startMinute: 600, appointmentNote: 'moved' })))
  it('owner cannot change type', () =>
    assertFails(updateDoc(doc(ctx('voss'), 'appointments/ap-voss'), { type: 'authorisation' })))
  it('owner cannot inject a counterparty', () =>
    assertFails(updateDoc(doc(ctx('voss'), 'appointments/ap-voss'), { counterparty: { id: 'sarah' } })))
})
```

- [ ] **Step 2: Run** → the `type`/`counterparty` tests FAIL.

- [ ] **Step 3: Edit the rule** — replace the appointments `allow update, delete` (lines ~221-222) with a field-locked update + unchanged delete:
```
      allow update: if signedIn() && resource.data.ownerId == uid()
        && !request.resource.data.diff(resource.data).affectedKeys()
             .hasAny(['type', 'ownerId', 'counterparty', 'createdBy', 'slotId', 'authRequestId']);
      allow delete: if signedIn() && resource.data.ownerId == uid();
```

- [ ] **Step 4: Run** → all pass.
- [ ] **Step 5: Commit**
```bash
git add backend/firestore.rules backend/rules-tests/firestore.rules.test.js
git commit -m "fix(rules): lock immutable fields on appointment update (CRIT-4)"
```

## Task B5: HIGH-1 — `clinics` read drops the blanket doctor branch

**Files:** `backend/firestore.rules`, test file

- [ ] **Step 1: Add fixture + tests.** In `beforeAll`: `await setDoc(doc(db, 'clinics/clinic-lumiere'), { name: 'Lumière', abn: '123' })`. Tests:
```js
describe('clinics read (HIGH-1)', () => {
  it('unaffiliated doctor cannot read a clinic', () =>
    assertFails(getDoc(doc(ctx('voss'), 'clinics/clinic-lumiere'))))
  it('clinic member can read it', () =>
    assertSucceeds(getDoc(doc(ctx('admin'), 'clinics/clinic-lumiere'))))
})
```

- [ ] **Step 2: Run** → the unaffiliated-doctor test FAILS (currently allowed).
- [ ] **Step 3: Edit the rule** — `match /clinics/{clinicId}` read (line ~41):
```
      allow read: if signedIn() && (inClinic(clinicId) || isSuperAdmin());
```
- [ ] **Step 4: Run** → both pass.
- [ ] **Step 5: Commit**
```bash
git add backend/firestore.rules backend/rules-tests/firestore.rules.test.js
git commit -m "fix(rules): clinic docs readable only by members/super-admin (HIGH-1)"
```

## Task B6: HIGH-2 — scope `slotPublications` / `slotBookings` reads

**Files:** `backend/firestore.rules`, test file

- [ ] **Step 1: Add fixtures + tests.** In `beforeAll`:
```js
await setDoc(doc(db, 'slotPublications/sp1'), { doctorId: 'voss' })
await setDoc(doc(db, 'slotBookings/sb1'), { doctorId: 'voss', nurseId: 'sarah', clinicId: null })
```
Tests:
```js
describe('slot reads scoped (HIGH-2)', () => {
  it('unrelated user cannot read a slot publication', () =>
    assertFails(getDoc(doc(ctx('ruby'), 'slotPublications/sp1'))))
  it('the doctor can read his publication', () =>
    assertSucceeds(getDoc(doc(ctx('voss'), 'slotPublications/sp1'))))
  it('unrelated user cannot read a booking', () =>
    assertFails(getDoc(doc(ctx('ruby'), 'slotBookings/sb1'))))
  it('the booking nurse can read it', () =>
    assertSucceeds(getDoc(doc(ctx('sarah'), 'slotBookings/sb1'))))
})
```

- [ ] **Step 2: Run** → unrelated-user tests FAIL (currently `signedIn()`).
- [ ] **Step 3: Edit the rules** — `slotPublications` read (line ~191) and `slotBookings` read (line ~197):
```
    // slotPublications
      allow read: if signedIn() && (resource.data.doctorId == uid()
        || (resource.data.get('clinicId', null) != null && inClinic(resource.data.clinicId))
        || isSuperAdmin());
    // slotBookings
      allow read: if signedIn() && (resource.data.doctorId == uid() || resource.data.nurseId == uid()
        || (resource.data.get('clinicId', null) != null && inClinic(resource.data.clinicId))
        || isSuperAdmin());
```
> If the booking page needs nurses to browse a doctor's *published* slots before booking, keep a narrower allowance (e.g. nurses who have an authRequest to that doctor). For this pass, scope to doctor/clinic/super-admin and confirm the booking flow still works in QA; widen only if needed.

- [ ] **Step 4: Run** → all pass.
- [ ] **Step 5: Commit**
```bash
git add backend/firestore.rules backend/rules-tests/firestore.rules.test.js
git commit -m "fix(rules): scope slot publication/booking reads to participants (HIGH-2)"
```

## Task B7: HIGH-5 — `notes` create field allow-list

**Files:** `backend/firestore.rules`, test file

- [ ] **Step 1: Add failing tests:**
```js
describe('notes create field bounds (HIGH-5)', () => {
  const base = { kind: 'general', title: '', body: 'hi', authorId: 'sarah', createdAt: 1 }
  it('owner nurse writes a bounded general note', () =>
    assertSucceeds(setDoc(doc(ctx('sarah'), 'patients/p-nurse/notes/n-ok'), base)))
  it('cannot inject an unknown field', () =>
    assertFails(setDoc(doc(ctx('sarah'), 'patients/p-nurse/notes/n-bad'), { ...base, billingCode: 'X' })))
})
```

- [ ] **Step 2: Run** → the injection test FAILS.
- [ ] **Step 3: Edit the rule** — add to `notes` `allow create` (before `;`):
```
          && request.resource.data.keys().hasOnly(['kind', 'title', 'body', 'createdAt',
                'authorId', 'authorBadge', 'consumedAuthorisationIds', 'medications',
                'attachments', 'aftercareCategories', 'deliveryStatus'])
```
(Field list per the iOS `encode(_ note:)`.)

- [ ] **Step 4: Run** → both pass.
- [ ] **Step 5: Commit**
```bash
git add backend/firestore.rules backend/rules-tests/firestore.rules.test.js
git commit -m "fix(rules): restrict note create to known fields (HIGH-5)"
```

## Task B8: HIGH-3 + MED-5 — Storage content-type limits

**Files:** `backend/storage.rules` (no rules-unit-test — Storage rules aren't covered by the Firestore harness; verify via `firebase emulators:exec --only storage` manual check, documented).

- [ ] **Step 1: Edit `backend/storage.rules`.** Patient files write (lines ~35-39):
```
    match /patients/{patientId}/{allPaths=**} {
      allow read: if signedIn() && patientVisible(patientId);
      allow write: if signedIn() && !isSuperAdmin() && patientVisible(patientId)
        && request.resource.size < 25 * 1024 * 1024
        && (request.resource.contentType.matches('image/(jpeg|png|webp|heic)')
            || request.resource.contentType == 'application/pdf');
    }
```
Avatars (lines ~42-46):
```
    match /users/{userId}/{allPaths=**} {
      allow read: if signedIn();
      allow write: if signedIn() && request.auth.uid == userId
        && request.resource.size < 10 * 1024 * 1024
        && request.resource.contentType.matches('image/(jpeg|png|webp)');
    }
```

- [ ] **Step 2: Sanity-check** the rules compile: `cd backend && firebase deploy --only storage --dry-run` (or `firebase emulators:start --only storage` boots without a rules parse error). Note in the PR that Storage content-type enforcement is verified manually (no unit harness).

- [ ] **Step 3: Commit**
```bash
git add backend/storage.rules
git commit -m "fix(rules): restrict Storage uploads to image/pdf content types (HIGH-3, MED-5)"
```

## Task B9: Schema-confirmation comments (no behaviour change)

**Files:** `backend/firestore.rules`

- [ ] **Step 1:** Add a comment above `availability`, `doctors`, and `formTemplates` noting the review caveat, e.g. above `match /doctors/{doctorId}`:
```
      // SECURITY NOTE: readable by any signed-in user — keep these docs name-only
      // (no specialty/contact/ABN). Revisit if richer fields are ever added.
```
(Similar one-liners for `availability` — "must contain ONLY slot times, no practitioner PII" — and `formTemplates` — "structural only, no embedded PII".)

- [ ] **Step 2: Commit**
```bash
git add backend/firestore.rules
git commit -m "docs(rules): security notes on signed-in-readable collections"
```

## Task B10: Track B verification + PR

- [ ] **Step 1:** Run the full rules suite: from `backend/`, `firebase emulators:exec --only firestore "cd rules-tests && npm install && npm test"` → all green (existing tests + the new negative/positive cases).
- [ ] **Step 2:** Confirm no existing test regressed (the tightened rules must not break the prior positive cases).
- [ ] **Step 3:** Open the backend PR with `/create-pr` (base `main`, repo `ZhenDeng/Aestheticx`). PR body must state: changes require `firebase deploy --only firestore:rules,storage` by the owner, and that enforcement of nothing changes until deployed.

---

## Self-Review Notes

- **Spec coverage:** App Check init + env gate + debug token (A1) ✓; helper test (A1) ✓; rollout doc + enforcement caveat (A2) ✓; CRIT-1/2/3/4 (B2/B1/B3/B4) ✓; HIGH-1/2/3/5 (B5/B6/B8/B7) ✓; MED-5 (B8) ✓; schema-note follow-ups (B9) ✓; every rule fix has negative+positive tests except Storage (B8, no harness — documented) ✓; two PRs (A2, B10) ✓.
- **Out of scope respected:** no enforcement flip, no iOS App Check, no reCAPTCHA Enterprise, no availability/doctors/formTemplates rule changes (comments only).
- **Field-list fidelity:** authRequests (B2) and notes (B7) allow-lists are taken from the iOS `encode(_:)` functions; positive tests assert real shapes still write. If a positive test fails, the allow-list is missing a real field — add it (and note it) rather than loosening to allow arbitrary keys.
- **Type/name consistency:** `isAppCheckConfigured`/`appCheckSiteKey` defined in A1 and used in client init; test helpers (`ctx`, `assertFails`, `assertSucceeds`, `CLAIMS`, `PATIENT_BASE`) match the existing harness.
- **Known confirmations during implementation:** the exact backend rules-test run command (B10) and whether the booking flow needs broader `slotPublications` read (B6) — verify against the running app, widen only if QA shows a break.

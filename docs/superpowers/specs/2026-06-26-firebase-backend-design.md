# Design: wire the demo app to production Firebase (increment 1)

**Date:** 2026-06-26
**Status:** Approved (brainstorming) — pending spec review
**Repo:** `Aestheticx-marketing` (Next.js 16.2.9)
**Backend:** existing iOS Firebase project **`aestheticx-91e6b`** (production)
**Source of truth:** iOS `AestheticXKit/Sources/AXData/{LiveBackend,FirebaseAuth}.swift`, `backend/firestore.rules`, `backend/functions/src/index.ts` (+ `appointmentsFn.ts`, `billingFn.ts`).

## Goal

Make the existing demo screens (login, patients, patient file, authorisations, calendar) work
against the **real production Firebase backend** — real Firebase Auth, real Firestore data governed by
the deployed `firestore.rules`, and integrity-critical writes routed through the existing Cloud
Functions. Increment 1 only; later subsystems are separate specs.

## Owner decisions (brainstormed)

1. **Environment = production `aestheticx-91e6b`** (owner chose this over emulator/staging, with full
   knowledge that this exposes real clinical PHI to a public web origin).
2. **Read AND write** in increment 1.
3. Writes must be **safe by construction**: integrity-critical operations go through the existing
   Cloud Functions exactly as the iOS app does — never demo-grade direct writes. The fake
   "any-password / pick-a-role" login is replaced by real Firebase Auth.

## Key architectural insight

iOS `LiveBackend` does **not** replace the in-memory engine. It **hydrates an `InMemoryBackend` cache
from Firestore at sign-in, serves reads synchronously from the cache, and mirrors writes to
Firestore/Cloud Functions in the background** (optimistic local update first; server authoritative;
re-hydrate reconciles). We already ported that engine + its rules to TypeScript (`src/lib/demo/`). So
we **add a Firebase layer that feeds and mirrors the store we already have** — we do not rewrite the app.

## 1. Mode gating (safety-critical)

The store runs in one of two modes, chosen at runtime:

- **Demo mode** — default when no Firebase env config is present. Existing `buildSeedState()` seed,
  in-memory, identical to what's deployed today. Unchanged.
- **Live mode** — when Firebase env config IS present **and** a user is signed in via Firebase Auth.
  Hydrates from production Firestore and mirrors writes to production.

This guarantees the deployed site cannot touch production until deliberately configured, and preserves
a safe local/demo path. Helper: `isFirebaseConfigured()` (true iff the `NEXT_PUBLIC_FIREBASE_*` vars
are set).

## 2. Firebase init + config

Add the `firebase` web SDK (v11). `src/lib/firebase/client.ts` lazily initialises App, Auth, Firestore,
and Functions — only when config is present. Config from env (owner-supplied, public project
identifiers, not secrets):

```
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
```

A `.env.example` documents them; real values live in `.env.local` (gitignored) and Vercel env.

## 3. Auth + identity (`src/lib/firebase/auth.ts`)

Real **Firebase Auth email/password** sign-in. The ID token carries custom claims:
- `roles`: array (e.g. `["nurse"]`, `["doctor"]`, `["superAdmin"]`).
- `clinics`: map `clinicId → "admin" | <member>`.

On sign-in we read the claims + the `users/{uid}` doc (name/profile) and build the same `Identity`
objects the app already uses. A user may have several identities (e.g. independent + clinic); the
identity picker is reused. `DemoAuthProvider` is generalised: in live mode it wraps Firebase Auth
(`onAuthStateChanged`, `signInWithEmailAndPassword`, `signOut`); in demo mode it keeps the preset
accounts. The login page renders an **email/password form in live mode**, the preset cards in demo mode.

## 4. Reads — hydration (`src/lib/firebase/hydrate.ts`)

On sign-in (and manual refresh), run the **same scoped queries** as `LiveBackend.hydrate()`. The rules
are "not filters" — each query must carry constraints the rules can prove safe:

- **patients** — union of 5 queries by id:
  `(ownerType==nurse, ownerId==uid)`, `(ownerType==doctor, ownerId==uid)`,
  `(ownerType==nurse, prescribingDoctorIds array-contains uid)`,
  `(ownerType==clinic, prescribingDoctorIds array-contains uid)`,
  and `(ownerType==clinic, ownerId==clinicId)` for each clinic in claims.
- For each patient: list `patients/{id}/notes`.
- Top-level `authorisations` and `appointments` (scoped queries per the rules).
- Super admin: collection-wide reads (rules permit).

Map docs → TS types and populate the store's `DemoState`. Reads remain synchronous from the store. UI
shows a **loading state** during hydrate and an **error state** on failure (with a retry).

Collections (confirmed from iOS): `users`, `clinics`, `doctors`, `memberships`, `patients`,
`patients/{id}/notes`, `patients/{id}/forms`, `authRequests`, `authorisations`, `appointments`.

## 5. Writes — optimistic + mirror (`src/lib/firebase/mirror.ts`)

Each store mutation updates the in-memory cache first (instant UI, same rules already enforced
locally), then mirrors to production. In **demo mode** the mirror is a no-op.

| Action | Mirror target |
|--------|---------------|
| Raise request | direct Firestore create in `authRequests/{id}` |
| Save general note | direct create in `patients/{id}/notes/{id}` (append-only per rules) |
| Save treatment note | direct create in `patients/{id}/notes/{id}` **+** `consumeRepeats` callable |
| Approve request | `approveRequest` **callable** (`{ requestId }`) |
| Require edit | `requireEdit` **callable** (`{ requestId }`) |

Mirror failures surface a **non-blocking error banner** and set a `lastSyncError`; the server stays
authoritative and a re-hydrate reconciles. Integrity-critical operations (approve, repeat consumption)
therefore never bypass the Cloud Functions.

## 6. Mapping layer (`src/lib/firebase/mappers.ts`) — testable

Pure functions converting Firestore doc data ↔ TS types (`patient()`, `note()`, `authorisation()`,
`authRequest()`, `appointment()`, and the encoders for writes). Exact field decoders are ported from
`LiveBackend.swift` (e.g. `ownerType`/`ownerId`/`prescribingDoctorIds`, Firestore number coercion).
**Unit-tested with fixture docs — no live calls.**

## 7. Store integration

`DemoStoreProvider` gains a mode:
- Demo: `buildSeedState()` (today's behaviour).
- Live: starts empty, hydrates after sign-in, mutations call `mirror.*` after the optimistic update.

The store's public interface (the methods the pages call) is unchanged, so the UI screens need only
add **loading / error / empty** states. `now` becomes `Date.now()` in live mode (real expiries) and
stays `SEED_NOW` in demo mode.

## 8. Testing & verification

- **Unit (offline):** the mappers (fixture docs) + the existing 22 domain tests. All in CI, no network.
- **Live verification:** **manual only**, against production using a **dedicated owner-provided test
  account + test patient** — never automated, and QA must not mutate real patient records. We verify:
  sign-in → hydrate shows the test account's patients → raise request → approve (via callable) →
  re-hydrate reflects the new authorisation → sign out.

## 9. Prerequisites the owner provides (cannot be done from code)

1. The Firebase **Web app config** block for `aestheticx-91e6b` (registered Web app in console).
2. Add `localhost:3000` + the Vercel domain to **Auth → authorized domains**.
3. A **test account** (known credentials) scoped to **test data**, with correct `roles`/`clinics`
   custom claims — owner creates it; the assistant will not create accounts or enter passwords.
4. Confirmation that the deployed `firestore.rules` is current (assistant reviews it but does not deploy).

## 10. Security guardrails (built in)

- No demo backdoor in live mode — real Firebase Auth only.
- Integrity-critical writes via Cloud Functions, not direct client writes.
- Mode gating prevents accidental production access without explicit config.
- No secrets in the repo; config via env; `.env.local` gitignored.
- The assistant does not modify the production project's settings, rules, accounts, or access controls.

## 11. Out of scope (later increments)

Patient create/edit, consent signing, prescribing catalog, billing/invoices, email, file/photo
storage, video teleconsults, patient self-booking, super-admin tools, and real-time `onSnapshot`
subscriptions (increment 1 hydrates on sign-in + manual refresh).

## Risks

- **Production PHI exposure** through a public web origin — owner-accepted; mitigated by real auth +
  rules + Cloud-Function writes, but remains the dominant risk.
- **Schema drift** between the TS mappers and the Swift source — mitigated by keeping mappers in one
  file with a header pointing at `LiveBackend.swift`.
- **Rules rejection** if a hydrate query isn't constrained exactly as the rules expect — mitigated by
  mirroring the iOS query shapes precisely.
- **No live test coverage** — production can't be in CI; live paths are verified manually only, so the
  mapper unit tests must carry the correctness load for the data transforms.

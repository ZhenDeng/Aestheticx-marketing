# Cross-repo browser E2E (Firebase Emulator Suite)

The **full** nurse → doctor authorisation round-trip, in a real browser, against the real backend
Cloud Functions running in the local Firebase Emulator Suite. This is the one critical flow that
neither the demo E2E ([../e2e](../e2e)) nor the domain integration test
(`src/lib/demo/__tests__/cross-role-authorisation-roundtrip.test.ts`) can fully cover:

- the **demo** E2E has no shared state across accounts (the store resets on the sign-out reload), and
- in **live** mode the approve step is a backend Cloud Function (`approveRequest`), whose logic
  lives in the separate functions repo — so the domain test can't run the real function.

Here the app runs in **live mode wired to the emulators**, so Firestore persists across the
sign-out and the real `approveRequest` executes.

## Why it's separate from the main E2E suite

It has a hard prerequisite the demo suite doesn't: the **backend functions repo** and the running
emulators. It is therefore not part of `npm run test:e2e` or the CI workflow — it's a local /
manual harness. Wiring it into CI would need the backend repo checked out and the emulators booted
in the pipeline (a cross-repo job).

## Prerequisites

- The backend repo at `../AestheticX/backend` (sibling of this repo).
- Java (the Firestore/Auth emulators need a JVM) and the Firebase CLI.

## Run

1. Start the emulators from the backend repo (leave running):

   ```bash
   cd ../AestheticX/backend
   firebase emulators:start --only auth,firestore,functions
   ```

2. From this repo:

   ```bash
   npm run test:e2e:emulator
   ```

That's it. Playwright's `global-setup` **resets** the emulator data and **seeds** a nurse, a
doctor, an HA-filler product, and an active cooperation relationship (`seed.ts`), then starts
`next dev` on port 3098 in live-emulator mode (`playwright.emulator.config.ts` sets
`NEXT_PUBLIC_FIREBASE_EMULATORS=true`, forces the Firebase project id, and blanks the App Check
key so App Check stays off).

## How the app connects to the emulators

`src/lib/firebase/client.ts` connects auth/firestore/functions to the emulators **only when**
`NEXT_PUBLIC_FIREBASE_EMULATORS === "true"` — off in every normal build, dev run, and the demo
E2E, so this harness adds no production behaviour.

## What the round-trip asserts (`roundtrip.spec.ts`)

1. **Nurse** (real email/password via the auth emulator) creates a patient and submits an HA-filler
   authorisation request to the cooperating doctor — real Firestore writes.
2. The nurse **signs out**; the **doctor** signs in (data persists in the emulator's Firestore).
3. The doctor sees the **same** request, hydrated from Firestore, and **approves** it — running the
   real `approveRequest` Cloud Function, which issues the authorisations and clears the inbox.

## Fixtures

`seed.ts` exports the accounts (`NURSE`, `DOCTOR`, `PASSWORD`), product, and cooperation id used by
both the seed and the spec.

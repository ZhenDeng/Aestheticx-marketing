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

## Safety reminder

This wires a public-origin web client to a production clinical (PHI) database. Keep it pointed at the
TEST account during verification, never deploy the live config to a public URL without the
authorized-domain + rules review above, and treat any real-patient exposure as an incident.

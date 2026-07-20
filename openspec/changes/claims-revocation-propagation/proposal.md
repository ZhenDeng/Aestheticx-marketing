# claims-revocation-propagation

## Why

20/07 live test: after the platform admin switched a doctor's clinic relationship from employee to prescriber-only, the doctor's Profile still showed — and let them select — the revoked clinic identity. Server state was fully converged (membership row deleted, `users/{uid}.clinics` empty, Auth custom claims updated; data access already fail-closed via the membership-row rules), but a signed-in session only sees new claims at its next ID-token refresh, up to an hour later. Two client gaps: nothing prompts an early refresh, and the auth context kept a no-longer-held identity as the ACTIVE selection even after the refreshed set dropped it.

## What Changes

- New `watchClaimsRevision(uid)` (web `src/lib/firebase/auth.ts`): subscribes to the signed-in user's own `users/{uid}` doc (rules-permitted) and forces `getIdToken(true)` whenever the Function-managed `claimsRevision` moves past the sign-in baseline — the fresh token re-fires `onIdTokenChanged`, so grants/revocations reach the session in seconds. Unrelated profile edits (revision unchanged) cause no refresh; watch failure degrades silently to the hourly refresh.
- Auth context (`src/lib/demo/auth.tsx`): one claims watcher per signed-in uid, torn down on sign-out/effect cleanup; the active identity now survives a re-resolution only while the fresh identity set still holds it — otherwise it falls back through `pickInitialIdentity` (which already ignores remembered-but-revoked keys).
- No backend change (revocation itself was verified working in production).

## Capabilities

### New Capabilities

- `identity-claims-propagation`: how membership-claims changes reach signed-in sessions and the active identity selection.

### Modified Capabilities

_None._

## Impact

`src/lib/firebase/auth.ts`, `src/lib/demo/auth.tsx`; auth-mock updates across store/auth tests; new watcher + fallback coverage. Web-only.

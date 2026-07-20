# Tasks — claims-revocation-propagation

## 1. Implementation

- [x] 1.1 `watchClaimsRevision` in src/lib/firebase/auth.ts (baseline-skip, revision-guarded, silent-degrade)
- [x] 1.2 auth.tsx: subscribe once per signed-in uid, teardown on sign-out/cleanup; active-identity fallback via identityKey + pickInitialIdentity

## 2. Tests

- [x] 2.1 Watcher unit tests (baseline, no-op re-emit, refresh on bump, missing-revision default, unsubscribe)
- [x] 2.2 Live-watcher tests: revoked identity drops from active selection; selection survives routine refresh; one watcher per uid + sign-out teardown
- [x] 2.3 Stub the new export across existing auth-module mocks

## 3. Ship

- [ ] 3.1 PR, merge, deploy; verify live that revoking employee removes the identity from a signed-in doctor within seconds

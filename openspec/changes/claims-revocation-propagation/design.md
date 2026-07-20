# Design — claims-revocation-propagation

## Context
Production diagnosis (Firestore + Auth REST, 20/07): revoke path fully converged server-side; the lingering identity was purely the client's stale ID token plus `setIdentity((cur) => cur ?? …)` keeping a dropped identity active.

## Goals / Non-Goals
**Goals:** near-instant propagation of claims changes to signed-in sessions; active-identity fallback. **Non-Goals:** backend changes; revoking refresh tokens (data access is already fail-closed via membership-row rules — this is a UI-truthfulness fix).

## Decisions
1. Watch `users/{uid}.claimsRevision` (own-doc read is rules-permitted) rather than polling or revoking refresh tokens: the revision is bumped by every claim writer inside the same transaction, so it is the precise, cheap signal; `getIdToken(true)` then re-fires the existing `onIdTokenChanged` → `identitiesForUser` pipeline unchanged.
2. Baseline-skip on the first snapshot prevents a redundant refresh at sign-in; comparing revisions (not doc changes) prevents profile-edit thrash.
3. Active-identity fallback reuses `identityKey` + `pickInitialIdentity` (which already validates remembered keys against the held set), so a revoked-but-remembered identity cannot resurrect; re-grant later restores it naturally.
4. `watchClaimsRevision` is called optionally from the auth context so existing test mocks keep working; vitest mock proxies still require the export stub, added across store/auth test mocks.

## Risks / Trade-offs
- [Extra Firestore listener per session] → one doc, own uid; negligible.
- [Forced refresh loop if a writer bumps revision without changing claims] → refresh is claim-derived and revision-guarded; writers bump only on claims map changes.

## Migration Plan
Single web PR; Vercel auto-deploy. No data migration.

## Open Questions
None.

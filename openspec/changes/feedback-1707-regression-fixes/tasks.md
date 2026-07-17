# Tasks: feedback-1707-regression-fixes

## 1. Backend — syncUserClaims self-repair arm (repo AestheticX, branch fix/1707-claims-autoheal)

- [x] 1.1 RED: unit tests for the authorization decision (pure helper): superAdmin repairs anyone; non-admin repairs self only (explicit `userId` == own uid, and missing `userId` defaults to self); non-admin repairing someone else rejected
- [x] 1.2 GREEN: extract/implement the pure authorization helper and wire it into the `syncUserClaims` callable; missing `userId` defaults to caller uid
- [x] 1.3 Backend suite green (`npm test` in functions/) + lint/build

## 2. Web — sign-in self-heal (repo Aestheticx-marketing, branch fix/1707-claims-autoheal-admin-layout)

- [x] 2.1 RED: tests for wipe-signature detection + heal flow in identity resolution: wiped token + roled doc → calls syncUserClaims(self) then force-refreshes and resolves repaired identities; healthy token → no call; doc without roles → no call; heal failure → falls through to current (empty-identity) behaviour
- [x] 2.2 GREEN: implement self-heal in `identitiesForUser` (single attempt, no retry loop), callable invocation beside the existing mirror helpers
- [x] 2.3 Remove the "Repair access" button + its repair state machine from `AdminConsole.tsx`; update/remove tests that reference it

## 3. Web — accounts list overflow fix

- [x] 3.1 Restructure `AccountRow`: identity block (`min-w-0 flex-1`, truncation kept) + actions cluster in a `flex flex-wrap` container; outer row allowed to wrap; confirm delete-confirm state also wraps
- [x] 3.2 Browser verification at 360/768/1280px: accounts list renders with no horizontal document overflow (demo-mode harness or component preview), screenshot evidence

## 4. Verify · sync · ship

- [x] 4.1 Full web suite green (`npm test`) and build (`npm run build`); backend suite green
- [x] 4.2 Engineer review (/review) on both diffs; QA pass; all CRITICAL/HIGH addressed
- [x] 4.3 openspec-sync-specs: fold delta into `openspec/specs/account-provisioning/spec.md`
- [x] 4.4 PRs: backend first (deploy-order note in body), then web; both reference this change

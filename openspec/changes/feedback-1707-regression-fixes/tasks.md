# Tasks: feedback-1707-regression-fixes

## 1. Backend — syncUserClaims self-repair arm (repo AestheticX, branch fix/1707-claims-autoheal)

- [ ] 1.1 RED: unit tests for the authorization decision (pure helper): superAdmin repairs anyone; non-admin repairs self only (explicit `userId` == own uid, and missing `userId` defaults to self); non-admin repairing someone else rejected
- [ ] 1.2 GREEN: extract/implement the pure authorization helper and wire it into the `syncUserClaims` callable; missing `userId` defaults to caller uid
- [ ] 1.3 Backend suite green (`npm test` in functions/) + lint/build

## 2. Web — sign-in self-heal (repo Aestheticx-marketing, branch fix/1707-claims-autoheal-admin-layout)

- [ ] 2.1 RED: tests for wipe-signature detection + heal flow in identity resolution: wiped token + roled doc → calls syncUserClaims(self) then force-refreshes and resolves repaired identities; healthy token → no call; doc without roles → no call; heal failure → falls through to current (empty-identity) behaviour
- [ ] 2.2 GREEN: implement self-heal in `identitiesForUser` (single attempt, no retry loop), callable invocation beside the existing mirror helpers
- [ ] 2.3 Remove the "Repair access" button + its repair state machine from `AdminConsole.tsx`; update/remove tests that reference it

## 3. Web — accounts list overflow fix

- [ ] 3.1 Restructure `AccountRow`: identity block (`min-w-0 flex-1`, truncation kept) + actions cluster in a `flex flex-wrap` container; outer row allowed to wrap; confirm delete-confirm state also wraps
- [ ] 3.2 Browser verification at 360/768/1280px: accounts list renders with no horizontal document overflow (demo-mode harness or component preview), screenshot evidence

## 4. Verify · sync · ship

- [ ] 4.1 Full web suite green (`npm test`) and build (`npm run build`); backend suite green
- [ ] 4.2 Engineer review (/review) on both diffs; QA pass; all CRITICAL/HIGH addressed
- [ ] 4.3 openspec-sync-specs: fold delta into `openspec/specs/account-provisioning/spec.md`
- [ ] 4.4 PRs: backend first (deploy-order note in body), then web; both reference this change

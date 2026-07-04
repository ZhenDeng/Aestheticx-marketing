# Super-admin live console — implementation plan

Spec: `docs/superpowers/specs/2026-07-04-superadmin-live-console-design.md`
Branch: `feat/superadmin-live-console`

## Tasks

### 1. Pure model + validation (TDD)
- [ ] 1.1 Tests: `src/lib/demo/__tests__/user-admin.test.ts` — `validateNewUser` port parity
      (each required field, temp password < 8, AHPRA required iff doctor/nurse role, valid → []).
- [ ] 1.2 Tests: `accountsInventory` sorting + empty; extend a demo test for `accountsByID` seed.
- [ ] 1.3 Implement `src/lib/demo/userAdmin.ts` (NewUserInput + validateNewUser).
- [ ] 1.4 Implement `AccountRecord` + `DemoState.accountsByID` (`types.ts`), `emptyState`,
      seed from `DEMO_ACCOUNTS` (`seed.ts`), `accountsInventory` (`backend.ts`).

### 2. Live data plumbing (TDD)
- [ ] 2.1 Tests: `mapAccount` (full/partial/unknown-role rows) and `assembleState` accounts slice.
- [ ] 2.2 Implement `mapAccount` (`mappers.ts`), `HydrationRows.accounts?` + superAdmin
      `runQuery("users")` (`hydrate.ts`).
- [ ] 2.3 Implement `mirrorCreateUser` + `mirrorResetUserPassword` (`mirror.ts`).
- [ ] 2.4 Store: `accounts()`, `createUser()`, `resetUserPassword()` (`store.tsx`).

### 3. AdminConsole UI
- [ ] 3.1 Live inventory rows (name, email, role chips, awaiting-first-login chip, reset action).
- [ ] 3.2 Inline create-user form with client validation, submit → callable → refresh, error surface.
- [ ] 3.3 Demo mode: static list + disabled button retained, live-only caption.

### 4. Verification
- [ ] 4.1 `npm test`, `npm run lint`, `npm run build` all green.
- [ ] 4.2 Engineer review (typescript-reviewer) — no open CRITICAL/HIGH.
- [ ] 4.3 Live preview QA as real super admin (inventory renders, form validates; no prod
      user created).

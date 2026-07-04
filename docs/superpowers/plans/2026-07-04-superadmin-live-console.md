# Super-admin live console — implementation plan

Spec: `docs/superpowers/specs/2026-07-04-superadmin-live-console-design.md`
Branch: `feat/superadmin-live-console`

## Tasks

### 1. Pure model + validation (TDD)
- [x] 1.1 Tests: `src/lib/demo/__tests__/user-admin.test.ts` — `validateNewUser` port parity
      (each required field, temp password < 8, AHPRA required iff doctor/nurse role, valid → []).
- [x] 1.2 Tests: `accountsInventory` sorting + empty; seeded `accountsByID` coverage.
- [x] 1.3 Implement `src/lib/demo/userAdmin.ts` (NewUserInput + validateNewUser).
- [x] 1.4 Implement `AccountRecord` + `DemoState.accountsByID` (`types.ts`), `emptyState`,
      seed from `DEMO_ACCOUNTS` (`seed.ts`), `accountsInventory` (`backend.ts`).

### 2. Live data plumbing (TDD)
- [x] 2.1 Tests: `mapAccount` (full/partial/unknown-role rows) and `assembleState` accounts slice
      (`src/lib/firebase/__tests__/accounts.test.ts`).
- [x] 2.2 Implement `mapAccount` (`mappers.ts`), `HydrationRows.accounts?` + superAdmin
      `runQuery("users")` (`hydrate.ts`).
- [x] 2.3 Implement `mirrorCreateUser` + `mirrorResetUserPassword` (`mirror.ts`).
- [x] 2.4 Store: `accounts()`, `createUser()`, `resetUserPassword()` (`store.tsx`).

### 3. AdminConsole UI
- [x] 3.1 Live inventory rows (name, email, role chips, awaiting-first-login chip, reset action).
- [x] 3.2 Inline create-user form with client validation, submit → callable → refresh, error surface.
- [x] 3.3 Demo mode: static list + disabled button retained, live-only caption.

### 4. Verification
- [x] 4.1 `npm test` (486 green), `npm run build` clean; changed files lint clean (the repo's
      280 pre-existing lint errors are unchanged — verified identical on a stashed tree).
- [x] 4.2 Engineer review (typescript-reviewer) — dispositions below; no open CRITICAL/HIGH.
- [x] 4.3 Live preview QA signed in as the real super admin: 6 real accounts rendered sorted
      with role chips + reset buttons; empty submit marked 7 fields with no network call;
      checking Doctor made AHPRA required. No prod user created.

## Review dispositions (2026-07-04)

- **Fixed:** temp-password input masked (`type="password"`, `autocomplete="new-password"`);
  reset-password failures now surface the error message (button tooltip); `validateNewUser`
  statically imported; `AccountRecord` named import.
- **Rejected — unmount guards on `sendReset`/`submit`:** matches the file's existing
  event-handler convention (`DeleteAccount.performDelete`); React ≥18 treats post-unmount
  setState as a safe no-op. Noted in a code comment.
- **Rejected — client-side role allowlist:** the form can only emit doctor/nurse; `createUser`
  is superAdmin-gated server-side, and a super admin already holds maximal privilege, so a
  "modified client" gains nothing. `validateNewUser` stays a verbatim parity port (verified
  against `backend/functions/src/userAdmin.ts` directly).
- **Accepted divergence — unmemoized `accounts()`:** matches the store's existing selector style.

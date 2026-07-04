# Live deep links survive reload — implementation plan

Spec: `docs/superpowers/specs/2026-07-05-live-deeplink-auth-design.md`
Branch: `fix/live-deeplink-auth`

## Context

Investigation outcome of the "consent function is missing" report. Consent itself was
verified fully working on production infra (on-device signing → signed record → server PDF
ready; remote link + QR minted; delete-in-error; superadmin correctly read-only per iOS
parity). The real defect: live-mode full page loads always bounced deep /app URLs to the
dashboard because AuthGuard redirected before Firebase finished restoring the session.

## Tasks

- [x] 1. Tests first: `src/lib/demo/__tests__/auth-redirect.test.ts` — `safeNextPath`
      (in-app accepted with query; null/empty/non-app/open-redirect shapes → dashboard) and
      `loginUrlFor` (encodes path+search; non-app → plain `/login`). RED confirmed, then GREEN.
- [x] 2. `src/lib/demo/authRedirect.ts` — pure helpers with the open-redirect guard.
- [x] 3. `auth.tsx` — `resolved` flag (demo: immediate; live: first `watchUser` callback,
      both signed-in and signed-out arms).
- [x] 4. `AuthGuard` — no redirect until `resolved`; then `loginUrlFor(window.location…)`.
- [x] 5. `LoginForm` — live effect + demo submit forward to `safeNextPath(?next)`;
      `window.location` read at call time keeps `/login` statically prerendered (no
      `useSearchParams`/Suspense).
- [x] 6. Verify: 491 tests green (5 new), `next build` clean, changed files lint clean.
- [x] 7. Live QA on production infra: reload `/app/profile` signed in → stays put
      (previously → dashboard); signed-out `/app/calendar` → `/login?next=%2Fapp%2Fcalendar`
      → sign-in → lands on `/app/calendar`.
- [x] 8. Engineer review (typescript-reviewer) — dispositions below.

## Review dispositions (2026-07-05)

Verdict: no CRITICAL/HIGH — the `resolved` gating, open-redirect guard, sign-out flow, and
`mustChangePassword` gate all reviewed clean; unit tests cover the redirect edge cases.

- **Fixed (MEDIUM):** five stray macOS `" 2"`-suffixed duplicate files (byte-identical
  copies of already-committed sources/docs, an editor artifact) were accidentally in the
  commit — `git rm`'d.
- **Fixed (LOW nit):** dropped the redundant `!path.startsWith("//")` from `isInAppPath`
  (the `/app` prefix allow-list already rejects it); comment now explains the guard model.
- **Accepted (LOW, UX note):** signing out from an /app page produces `/login?next=<that
  page>`, so the next sign-in returns there rather than the dashboard. Deliberate — it
  restores the pre-fix behaviour's intent ("go where you were headed") and is strictly no
  worse than the old always-dashboard flow.

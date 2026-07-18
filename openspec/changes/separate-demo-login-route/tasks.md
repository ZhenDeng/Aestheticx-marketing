## 1. Sandbox flag module

- [x] 1.1 Write `src/lib/demo/__tests__/demoMode.test.ts` (RED): `isDemoModeRequested` false on
  empty storage, true after `setDemoMode(s, true)`, false after `setDemoMode(s, false)`; both
  functions swallow a throwing `Storage` and report "not requested"
- [x] 1.2 Implement `src/lib/demo/demoMode.ts` — pure, `Storage` injected, key `ax.demoMode`,
  try/catch around access (mirrors `loginPrefs.ts`)

## 2. Mode-aware redirect helper

- [x] 2.1 Extend `src/lib/demo/__tests__/authRedirect.test.ts` (RED): `loginUrlFor` with mode
  `demo` returns `/demo…`, with `live` returns `/login…`; `?next=` encoding preserved for
  `/app` paths; non-app paths return the bare entry point in both modes
- [x] 2.2 Add the `mode` argument to `loginUrlFor` in `src/lib/demo/authRedirect.ts`, keeping
  the module free of React and Firebase imports

## 3. Auth provider: session-scoped mode

- [x] 3.1 Write provider tests (RED) in `src/lib/demo/__tests__/`: mode is `live` on a
  configured deployment with no flag; flips to `demo` after mount when the flag is set; the
  Firebase watcher does NOT subscribe before the storage read resolves (stale-identity race);
  `resolved` is true whenever mode is `demo`, including after a post-mount flip
- [x] 3.2 Rework `src/lib/demo/auth.tsx`: derived `mode`, derived `resolved`, watcher effect
  guarded until the client has taken over.
  **Diverged from plan:** the tri-state `demoOverride` was replaced by `useSyncExternalStore`.
  The planned mount-effect read tripped `react-hooks/set-state-in-effect` (an ESLint error
  here) and hand-rolled what that hook exists for. Mode is additionally derived from
  `usePathname` — being on `/demo` IS demo mode — because the flag alone resolves a commit
  too late on a full page load.
- [x] 3.3 Add `enterDemoMode()` / `exitDemoMode()` to the context — write/clear the flag, clear
  `identity` and `availableIdentities`; do not sign out of Firebase
- [x] 3.4 ~~Clear the sandbox flag in `signOut()`~~ **Reversed after review.** Doing so let a
  clinician who entered `/demo` in an already-signed-in tab click "Sign out" and land signed
  IN to their real account (the watcher resolved their dormant session). Sandbox sign-out now
  stays sandboxed; `/login` is the explicit way out. Spec requirement updated to match.

## 4. Store follows the provider

- [x] 4.1 Write a store test (RED): with provider mode `demo` on a Firebase-configured
  deployment, reads/writes go to the in-memory backend, not Firestore
- [x] 4.2 Replace `isFirebaseConfigured()` at `src/lib/demo/store.tsx:155` with `live` derived
  from the `mode` returned by the `useDemoAuth()` call on the following line; drop the now
  unused import

## 5. Routes and forms

- [x] 5.1 Update `src/components/app/__tests__/LoginForm.test.tsx` (RED) for the split: the
  live form calls `exitDemoMode` on mount; the demo form calls `enterDemoMode` on mount; each
  renders only its own fields
- [x] 5.2 Split `src/components/app/LoginForm.tsx` into separately exported `LiveLoginForm`
  and `DemoLoginForm`, each with its own mount effect; drop the mode branch
- [x] 5.3 Create `src/app/demo/page.tsx` — server component, `robots: noindex`, renders
  `DemoLoginForm` with the same shell as the login page, plus a link back to `/login`
- [x] 5.4 Narrow `src/app/login/page.tsx` to the live form; when `isFirebaseConfigured()` is
  false render a "sign-in is not configured" state linking to `/demo`; keep the page a server
  component so it stays statically prerendered

## 6. Guard wiring

- [x] 6.1 Extend `src/components/app/__tests__/AuthGuard.test.tsx` (RED): signed-out sandbox
  visitor to `/app/calendar` is redirected to `/demo?next=%2Fapp%2Fcalendar`; live visitor to
  `/login?next=…`
- [x] 6.2 Pass `mode` from `useDemoAuth()` into `loginUrlFor` in
  `src/components/app/AuthGuard.tsx`

## 7. E2E migration

- [x] 7.1 Point `loginAsDemo` in `e2e/helpers.ts` at `/demo`
- [x] 7.2 Update `e2e/a11y.spec.ts:31` and `e2e/e1-login.spec.ts` (including the signed-out
  URL assertions) to `/demo`
- [x] 7.3 Update the `webServer.url` readiness probe in `playwright.config.ts` to `/demo`;
  leave `playwright.emulator.config.ts` and `e2e-emulator/roundtrip.spec.ts` on `/login`
  (the emulator run is Firebase-configured, i.e. live)
- [x] 7.4 Add `e2e/e11-route-separation.spec.ts`: each route serves only its own form, each
  links to the other, and — added after review — arriving at `/demo` by SOFT navigation still
  enters the sandbox (every other spec uses `page.goto`, i.e. hard navigation only)
- [x] 7.5 Confirm `e2e/e9-marketing.spec.ts` still passes — the nav "Log in" link stays
  `/login` and is unchanged by this work

## 8. Verification

- [x] 8.1 `npm run lint` and `tsc --noEmit` clean
- [x] 8.2 Full unit suite green (`npm test`)
- [x] 8.3 Playwright suite green
- [x] 8.4 `npm run build` succeeds and `/login` is still reported as statically prerendered in
  the build output
- [x] 8.5 Manual check with `.env.local` present: `/demo` enters the sandbox and the seed
  loads; `/login` shows the live form; the two coexist across two tabs
- [x] 8.6 Update `docs/TEST_PLAN.md` and `e2e/README.md` to describe the `/demo` entry point

## 9. Review follow-ups

- [x] 9.1 Fix the infinite render loop: `enterDemoMode`/`exitDemoMode` are called from a mount
  effect keyed on callback identity, so they must be referentially stable (`useCallback`)
- [x] 9.2 Stop `ConsultCallProvider` subscribing to `consultSignals/{uid}` in a sandbox tab —
  it gated on `isFirebaseConfigured()` and so used a demo uid that exists only in the seed
- [x] 9.3 Keep the tab sandboxed on sandbox sign-out (see 3.4)
- [x] 9.4 Guard the `window.sessionStorage` property access itself via
  `readDemoMode`/`writeDemoMode` — the access can throw, and the provider mounts at the app root
- [x] 9.5 Pin the `key={mode}` invariant: mode never changes without `identity` nulling in the
  same commit, or the remount would destroy in-flight call/form state
- [x] 9.6 Verify in-browser on a Firebase-configured build that the whole `/demo` journey runs
  with zero console errors, and that `/demo` and `/login` work simultaneously in two tabs

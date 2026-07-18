## 1. Sandbox flag module

- [ ] 1.1 Write `src/lib/demo/__tests__/demoMode.test.ts` (RED): `isDemoModeRequested` false on
  empty storage, true after `setDemoMode(s, true)`, false after `setDemoMode(s, false)`; both
  functions swallow a throwing `Storage` and report "not requested"
- [ ] 1.2 Implement `src/lib/demo/demoMode.ts` — pure, `Storage` injected, key `ax.demoMode`,
  try/catch around access (mirrors `loginPrefs.ts`)

## 2. Mode-aware redirect helper

- [ ] 2.1 Extend `src/lib/demo/__tests__/authRedirect.test.ts` (RED): `loginUrlFor` with mode
  `demo` returns `/demo…`, with `live` returns `/login…`; `?next=` encoding preserved for
  `/app` paths; non-app paths return the bare entry point in both modes
- [ ] 2.2 Add the `mode` argument to `loginUrlFor` in `src/lib/demo/authRedirect.ts`, keeping
  the module free of React and Firebase imports

## 3. Auth provider: session-scoped mode

- [ ] 3.1 Write provider tests (RED) in `src/lib/demo/__tests__/`: mode is `live` on a
  configured deployment with no flag; flips to `demo` after mount when the flag is set; the
  Firebase watcher does NOT subscribe before the storage read resolves (stale-identity race);
  `resolved` is true whenever mode is `demo`, including after a post-mount flip
- [ ] 3.2 Rework `src/lib/demo/auth.tsx`: tri-state `demoOverride` (`null` = unread), derived
  `mode`, derived `resolved`, watcher effect guarded on `demoOverride !== null`
- [ ] 3.3 Add `enterDemoMode()` / `exitDemoMode()` to the context — write/clear the flag, clear
  `identity` and `availableIdentities`; do not sign out of Firebase
- [ ] 3.4 Clear the sandbox flag in `signOut()`

## 4. Store follows the provider

- [ ] 4.1 Write a store test (RED): with provider mode `demo` on a Firebase-configured
  deployment, reads/writes go to the in-memory backend, not Firestore
- [ ] 4.2 Replace `isFirebaseConfigured()` at `src/lib/demo/store.tsx:155` with `live` derived
  from the `mode` returned by the `useDemoAuth()` call on the following line; drop the now
  unused import

## 5. Routes and forms

- [ ] 5.1 Update `src/components/app/__tests__/LoginForm.test.tsx` (RED) for the split: the
  live form calls `exitDemoMode` on mount; the demo form calls `enterDemoMode` on mount; each
  renders only its own fields
- [ ] 5.2 Split `src/components/app/LoginForm.tsx` into separately exported `LiveLoginForm`
  and `DemoLoginForm`, each with its own mount effect; drop the mode branch
- [ ] 5.3 Create `src/app/demo/page.tsx` — server component, `robots: noindex`, renders
  `DemoLoginForm` with the same shell as the login page
- [ ] 5.4 Narrow `src/app/login/page.tsx` to the live form; when `isFirebaseConfigured()` is
  false render a "sign-in is not configured" state linking to `/demo`; keep the page a server
  component so it stays statically prerendered

## 6. Guard wiring

- [ ] 6.1 Extend `src/components/app/__tests__/AuthGuard.test.tsx` (RED): signed-out sandbox
  visitor to `/app/calendar` is redirected to `/demo?next=%2Fapp%2Fcalendar`; live visitor to
  `/login?next=…`
- [ ] 6.2 Pass `mode` from `useDemoAuth()` into `loginUrlFor` in
  `src/components/app/AuthGuard.tsx`

## 7. E2E migration

- [ ] 7.1 Point `loginAsDemo` in `e2e/helpers.ts` at `/demo`
- [ ] 7.2 Update `e2e/a11y.spec.ts:31` and `e2e/e1-login.spec.ts` (including the signed-out
  URL assertions) to `/demo`
- [ ] 7.3 Update the `webServer.url` readiness probe in `playwright.config.ts` to `/demo`;
  leave `playwright.emulator.config.ts` and `e2e-emulator/roundtrip.spec.ts` on `/login`
  (the emulator run is Firebase-configured, i.e. live)
- [ ] 7.4 Add an E2E case asserting `/demo` and `/login` render their own form and neither
  renders the other's
- [ ] 7.5 Confirm `e2e/e9-marketing.spec.ts` still passes — the nav "Log in" link stays
  `/login` and is unchanged by this work

## 8. Verification

- [ ] 8.1 `npm run lint` and `tsc --noEmit` clean
- [ ] 8.2 Full unit suite green (`npm test`)
- [ ] 8.3 Playwright suite green
- [ ] 8.4 `npm run build` succeeds and `/login` is still reported as statically prerendered in
  the build output
- [ ] 8.5 Manual check with `.env.local` present: `/demo` enters the sandbox and the seed
  loads; `/login` shows the live form; the two coexist across two tabs
- [ ] 8.6 Update `docs/TEST_PLAN.md` and `e2e/README.md` to describe the `/demo` entry point

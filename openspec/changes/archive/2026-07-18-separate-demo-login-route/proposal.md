## Why

The interactive demo and the real login share one route. `/login` renders either the demo
role-picker or the live Firebase email/password form depending on a single global,
env-derived flag (`isFirebaseConfigured()`, read independently in `src/lib/demo/auth.tsx:40`
and `src/lib/demo/store.tsx:155`). Because that flag is deployment-wide, the two modes are
mutually exclusive: with Firebase env set — as it is locally and on Vercel — the demo is
entirely unreachable, and the marketing site has no working "try it" surface. Prospects and
real clinicians need separate, simultaneously-working front doors on the same deployment.

## What Changes

- **New `/demo` route** — always renders the demo role-picker and switches the current browser
  tab into sandbox mode, regardless of whether Firebase is configured.
- **Sandbox mode becomes session-scoped, not deployment-scoped.** A per-tab flag
  (`sessionStorage`) overrides the env-derived mode, so one visitor can explore the in-memory
  seed while another signs in for real against Firebase on the same deployment.
- **`/login` always serves the real login.** Visiting it clears any sandbox flag, so a user who
  wandered in from the demo gets a clean live sign-in. **BREAKING** for local/E2E use: `/login`
  no longer falls back to the demo picker when Firebase env is absent — it renders a
  "not configured" state pointing at `/demo`.
- **Single source of truth for mode.** `store.tsx` stops calling `isFirebaseConfigured()`
  directly and derives `live` from the auth provider's `mode`, so the store and the auth
  provider can never disagree.
- **Signed-out redirects respect the mode.** `AuthGuard` bounces a signed-out sandbox visitor
  to `/demo` (preserving `?next=`), not to `/login`.
- **Sign-out leaves the sandbox.** `signOut()` clears the flag so the tab returns to live mode.
- E2E helpers, `a11y`/`e1`/`e9` specs, and both Playwright configs point at `/demo` for
  preset-account sign-in.

## Capabilities

### New Capabilities
- `demo-sandbox-mode`: The `/demo` entry point, per-tab sandbox activation and teardown, and the
  coexistence rules that let sandbox and live sessions run against the same deployment.

### Modified Capabilities
<!-- None. The existing specs (account-provisioning, appointment-sync, invoicing,
     profile-premises) describe domain behaviour that is unchanged by this routing/mode split. -->

## Impact

- **Routes**: new `src/app/demo/page.tsx`; `src/app/login/page.tsx` behaviour narrowed to live.
- **Auth/state**: `src/lib/demo/auth.tsx` (mode becomes state + `enterDemoMode`/`exitDemoMode`,
  `resolved` derived), `src/lib/demo/store.tsx:155` (derive `live` from `mode`),
  new `src/lib/demo/demoMode.ts` (pure, Storage-injected — mirrors `loginPrefs.ts`).
- **Components**: `src/components/app/LoginForm.tsx` split into separately-exported live and
  demo forms; `src/lib/demo/authRedirect.ts` `loginUrlFor` gains a mode argument.
- **Tests**: `src/components/app/__tests__/LoginForm.test.tsx`, `AuthGuard*` tests; `e2e/helpers.ts`,
  `e2e/a11y.spec.ts`, `e2e/e1-login.spec.ts`, `e2e/e9-marketing.spec.ts`,
  `e2e-emulator/roundtrip.spec.ts`, `playwright.config.ts`, `playwright.emulator.config.ts`.
- **No backend, Firestore, or Cloud Functions changes.** No change to the marketing nav's
  existing "Log in" link.

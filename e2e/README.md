# End-to-end tests (Playwright)

Critical-journey E2E coverage for the web app. Complements the vitest unit/component suite
(`npm test`) — see [../docs/TEST_PLAN.md](../docs/TEST_PLAN.md) §3.

## Running

```bash
npm run test:e2e         # headless, all journeys (chromium)
npm run test:e2e:ui      # Playwright UI mode for debugging
npx playwright test e2e/e2-patient-consent.spec.ts   # a single journey
```

The first run needs the browser once: `npx playwright install chromium`.

`playwright.config.ts` starts its own dev server on port **3097** — no need to run `next dev`
yourself.

## How it works: demo mode

The E2E server runs `next dev` with the six `NEXT_PUBLIC_FIREBASE_*` vars **blanked**
(`webServer.env` in the config). That makes `isFirebaseConfigured()` return false, so the app
boots in **demo mode**: it hydrates from the deterministic seed (`buildSeedState()` + a fixed
`SEED_NOW`) with a role-picker login and no backend. Journeys therefore run fully offline against
identical data every time, with no Firebase project or emulator.

The demo role-picker is served from **`/demo`**, which also switches the tab into sandbox mode
(a per-tab `ax.demoMode` sessionStorage flag). `/login` is the real Firebase login and never
serves the picker — with no Firebase env, as in this run, it renders a "sign-in unavailable"
state linking to `/demo`.

`e2e/helpers.ts` provides `loginAsDemo(page, DEMO.<role>)`, `fillNewPatient(...)`, and
`drawSignature(page)` (mouse-drag on the consent canvas).

## Two demo-mode constraints that shape these tests

1. **The store resets on any full page load.** `DemoStoreProvider` lives in the `/app` layout, so
   `page.goto()` to another route (or a sign-out → `/demo`) unmounts it and re-seeds. Journeys
   navigate by **clicking in-app links**, never `page.goto`, once signed in.
2. **No shared state across accounts.** Switching from one demo account to another requires a
   sign-out (→ reload → re-seed). So a true cross-role round-trip with shared state (nurse submits
   → doctor approves the *same* request) can't be one E2E here.

## Journeys

| Spec | Journey | Status |
|---|---|---|
| `e1-login` | Login → role-correct nav + admin/clinical separation; signed-out redirect (E1/E8) | ✅ |
| `e2-patient-consent` | Nurse: create patient → sign consent → verify on file + in list (E2) | ✅ |
| `e3-authorisation-approval` | E3a doctor approves a seeded pending request; E3b nurse raises a request | ✅ |
| `e5-billing-invoice` | Doctor: generate tax invoice → download PDF (E5, validates PR #101 layout) | ✅ |
| `e4-consult-call` | Doctor starts a consult → simulated ring → in-call → end (E4) | ✅ |
| `e6-admin-audit` | Admin patient lookup → open file → audit trail records the access (E6) | ✅ |
| `e7-emergency-auth` | Approved filler → standing Hyaluronidase emergency auth on the file (E7) | ✅ |
| `e9-marketing` | Public pages load + link to /login; legal pages render (E9) | ✅ |
| `e11-route-separation` | /demo and /login each serve only their own form (E11) | ✅ |
| `e10-mobile` | Pixel 5 viewport: intake + billing render with no horizontal overflow (E10) | ✅ |
| `a11y` | axe-core over demo / login / marketing / dashboard, serious+critical gate | ✅ |

PDF assertions check the download triggers + filename only; **PDF content correctness stays in
the unit tests** (`src/lib/demo/__tests__/invoice-pdf.test.ts` etc.).

The `a11y` spec excludes the `color-contrast` rule as a known baseline exception (the tinted/muted
palette trips AA contrast on a few nodes) — tracked as separate debt; the check still guards
structural a11y. Re-enable once contrast is fixed.

## CI

`.github/workflows/test.yml` runs the unit suite (`test:coverage`) and the E2E suite on every PR
and push to `main`, uploading the coverage and Playwright reports as artifacts.

## Not yet covered (see TEST_PLAN §3)

- **Full cross-role E3 round-trip** — needs a live/emulator suite (see constraint 2).
- Fix the `color-contrast` a11y baseline, then re-enable the rule.

# Test Plan — AestheticX Web App (UI + Functions)

**Status:** Draft v3 — 2026-07-17
**Now:** 986 tests / 98 files passing (vitest + jsdom + Testing Library), **0 errors**. Coverage reporting wired (`npm run test:coverage`, v8). **No E2E framework yet.**

Progress since v1: the 3 stale-mock errors are fixed; the HIGH-priority component gaps (auth entry, booking approval, clinical forms) landed via [#105](https://github.com/ZhenDeng/Aestheticx-marketing/pull/105); the calendar page got an integration smoke test via [#103](https://github.com/ZhenDeng/Aestheticx-marketing/pull/103); coverage tooling + this plan land in the tooling PR.

### Measured coverage (lines %) — baseline → current
| Area | Baseline | Current | Notes |
|---|---|---|---|
| **All files** | 46.94 | **53.43** | branch 84.1 |
| `lib/demo` | 91.8 | 91.9 | strong — maintain |
| `lib/firebase` | 52.8 | 52.8 | live watchers/storage still thin — **next gap** |
| `app/app/bookings` | 0 | **100** | ✅ landed |
| `app/app/calendar` | 0 | **29.1** | ✅ integration smoke (shell/nav/views) |
| `components/app` | 23.8 | **57.9** | ✅ auth + clinical forms landed |
| `components/admin` | 21.0 | 21.0 | **gap** |
| `app/app/{patients,templates,admin,login}` | 0 | 0 | **gap** — no page tests (login logic covered via LoginForm) |

---

## 1. Testing Pyramid for This App

```
        /   E2E (Playwright)   \    ~10–15 journeys — critical clinical flows, real browser
       /  Component/Integration  \   ~30–40 files — page-level RTL tests with demo store
      /     Unit (vitest)          \  existing 933 — demo engine, firebase mappers, PDF builders
```

The in-memory demo backend ([src/lib/demo](../src/lib/demo)) is a big advantage: component tests can exercise real business logic without mocks, and E2E tests run fully offline against seeded data that resets on reload.

## 2. Coverage Map — Current State

### Well covered (unit) — maintain, don't expand
| Area | Existing tests |
|---|---|
| Demo engine (booking, billing, invoicing, forms, catalog, cooperation, emergency, identity, seed…) | ~66 files in `src/lib/demo/__tests__` |
| PDF builders (invoice, direction, approval, form) | invoice-pdf, direction-pdf(-ops), approval-pdf, form-pdf, render-pdf-artifact |
| Firebase layer (mappers, hydrate, live watchers, self-heal, sync errors) | 10 files in `src/lib/firebase/__tests__` |
| Auth guard + role redirects | AuthGuard, AuthGuard-role-redirect, auth-redirect |

### Partially covered (component) — extend
| Area | Has | Missing |
|---|---|---|
| Billing page | selective-invoicing | invoice list states, void/credit flows, error paths |
| Dashboard | upcoming-calls-actions | stat tiles, empty states, role-specific views |
| Profile | admin-separation, premises-merged | avatar upload, password change |
| Authorisations | doctor/nurse/empty/cross-workspace views | approve/decline actions from UI |
| Patients | admin-access-logging | list filtering/search, new/edit forms, consent flow |
| Admin console | accounts | audit page, patients admin |

### Not covered — build
| Area | Priority |
|---|---|
| **Login page + LoginForm + FirstLoginPassword** | HIGH — entry point for everything |
| **Calendar page** (layout logic tested; page UI is not) | HIGH |
| **Bookings / PendingBookings** | HIGH |
| **PatientForm, TreatmentNoteForm, AftercareForm** | HIGH — clinical data entry |
| **SignaturePad, DirectionDialog, NoteAttachments** | MEDIUM |
| Availability, Templates pages | MEDIUM |
| PatientRow, PatientAvatar, LeadFields | LOW (thin components) |
| Marketing pages (/, /for-clinics, /for-doctors, /for-nurses, privacy, terms) | LOW — smoke only |

## 3. E2E Layer (Playwright) — ✅ stood up

Playwright is live: `npm run test:e2e`, chromium, `webServer` runs `next dev` on port 3097 with
the Firebase env blanked so the app boots in the deterministic demo seed. Setup + the two
demo-mode constraints (store resets on full load; no shared state across accounts) are documented
in [../e2e/README.md](../e2e/README.md). Runs in CI on every PR (`.github/workflows/test.yml`).
**22 tests green.**

| # | Journey | Status |
|---|---|---|
| E1 | Login → role-correct nav (nurse/doctor/admin) | ✅ `e1-login` |
| E2 | Nurse: create patient → sign consent → verify on file + in list | ✅ `e2-patient-consent` |
| E3 | Authorisation handoff — E3a doctor approves seeded request, E3b nurse raises request | ✅ (halves) `e3-authorisation-approval` |
| E5 | Doctor: generate tax invoice → download PDF (validates PR #101) | ✅ `e5-billing-invoice` |
| E6 | Admin patient lookup → file access → audit trail records it | ✅ `e6-admin-audit` |
| E8 | Signed-out visitor → guarded route → login | ✅ (in `e1-login`) |
| E9 | Marketing smoke: /, /for-* + legal pages, CTAs → /login | ✅ `e9-marketing` |
| E10 | Mobile viewport (Pixel 5): intake + billing, no horizontal overflow | ✅ `e10-mobile` |
| a11y | axe-core over login / marketing / dashboard (serious+critical) | ✅ `a11y` (see note) |
| E4 | Doctor runs a simulated consult call (ring → in-call → end) | ✅ `e4-consult-call` |
| E7 | Approved filler → standing Hyaluronidase emergency authorisation on file | ✅ `e7-emergency-auth` |
| E3 (full round-trip) | nurse submits → the addressed doctor approves the *same* request → authorisations + emergency auths + prescriber recorded | ✅ **two ways** — domain-level (`cross-role-authorisation-roundtrip.test.ts`) **and** a real-browser cross-repo emulator E2E (`e2e-emulator/`) |

**E3 round-trip — now covered end-to-end.** Two complementary tests:

1. **Domain-level** (`src/lib/demo/__tests__/cross-role-authorisation-roundtrip.test.ts`) — the
   handoff over the real `backend.ts` functions with shared state: nurse `submitRequest` → the
   addressed doctor `approveRequest` → authorisations issued, adrenaline + hyaluronidase emergency
   auths granted, prescriber recorded, request cleared; plus the permission boundary. Fast, in CI.
2. **Real-browser cross-repo** (`e2e-emulator/`, `npm run test:e2e:emulator`) — the app in **live
   mode wired to the Firebase Emulator Suite**, so Firestore persists across the sign-out and the
   **real `approveRequest` Cloud Function** (from the backend repo) runs. A nurse logs in, creates a
   patient, submits a request; signs out; the doctor logs in, sees the same request hydrated from
   Firestore, and approves it for real. Requires the backend repo + emulators (see
   `e2e-emulator/README.md`); a local/manual harness, not in the standard CI. The frontend
   emulator wiring in `client.ts` is env-gated (`NEXT_PUBLIC_FIREBASE_EMULATORS`), off everywhere
   else.

**a11y note:** the `color-contrast` rule is excluded as a known baseline exception — axe reports
`serious` AA-contrast violations on a few nodes (login 1, home 2, dashboard 2) from the tinted/
muted palette. Tracked as separate debt; the check still guards structural a11y (labels, roles,
names, alt text). Re-enable the rule once contrast is fixed.

PDF assertions in E2E: assert download triggers + filename; content correctness stays in existing unit tests (`invoice-pdf.test.ts` etc.).

## 4. Component Test Conventions

- Render pages with the real demo store (seeded), not mocks — matches existing pattern in `selective-invoicing.test.tsx`.
- Query by role/label (a11y-first queries) — doubles as basic accessibility coverage.
- Each new page test covers: happy render, empty state, one error path, one role restriction (where applicable).

Example — login (highest-priority gap):

```tsx
// src/components/app/__tests__/LoginForm.test.tsx
it('rejects wrong password with an inline error, no navigation', async () => {
  render(<LoginForm />)
  await user.type(screen.getByLabelText(/email/i), 'nurse@demo.test')
  await user.type(screen.getByLabelText(/password/i), 'wrong')
  await user.click(screen.getByRole('button', { name: /sign in/i }))
  expect(await screen.findByText(/incorrect|invalid/i)).toBeInTheDocument()
})

it('routes doctor to doctor dashboard after first-login password change', async () => { … })
```

## 5. Coverage Targets

| Layer | Target | Measure |
|---|---|---|
| `src/lib/demo` + `src/lib/firebase` | 85% lines (already high) | `@vitest/coverage-v8` (to be added) |
| `src/components/app` | 75% |  |
| `src/app/app/**` pages | 60% (page shells are thin) |  |
| E2E | 10 journeys green in CI | Playwright report |

Skip coverage for: marketing pages, `types.ts`, generated/config files.

## 6. Known Gaps / Debt to Fix First

1. ~~**3 unhandled errors** in the current suite~~ — ✅ **Fixed (step 1).** Root cause: stale `vi.mock("@/lib/firebase/auth")` in `store-strictmode.test.tsx` was missing the `currentUserUid` export that `auth.tsx:53` destructures in live mode; vitest's mock proxy throws on undefined property access. Added `currentUserUid: () => null` to the mock.
2. ~~**No coverage reporting**~~ — ✅ **Wired (this tooling PR).** `@vitest/coverage-v8@2.1.9` installed, configured in `vitest.config.ts` (v8, text/html/json-summary, marketing pages + types excluded), `test:coverage` script added, `/coverage` gitignored. Threshold gates still deferred until component gaps are filled (raising the floor first avoids gate churn).
3. **No CI E2E stage** — add Playwright with `webServer` pointed at `next dev`.
4. **No a11y checks** — add `@axe-core/playwright` assertions to E2E journeys (cheap once Playwright exists).
5. **`lib/firebase` at 52.8%** — lower than the unit base suggests; live watchers / storage / formLinks are thin. Worth a pass alongside component work.

## 7. Rollout Order

1. ~~Fix the 3 unhandled test errors; add coverage reporting (baseline numbers).~~ ✅ **Done** — see §6.
2. ~~Component tests for the HIGH-priority 0%-coverage gaps: Login, Calendar page, Bookings, PatientForm/TreatmentNoteForm/AftercareForm.~~ ✅ **Done** — landed via #105 (auth + booking approval + clinical forms) and #103 (calendar integration smoke). components/app 23.8%→57.9%, overall 46.9%→53.4%.
3. ~~Install Playwright; implement E1–E3, E5 (core loop + revenue path).~~ ✅ **Done** — demo-mode constraints documented in `e2e/README.md`.
4. ~~Remaining journeys + `@axe-core/playwright` checks + CI.~~ ✅ **Done** — E4, E6, E7, E9, E10, a11y (**22 E2E tests total**) and a GitHub Actions workflow running unit + E2E on every PR. `color-contrast` a11y baseline fixed + enforced (#110).
5. ~~Full cross-role E3 round-trip.~~ ✅ **Done** — covered two ways: a fast domain-level integration test (in CI) and a real-browser cross-repo emulator E2E (`e2e-emulator/`, local/manual). See §3.
6. **← NEXT.** MEDIUM/LOW component gaps opportunistically alongside feature work (TDD): `components/admin` (21%), `app/app/patients` pages, and the thin `lib/firebase` live watchers/storage (52.8%).

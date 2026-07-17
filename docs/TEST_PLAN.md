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

## 3. E2E Layer (new — Playwright)

Critical journeys, run against `next dev` with the demo seed (deterministic, resets on reload). One spec per journey, chromium-only in CI to start.

| # | Journey | Why |
|---|---|---|
| E1 | Login as nurse → dashboard renders role-correct nav | Auth is the gate for everything |
| E2 | Nurse: create patient → complete consent → book appointment | Core clinical loop |
| E3 | Nurse: request authorisation → login as doctor → approve → direction PDF generated | Cross-role handoff (highest-risk flow) |
| E4 | Doctor: review consult call flow (ConsultCall) | Real-time UI |
| E5 | Nurse: treatment note → aftercare → billing → generate tax invoice PDF | Revenue path; validates PR #101 layout end-to-end |
| E6 | Admin: accounts console → audit log shows access events | Compliance |
| E7 | Emergency auth flow | Safety-critical (core-architecture Tier 1) |
| E8 | Role-based redirects: each role hitting a forbidden route bounces correctly | Security boundary |
| E9 | Marketing smoke: /, /for-* pages load, CTAs link to /login | Public surface |
| E10 | Mobile viewport pass over E2 + E5 | Responsive regressions |

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
3. **← NEXT.** Install Playwright; implement E1–E3, E5 (core loop + revenue path).
4. Remaining journeys E4, E6–E10 + axe checks.
5. MEDIUM/LOW component gaps opportunistically alongside feature work (TDD): `components/admin` (21%), `app/app/patients` pages, and the thin `lib/firebase` live watchers/storage (52.8%).

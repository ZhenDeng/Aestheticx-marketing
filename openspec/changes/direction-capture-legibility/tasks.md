## 1. Entry-point label

- [x] 1.1 Write a failing test asserting the Active authorisations control renders the visible text `Direction`, keeps `aria-label="Clause 68C direction"`, and exposes the clause on hover via `title` — landed in `e2e/e8-direction-export.spec.ts` rather than as a unit test: the control lives in a store/auth-heavy page component, and the e2e already drives this exact button in a real browser
- [x] 1.2 Relabel the button in `src/app/app/patients/[id]/page.tsx` (visible text → `Direction`, add `title`, leave `aria-label` and the dialog heading untouched); update the adjacent comment so it no longer describes a `68C` label
- [x] 1.3 Check the label change does not overflow the sidebar card at mobile width and that no existing test or e2e selector matched on the old `68C` text — verified by screenshot at desktop, by `e2e/e10-mobile.spec.ts` passing, and by re-pinning the e2e selector to the accessible name

## 2. Shared route selector

- [x] 2.1 Write a failing test asserting the capture dialog's Route control is a `select` offering exactly the five `ROUTES_OF_ADMINISTRATION` with `ROUTE_DISPLAY_LABELS`, resting on an unselected placeholder when no route was recovered
- [x] 2.2 Lift `RouteSelect` out of `src/app/app/patients/[id]/request/page.tsx` into a shared component, preserving its markup so the request form's existing tests pass unmodified
- [x] 2.3 Use the shared selector for the capture dialog's legacy Route field in `DirectionDialog.tsx`, replacing the free-text `Field`; keep it rendered only when `needsRouteCapture`
- [x] 2.4 Confirm a recovered route (from the originating request) shows as its display label, and that the request form still submits routes exactly as before — this surfaced that `DirectionDialog-prefill.test.tsx` seeded a *display label* (`"Intradermal"`) where the wire holds `"intradermal"`; fixture corrected to the canonical value

## 3. Inline required-field marking

- [x] 3.1 Write failing tests for: an empty required field marked `aria-invalid` with a required affordance on its label; a prefilled field carrying no invalid state; typing into a marked field clearing both the inline mark and its entry in the summary
- [x] 3.2 Map each capture field to the canonical `CLAUSE_68C_FIELDS` label it reports under, deriving inline state from the existing `missing` array — no second emptiness check
- [x] 3.3 Extend `Field` (and the route selector's wrapper) to accept the required/invalid state, wiring `aria-invalid` and `aria-describedby` plus a visible non-colour-only required affordance
- [x] 3.4 Add the one-line explanation shown only while `missing` is non-empty, worded as "couldn't be resolved from the record", not as a validation failure
- [x] 3.5 Keep the bottom-of-form summary and both export gates exactly as they are — `missingDirectionFields` is unmodified, so what counts as missing is unchanged. (`direction.ts` is touched, but only `routeForCapture`, in the review fix at 6.2 — that changes what is *prefilled*, never what is *required*.)

## 4. Live-shaped regression coverage

- [x] 4.1 Add the composite regression test to `DirectionDialog-required-fields.test.tsx`: nurse caller, `profileForUser(doctorID)` blank, authorisation with no stamped prescriber contact, medication with no route, originating request whose items carry no route
- [x] 4.2 Assert that test sees exactly `Prescriber phone`, `Principal place of practice`, `Route` marked inline; that export stays blocked; and that no value is invented for any of them
- [x] 4.3 Assert the accessible path: each marked control is reachable by its label and reports its invalid state

## 5. Verification

- [x] 5.1 Run the full unit suite; confirm `direction-pdf-ops.test.ts` still passes (pinned PDF bytes unchanged) — 115 files / 1138 tests green after the review fix, 33 e2e green
- [x] 5.2 Run `tsc --noEmit` and lint clean — no errors; no lint warnings in changed files
- [x] 5.3 Run the a11y/axe check covering the dialog, confirming the new invalid states introduce no colour-contrast or ARIA regressions — added `a11y — direction capture dialog with an unresolved field`, scanning the marked render specifically. It found a **pre-existing** `aria-prohibited-attr` defect on the repeats indicator (`aria-label` on a bare `<p>`, silently dropped for screen readers), fixed with `role="img"`
- [x] 5.4 Drive the flow in the running app: open an authorisation's Direction from the patient file, confirm the label, the constrained route selector, the inline marks, and that filling the fields unlocks Preview then Download — covered by `E8b` end to end, plus screenshots of the sidebar affordance and both dialog states

## 6. Review round

- [x] 6.1 Engineer review of the implementation — raised one HIGH: an HTML select handed a value matching no option silently selects its first *enabled* option, so a non-canonical stored route (e.g. `"Intramuscular"`) DISPLAYED as `"Intradermal"` while state and the exported PDF still held the original. Reproduced in jsdom before fixing
- [x] 6.2 Fix: `routeForCapture` refuses any non-canonical value (as it already refuses an ambiguous match), and `RouteSelect` surfaces an out-of-enum value as itself so no caller — the request form included — can have a route substituted
- [x] 6.3 Re-review after the fix: HIGH confirmed closed, independently reproduced against the patched code; no remaining CRITICAL/HIGH on the branch
- [x] 6.4 Accepted one LOW without fixing: the shared selector now emits `aria-invalid="false"` on the request form where the attribute was previously absent. Spec-valid, AT-equivalent to omission, and the dialog's own tests assert that explicit `"false"` state

## 7. Follow-up (NOT in this change)

- [ ] 7.1 Backend repo: make prescriber phone / principal place resolvable for legacy authorisations — either backfill the `prescriberPhone` / `prescriberPrincipalPlace` stamp onto pre-existing authorisation docs, or carry prescriber contact on the nurse-readable cooperation relationship doc. Until then a nurse on a pre-stamp authorisation will always be prompted for both, which this change makes legible but cannot avoid.

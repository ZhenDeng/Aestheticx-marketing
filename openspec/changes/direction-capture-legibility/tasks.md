## 1. Entry-point label

- [ ] 1.1 Write a failing test asserting the Active authorisations control renders the visible text `Direction`, keeps `aria-label="Clause 68C direction"`, and exposes the clause on hover via `title`
- [ ] 1.2 Relabel the button in `src/app/app/patients/[id]/page.tsx` (visible text → `Direction`, add `title`, leave `aria-label` and the dialog heading untouched); update the adjacent comment so it no longer describes a `68C` label
- [ ] 1.3 Check the label change does not overflow the sidebar card at mobile width and that no existing test or e2e selector matched on the old `68C` text

## 2. Shared route selector

- [ ] 2.1 Write a failing test asserting the capture dialog's Route control is a `select` offering exactly the five `ROUTES_OF_ADMINISTRATION` with `ROUTE_DISPLAY_LABELS`, resting on an unselected placeholder when no route was recovered
- [ ] 2.2 Lift `RouteSelect` out of `src/app/app/patients/[id]/request/page.tsx` into a shared component, preserving its markup so the request form's existing tests pass unmodified
- [ ] 2.3 Use the shared selector for the capture dialog's legacy Route field in `DirectionDialog.tsx`, replacing the free-text `Field`; keep it rendered only when `needsRouteCapture`
- [ ] 2.4 Confirm a recovered route (from the originating request) shows as its display label, and that the request form still submits routes exactly as before

## 3. Inline required-field marking

- [ ] 3.1 Write failing tests for: an empty required field marked `aria-invalid` with a required affordance on its label; a prefilled field carrying no invalid state; typing into a marked field clearing both the inline mark and its entry in the summary
- [ ] 3.2 Map each capture field to the canonical `CLAUSE_68C_FIELDS` label it reports under, deriving inline state from the existing `missing` array — no second emptiness check
- [ ] 3.3 Extend `Field` (and the route selector's wrapper) to accept the required/invalid state, wiring `aria-invalid` and `aria-describedby` plus a visible non-colour-only required affordance
- [ ] 3.4 Add the one-line explanation shown only while `missing` is non-empty, worded as "couldn't be resolved from the record", not as a validation failure
- [ ] 3.5 Keep the bottom-of-form summary and both export gates exactly as they are — verify `missingDirectionFields` itself is unmodified

## 4. Live-shaped regression coverage

- [ ] 4.1 Add the composite regression test to `DirectionDialog-prefill.test.tsx`: nurse caller, `profileForUser(doctorID)` blank, authorisation with no stamped prescriber contact, medication with no route, originating request whose items carry no route
- [ ] 4.2 Assert that test sees exactly `Prescriber phone`, `Principal place of practice`, `Route` marked inline; that export stays blocked; and that no value is invented for any of them
- [ ] 4.3 Assert the accessible path: each marked control is reachable by its label and reports its invalid state

## 5. Verification

- [ ] 5.1 Run the full unit suite; confirm `direction-pdf-ops.test.ts` still passes (pinned PDF bytes unchanged)
- [ ] 5.2 Run `tsc --noEmit` and lint clean
- [ ] 5.3 Run the a11y/axe check covering the dialog, confirming the new invalid states introduce no colour-contrast or ARIA regressions
- [ ] 5.4 Drive the flow in the running app: open an authorisation's Direction from the patient file, confirm the label, the constrained route selector, the inline marks, and that filling the fields unlocks Preview then Download

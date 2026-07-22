# Tasks — medication-address-autocomplete-2207

- [x] `SuggestingInput` shared combobox (ARIA pattern, keyboard + click selection, dismiss-until-typing)
- [x] `MedicationCombobox` over `searchProducts(effectiveCatalog(...))`; wire into TreatmentNoteForm manual meds
- [x] `src/lib/addressSearch.ts`: Photon query (AU bbox, keyless), AU-state formatting, dedupe, best-effort errors
- [x] `AddressAutocomplete` (debounce, abort stale requests, no lookup on mount/after selection)
- [x] Wire addresses: PatientForm, profile PremiseForm, AdminConsole (clinic address, contact address, principal place, premise rows)
- [x] Tests: addressSearch unit, AddressAutocomplete component, TreatmentNoteForm medication combobox
- [x] E2E: `e2e/e12-form-autocomplete.spec.ts` (catalog pick, address pick, geocoder outage)
- [x] a11y: axe scan of the patient form with the suggestion list open
- [x] Full vitest (1373) + Playwright (37) + build + lint green
- [x] **Follow-up (22/07)**: QLD-locality regression — `layer=house&layer=street`, `matchesQuery` relevance guard, sub-dwelling stripping, whole-street results kept; recorded-response fixture test; vitest 1390 + Playwright 38 green

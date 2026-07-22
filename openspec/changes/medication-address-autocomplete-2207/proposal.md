# medication-address-autocomplete-2207

## Why

22/07 feedback on clinical data entry: (1) the manual medication field on a treatment note is free text — the doctor has to type the exact product name from memory even though the app already carries the prescribing catalog; (2) address fields are free text everywhere — patient addresses, premises, and admin-entered addresses are typed by hand with no assistance, so formats drift and typos creep into legal documents that print these addresses.

## What Changes

- **Shared combobox affordance**: a `SuggestingInput` component implements the ARIA combobox pattern once (typed text stays authoritative, a dropdown of suggestions opens while typing, keyboard ↑/↓/Enter/Escape + click selection). Free text always remains valid — a suggestion is a shortcut, never a gate.
- **Medication combobox on treatment notes**: the doctor's manual "Medications administered" name field becomes a combobox over the effective product catalog (`searchProducts` on the hydrated catalog, falling back to the built-in seed). Selecting fills the field with the catalog display label (brand · name).
- **Address autocomplete**: an `AddressAutocomplete` component debounces the typed query against the Photon (OpenStreetMap) geocoder — keyless, Australia-bounded — and formats hits as a single AU-style line ("12 Smith Street, Richmond VIC 3121"). Selecting a hit fills the address field. Lookup is best-effort: any network failure degrades silently to plain typing. Wired into the patient form address, the profile premise form, and the admin console's address-shaped fields (clinic address, contact address, principal place of practice, premise rows).

## Capabilities

### New Capabilities

- `clinical-form-autocomplete`: suggestion-assisted entry for medication names and street addresses across clinical and admin forms.

### Modified Capabilities

_None — no stored shape changes; addresses and medication names remain plain strings end to end._

## Impact

- New: `src/components/app/SuggestingInput.tsx`, `src/components/app/MedicationCombobox.tsx`, `src/components/app/AddressAutocomplete.tsx`, `src/lib/addressSearch.ts`.
- Edited: `src/components/app/TreatmentNoteForm.tsx`, `src/components/app/PatientForm.tsx`, `src/app/app/profile/page.tsx` (PremiseForm), `src/components/admin/AdminConsole.tsx`.
- Web-only; no backend or iOS change. External call surface: `photon.komoot.io` from the browser (no key, no PII beyond the typed query).

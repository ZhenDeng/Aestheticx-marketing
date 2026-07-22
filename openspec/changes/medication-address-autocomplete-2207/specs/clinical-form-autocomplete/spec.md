# clinical-form-autocomplete

## ADDED Requirements

### Requirement: Medication name combobox on treatment notes

The manual medication name field on a treatment note SHALL offer a dropdown of catalog products matching the typed text (name or brand, case-insensitive) drawn from the effective catalog (hydrated products when present, else the built-in seed). Selecting a suggestion SHALL fill the field with the product display label. Typed free text SHALL remain saveable unchanged — the catalog assists, it does not gate.

#### Scenario: Doctor types a partial product name

- **GIVEN** a doctor adding a manual medication on a treatment note
- **WHEN** they type "boto"
- **THEN** a dropdown lists "Botox", and choosing it fills the field with "Botox"

#### Scenario: Free text medication survives

- **WHEN** the doctor types a name matching no catalog product and saves
- **THEN** the note records the typed name exactly

### Requirement: Address autocomplete fills address fields

Address entry fields (patient address, profile premise address, admin clinic/contact/principal-place/premise addresses) SHALL suggest street addresses matching the typed text once at least 4 characters are typed, debounced, sourced from a keyless geocoder bounded to Australia. Selecting a suggestion SHALL fill the field with a single formatted line "«number street», «locality» «STATE» «postcode»". A lookup failure SHALL degrade silently to plain typing and SHALL NOT block saving.

#### Scenario: Selecting a suggested address

- **WHEN** a nurse types "1 Collins" into the patient address field and picks a suggestion
- **THEN** the address field holds the formatted single-line address for the chosen suggestion

#### Scenario: Geocoder unreachable

- **WHEN** the geocoder request fails or times out
- **THEN** no dropdown appears and the typed address saves as entered

### Requirement: Combobox interaction pattern

Suggestion dropdowns SHALL follow the ARIA combobox pattern: the input carries `role="combobox"` with `aria-expanded`/`aria-controls`/`aria-activedescendant`, options carry `role="option"`, ArrowDown/ArrowUp move the active option, Enter selects the active option without submitting the enclosing form, Escape dismisses, and clicking an option selects it. The dropdown SHALL NOT reopen after a selection until the user types again.

#### Scenario: Keyboard selection

- **WHEN** the user types a query, presses ArrowDown then Enter
- **THEN** the highlighted suggestion fills the field and the enclosing form is not submitted

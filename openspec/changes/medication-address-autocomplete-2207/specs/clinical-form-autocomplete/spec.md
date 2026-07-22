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

### Requirement: Only the typed address is ever suggested

Because these fields print onto Clause 68C authorisations and tax invoices, a suggestion SHALL be offered only when it is what the user asked for. The system SHALL request address-class features only, and SHALL additionally reject any result that is not an address feature, that does not carry the typed street number, or whose street name does not contain the typed street anchor word. A sub-dwelling designator ("Unit 5", "Suite 5", "5/200", "Shop 3", "Level 1") SHALL be stripped before both the geocoder request and the street-number comparison. An empty dropdown SHALL be the outcome when nothing matches — the field is free text, so the user simply keeps typing.

#### Scenario: Locality ranked above real addresses

- **GIVEN** the geocoder ranks locality features above street addresses for a partial query
- **WHEN** the user types "1 Smith"
- **THEN** no locality is offered, and every suggestion is a real "1 … Smith …" street address

#### Scenario: Fuzzy match on a different street

- **WHEN** the user types "15 Gympie Road" and the geocoder answers with "Everson Road, Gympie"
- **THEN** nothing is suggested

#### Scenario: Different street number

- **WHEN** the user types "20 Wickham Terrace" and only number 22 exists
- **THEN** number 22 is not offered

#### Scenario: Sub-dwelling designator

- **WHEN** the user types "Suite 5 200 Queen Street"
- **THEN** the geocoder is queried for "200 queen street" and "5 Queen Street" is never offered

#### Scenario: Street typed without a number

- **WHEN** the user types "Chapel Street"
- **THEN** whole-street suggestions such as "Chapel Street, Prahran VIC 3181" are offered

### Requirement: Combobox interaction pattern

Suggestion dropdowns SHALL follow the ARIA combobox pattern: the input carries `role="combobox"` with `aria-expanded`/`aria-controls`/`aria-activedescendant`, options carry `role="option"`, ArrowDown/ArrowUp move the active option, Enter selects the active option without submitting the enclosing form, Escape dismisses, and clicking an option selects it. The dropdown SHALL NOT reopen after a selection until the user types again.

#### Scenario: Keyboard selection

- **WHEN** the user types a query, presses ArrowDown then Enter
- **THEN** the highlighted suggestion fills the field and the enclosing form is not submitted

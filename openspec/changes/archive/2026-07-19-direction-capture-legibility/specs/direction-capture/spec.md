## MODIFIED Requirements

### Requirement: Route prefills from the originating request

When the authorisation's medication carries no route, the capture dialog SHALL prefill Route
from the matching line item on the originating authorisation request, which recorded a route at
submission. It SHALL use a match only when that match is unambiguous.

Route SHALL be captured through the same constrained five-option selector the request form uses
(`ROUTES_OF_ADMINISTRATION`, labelled by `ROUTE_DISPLAY_LABELS`), never as free text: a route
printed on a Clause 68C direction SHALL be one of the five legal values. As on the request form,
the selector SHALL NOT be pre-chosen when no route could be recovered — the clinician must make an
active choice.

A recovered route that is not one of the five canonical values SHALL be refused, exactly as an
ambiguous match is, and the field reported as still needed. The selector SHALL NEVER display a
route other than the value it was given.

#### Scenario: Route recovered from the request

- **WHEN** an authorisation's medication has no route
- **AND** the originating request has exactly one line item matching that medication's name and
  dosage, carrying a route
- **THEN** Route is prefilled with that route
- **AND** the selector shows that route's display label

#### Scenario: Ambiguous match is not guessed

- **WHEN** more than one line item on the originating request matches the medication's name and
  dosage
- **THEN** Route is left blank and reported as still needed
- **AND** no route is invented

#### Scenario: Originating request unavailable

- **WHEN** the originating request is not present in the loaded state
- **THEN** Route is left blank rather than erroring

#### Scenario: The medication's own route still wins

- **WHEN** the authorisation's medication already carries a route
- **THEN** no Route capture field is shown and the medication's route is used

#### Scenario: Route cannot be free text

- **WHEN** the Route capture field is shown
- **THEN** it offers exactly the five routes of administration and no other value can be entered

#### Scenario: An unrecovered route is not pre-chosen

- **WHEN** no route could be recovered from the medication or the originating request
- **THEN** the selector rests on an unselected placeholder rather than defaulting to a route

#### Scenario: A non-canonical stored route is refused, not substituted

- **WHEN** the matching line item carries a route that is not one of the five canonical values
- **THEN** Route is left blank and reported as still needed
- **AND** no canonical route is shown in its place

#### Scenario: The selector never displays a route it was not given

- **WHEN** the selector is given a value outside the five routes
- **THEN** it shows that value, marked as unrecognised
- **AND** it does not silently select a different route

## ADDED Requirements

### Requirement: A required-but-empty capture field is marked at the field

Every capture field that `missingDirectionFields` reports SHALL carry an inline required
affordance on its own label and an accessible invalid state on its own control, in addition to the
existing bottom-of-form summary. A clinician SHALL be able to tell which specific input needs
attention without reading the summary line.

The dialog SHALL also state, once, that the missing values could not be resolved from the record
and that supplying them unblocks the export — so a blank field reads as a prompt rather than as a
defect.

Marking SHALL be driven by the same `missingDirectionFields` result that gates export, so the
inline state and the summary can never disagree.

#### Scenario: An empty required field is marked inline

- **WHEN** the direction capture dialog opens with Prescriber phone unresolved
- **THEN** the Phone field is marked as required and invalid on the control itself
- **AND** the bottom-of-form summary still lists Prescriber phone

#### Scenario: A resolved field carries no invalid state

- **WHEN** a capture field is prefilled
- **THEN** it is not marked invalid

#### Scenario: Filling a field clears its inline mark

- **WHEN** the clinician types into a field that was marked invalid
- **THEN** the inline invalid mark clears
- **AND** the field is removed from the bottom-of-form summary

#### Scenario: The explanation is shown once, only while something is missing

- **WHEN** one or more required fields are unresolved
- **THEN** the dialog explains that the values could not be resolved from the record and that
  entering them enables the export
- **AND** when nothing is missing, that explanation is not shown

#### Scenario: A nurse on a legacy authorisation is prompted, not blocked silently

- **WHEN** a nurse captures a direction for an authorisation carrying no stamped prescriber
  contact, whose medication has no route, whose originating request's items have no route, and
  whose prescriber profile is not loaded
- **THEN** Phone, Principal place of practice and Route are each marked required and invalid
  inline
- **AND** the export stays blocked
- **AND** no value is invented for any of them

### Requirement: The direction affordance is named for the document it produces

The control that opens the direction capture from the Active authorisations list SHALL be
labelled for the document it produces rather than for the regulation clause. The Clause 68C
citation SHALL remain available on that control as supplementary text, and SHALL remain in the
dialog heading and in the control's accessible name.

#### Scenario: The list affordance reads as a document

- **WHEN** the Active authorisations list renders an authorisation
- **THEN** its direction control is labelled `Direction`
- **AND** it is not labelled with the bare clause number

#### Scenario: The legal citation is still reachable

- **WHEN** the direction control is rendered
- **THEN** its accessible name still identifies it as the Clause 68C direction
- **AND** hovering it reveals the Clause 68C reference

#### Scenario: The dialog still names the clause

- **WHEN** the direction capture dialog opens
- **THEN** its heading still reads `Clause 68C direction`

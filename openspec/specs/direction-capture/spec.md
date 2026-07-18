# direction-capture Specification

## Purpose

What the NSW Clause 68C direction capture dialog prefills, from which source, and — just as
importantly — what it must refuse to guess. The direction is a legal document: an unfilled
field prompts the clinician, whereas a wrongly-filled one can state the wrong route of
administration or the wrong premises, so every rule here prefers blank over uncertain.

## Requirements

### Requirement: Premises of administration follows clinic, then stamp, then the acting user

The direction capture dialog SHALL resolve Premises of administration by the same precedence the
approval document uses: the clinic's address when the authorisation has a clinic context, else
the premise stamped on the authorisation, else the acting user's currently selected premise
(selected → default → first). When the authorisation has a clinic context the acting user's own
premises SHALL NEVER be used. The field SHALL remain editable.

#### Scenario: Clinic authorisation uses the clinic's address

- **WHEN** a direction is captured for an authorisation with a clinic context
- **THEN** Premises of administration shows the clinic's address
- **AND** it does not show the acting clinician's own premises

#### Scenario: Clinic authorisation whose clinic cannot be resolved is left blank

- **WHEN** the authorisation has a clinic context but the clinic cannot be resolved
- **THEN** Premises of administration is blank and is reported as still needed
- **AND** the acting clinician's own premises are not substituted

#### Scenario: Stamped premise wins for an independent authorisation

- **WHEN** a direction is captured for an independent authorisation with a stamped premise
- **THEN** Premises of administration shows that premise, not the acting user's selection

#### Scenario: Falls back to the acting user's selected premise

- **WHEN** a direction is captured for an independent authorisation with no stamped premise
- **AND** the acting user has a selected premise
- **THEN** Premises of administration shows that premise

#### Scenario: Falls back through default to first

- **WHEN** the acting user has no selected premise, or the selection names a premise that no
  longer exists
- **THEN** the default premise is used, and failing that the first premise on file

#### Scenario: Blank when nothing is available

- **WHEN** an independent authorisation has no stamped premise and the acting user has no
  premises
- **THEN** Premises of administration is blank and is reported as still needed

### Requirement: Route prefills from the originating request

When the authorisation's medication carries no route, the capture dialog SHALL prefill Route
from the matching line item on the originating authorisation request, which recorded a route at
submission. It SHALL use a match only when that match is unambiguous.

#### Scenario: Route recovered from the request

- **WHEN** an authorisation's medication has no route
- **AND** the originating request has exactly one line item matching that medication's name and
  dosage, carrying a route
- **THEN** Route is prefilled with that route

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

### Requirement: The dialog does not assert an administration schedule

Number & intervals SHALL default to `PRN` and SHALL NOT pre-fill an invented count or interval.

#### Scenario: Default is PRN

- **WHEN** the direction capture dialog opens
- **THEN** Number & intervals reads `PRN`
- **AND** it does not read a count-and-interval schedule the clinician did not enter

#### Scenario: Clinician can still state a schedule

- **WHEN** the clinician replaces the default with a specific schedule
- **THEN** that value is carried onto the direction and its PDF

### Requirement: Prefilled values remain editable

Every prefilled capture field SHALL remain editable, and an edit SHALL be carried onto the
direction and its exported PDF.

#### Scenario: An edited prefill is honoured

- **WHEN** the clinician edits a prefilled Premises of administration or Route
- **THEN** the direction and the exported PDF use the edited value

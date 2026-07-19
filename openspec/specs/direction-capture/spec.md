# direction-capture Specification

## Purpose

What the NSW Clause 68C direction capture dialog prefills, from which source, and — just as
importantly — what it must refuse to guess. The direction is a legal document: an unfilled
field prompts the clinician, whereas a wrongly-filled one can state the wrong route of
administration or the wrong premises, so every rule here prefers blank over uncertain.
## Requirements
### Requirement: Premises of administration follows clinic, then stamp, then the acting user

The direction capture dialog SHALL resolve Premises of administration by the same precedence the
approval document uses: the clinic's premises when the authorisation has a clinic context, else
the premise stamped on the authorisation, else the acting user's currently selected premise
(selected → default → first). When the authorisation has a clinic context the acting user's own
premises SHALL NEVER be used. The clinic's premises SHALL be read from the stamp written onto the
authorisation at approval, never looked up at render time. The field SHALL remain editable.

#### Scenario: Clinic authorisation uses the stamped clinic premises

- **WHEN** a direction is captured for an authorisation with a clinic context
- **AND** the authorisation carries a stamped clinic premises
- **THEN** Premises of administration shows that clinic's name and address
- **AND** it does not show the acting clinician's own premises

#### Scenario: A stamped clinic premises with no name shows its address

- **WHEN** the stamped clinic premises carries an address but no name
- **THEN** Premises of administration shows the address alone

#### Scenario: Clinic authorisation with no stamped premises is left blank

- **WHEN** the authorisation has a clinic context but carries no stamped clinic premises
- **THEN** Premises of administration is blank and is reported as still needed
- **AND** the acting clinician's own premises are not substituted

#### Scenario: The clinic's identifier is never shown as its name

- **WHEN** the clinic's name cannot be resolved
- **THEN** the clinic identifier SHALL NOT be shown in its place on the direction

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

### Requirement: Prescriber phone and principal place prefill from the approval stamp

The direction capture dialog SHALL prefill Prescriber phone and Principal place of practice from
the values stamped on the authorisation at approval. When a value is not stamped, it SHALL fall
back to the prescriber's profile. The two fields SHALL resolve independently, and both SHALL
remain editable.

Approval SHALL write that stamp from the profile of the doctor who approved, in demo exactly as in
live. Each field SHALL be omitted when the profile holds no usable value, never stamped blank: a
blank stamp would both empty the field on the document and satisfy the `missingDirectionFields`
gate that exists to catch it, whereas an omitted one lets the reader fall back to the profile.

#### Scenario: Stamped contact wins over the profile

- **WHEN** a direction is captured for an authorisation carrying stamped prescriber contact
- **THEN** Phone and Principal place of practice show the stamped values

#### Scenario: A nurse sees the stamped contact

- **WHEN** a nurse captures a direction and the prescriber's profile is not loaded
- **AND** the authorisation carries stamped prescriber contact
- **THEN** both fields are prefilled rather than blank

#### Scenario: Approval stamps the approving doctor's contact

- **WHEN** a doctor approves an authorisation request
- **THEN** every authorisation granted carries that doctor's phone and principal place of practice
- **AND** it is that doctor's, not the requesting nurse's and not the clinic's

#### Scenario: An unusable profile value is omitted, not stamped blank

- **WHEN** the approving doctor's profile holds no usable phone
- **THEN** the granted authorisation carries no prescriber phone at all
- **AND** it does not carry an empty prescriber phone

#### Scenario: The two stamped fields are independent

- **WHEN** the approving doctor holds a usable phone but no principal place of practice
- **THEN** the granted authorisation carries the phone and omits the principal place

#### Scenario: Falls back to the prescriber profile when unstamped

- **WHEN** a direction is captured for an authorisation approved before the stamp shipped
- **AND** the prescriber's profile is loaded
- **THEN** both fields show the profile values, as they did before

#### Scenario: The two fields resolve independently

- **WHEN** the authorisation carries a stamped phone but no stamped principal place
- **THEN** Phone shows the stamp and Principal place of practice falls back to the profile

#### Scenario: A single unresolved field blocks export on its own

- **WHEN** Phone resolves from the stamp or the profile
- **AND** Principal place of practice resolves from neither
- **THEN** `missingDirectionFields` reports Principal place of practice alone, and export stays blocked

#### Scenario: Blank when neither source has a value

- **WHEN** nothing is stamped and the prescriber's profile is not loaded
- **THEN** both fields are blank and `missingDirectionFields` reports them, blocking export

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


## MODIFIED Requirements

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

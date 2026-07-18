## MODIFIED Requirements

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

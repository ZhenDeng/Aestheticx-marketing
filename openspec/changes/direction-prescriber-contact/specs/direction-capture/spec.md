## ADDED Requirements

### Requirement: Prescriber phone and principal place prefill from the approval stamp

The direction capture dialog SHALL prefill Prescriber phone and Principal place of practice from
the values stamped on the authorisation at approval. When a value is not stamped, it SHALL fall
back to the prescriber's profile. The two fields SHALL resolve independently, and both SHALL
remain editable.

#### Scenario: Stamped contact wins over the profile

- **WHEN** a direction is captured for an authorisation carrying stamped prescriber contact
- **THEN** Phone and Principal place of practice show the stamped values

#### Scenario: A nurse sees the stamped contact

- **WHEN** a nurse captures a direction and the prescriber's profile is not loaded
- **AND** the authorisation carries stamped prescriber contact
- **THEN** both fields are prefilled rather than blank

#### Scenario: Falls back to the prescriber profile when unstamped

- **WHEN** a direction is captured for an authorisation approved before the stamp shipped
- **AND** the prescriber's profile is loaded
- **THEN** both fields show the profile values, as they did before

#### Scenario: The two fields resolve independently

- **WHEN** the authorisation carries a stamped phone but no stamped principal place
- **THEN** Phone shows the stamp and Principal place of practice falls back to the profile

#### Scenario: Blank when neither source has a value

- **WHEN** nothing is stamped and the prescriber's profile is not loaded
- **THEN** both fields are blank and `missingDirectionFields` reports them, blocking export

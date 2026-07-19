## ADDED Requirements

### Requirement: A required profile field cannot be cleared once provisioned

The profile editor SHALL NOT allow a phone (every account) or a principal place of practice (every
doctor) to be saved blank. Provisioning already requires both, because they print on the Clause
68C direction and are stamped onto each authorisation at approval.

An attempt to clear one SHALL be refused with an explanation of what it would break — the field is
not merely invalid, it silently disables every direction drawn from that doctor's future
approvals, and the doctor who cleared it would never see the consequence. Other edits in the same
save SHALL NOT be applied while a required field is blank.

EVERY blocked field SHALL be marked and named at once, not merely the first, so a doctor whose
profile is missing both is not sent round the loop twice. The refusal SHALL clear as soon as the
offending fields are corrected, without requiring a further save attempt.

#### Scenario: A doctor cannot clear their phone

- **WHEN** a doctor empties Phone and saves
- **THEN** the change is refused and the stored phone is unchanged
- **AND** the editor explains that directions from their approvals would be blocked without it

#### Scenario: A doctor cannot clear their principal place of practice

- **WHEN** a doctor empties Principal place of practice and saves
- **THEN** the change is refused and the stored value is unchanged

#### Scenario: Whitespace does not count as a value

- **WHEN** a required field is saved containing only spaces
- **THEN** it is refused exactly as an empty field is

#### Scenario: Both blank fields are marked together

- **WHEN** a doctor saves with neither a phone nor a principal place of practice
- **THEN** both controls are marked invalid
- **AND** the refusal names both fields

#### Scenario: The refusal clears without a second save

- **WHEN** a doctor supplies a value for a field the refusal named
- **THEN** that field's mark clears immediately
- **AND** the refusal does not persist once no required field is blank

#### Scenario: A valid edit still saves

- **WHEN** a doctor changes Phone to another non-blank value
- **THEN** it is saved and the refusal is not shown

#### Scenario: An unrelated edit is not applied alongside a refused one

- **WHEN** a doctor blanks Phone and edits AHPRA in the same save
- **THEN** neither change is applied

#### Scenario: Principal place is only required of doctors

- **WHEN** an account that holds no doctor role saves a profile with no principal place
- **THEN** the save is allowed, that field not being shown or required for them

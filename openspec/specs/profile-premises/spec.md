# profile-premises Specification

## Purpose

The unified "Premises of administration" surface in the Profile page for nurse-role accounts, which merges the free-text Address block with the premise list and its active-premise selection.

## Requirements

### Requirement: One merged premises-of-administration section in Profile
For accounts holding a nurse role, the Profile page SHALL present a single "Premises of administration" section that replaces the separate free-text Address block. The section SHALL lead with the currently selected place of practice (name + address). Clicking the current selection SHALL open the premise list, from which the user can switch the active premise. The Add / Edit / Delete management actions SHALL sit at the bottom of the premise list.

#### Scenario: Current selection is the address display
- **WHEN** a nurse opens Profile
- **THEN** the premises section shows the active premise's name and address as its primary display, and no separate free-text Address block renders for the nurse

#### Scenario: Switch active premise from Profile
- **WHEN** the nurse clicks the current selection and picks a different premise from the list
- **THEN** that premise becomes the active place of practice (the same selection the dashboard switcher and authorisation stamping use)

#### Scenario: Management actions at the bottom
- **WHEN** the premise list is open
- **THEN** Add premise sits at the bottom of the list, and Edit/Delete for a premise are reachable from its row without crowding the selection

#### Scenario: Non-nurse accounts unchanged
- **WHEN** an account without a nurse role opens Profile
- **THEN** the existing Address block renders as before

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

#### Scenario: An unrelated edit is not applied alongside a refused one

- **WHEN** a doctor blanks Phone and edits AHPRA in the same save
- **THEN** neither change is applied

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

#### Scenario: Principal place is only required of doctors

- **WHEN** an account that holds no doctor role saves a profile with no principal place
- **THEN** the save is allowed, that field not being shown or required for them

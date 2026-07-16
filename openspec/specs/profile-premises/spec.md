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

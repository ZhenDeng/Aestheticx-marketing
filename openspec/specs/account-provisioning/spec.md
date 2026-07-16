# account-provisioning Specification

## Purpose

How Super-Admin-created accounts (doctor, nurse, clinic) are initialised so they are fully usable on first login, and how account-creation data (including ABN and contact address) reaches the user's profile.

## Requirements

### Requirement: Admin-created accounts are immediately usable
An account created by a Super Admin (doctor, nurse or clinic type, including a nurse linked under a supervising doctor via a cooperation relationship) SHALL be fully initialised at creation — auth user, role claims, profile document and any linkage records — such that after the user's first login every feature designated for their role works without a manual repair step. A failure during creation SHALL be reported to the admin at creation time, not discovered later by the new user as unexplained save failures.

#### Scenario: New nurse under a supervising doctor
- **WHEN** a Super Admin creates a nurse account and links it under a supervising doctor
- **THEN** the nurse can sign in, complete the first-login password change, and immediately use every nurse feature (patients, requests, bookings, profile edits) without any save being rejected

#### Scenario: No permanent phantom error banner
- **WHEN** a freshly created user performs a normal action and the write is rejected by the server
- **THEN** the app surfaces a message naming the failure category (permission vs connectivity), and a refresh reflects the server's actual state rather than re-showing the same stuck banner

### Requirement: ABN and Address persist from creation to Profile
The `ABN` and `Address` values a Super Admin enters on the account-creation form SHALL be persisted onto the new user's profile record and SHALL render on that user's Profile page on their first login. ABN SHALL remain admin-set (immutable to the user); Address SHALL remain user-editable thereafter.

#### Scenario: ABN entered at creation shows in Profile
- **WHEN** the Super Admin fills ABN while creating an account and the new user later opens Profile
- **THEN** the ABN row shows the entered value

#### Scenario: Address entered at creation shows in Profile
- **WHEN** the Super Admin fills Address while creating an account and the new user later opens Profile
- **THEN** the Address field is pre-filled with the entered value and stays editable by the user

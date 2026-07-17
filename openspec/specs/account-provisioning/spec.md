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

### Requirement: Wiped role claims self-heal at sign-in
An account whose ID-token custom claims carry an empty `roles` list while its `users/{uid}` profile document holds one or more roles (the wiped-claims signature) SHALL be repaired automatically during sign-in identity resolution — the client requests a server-side claims re-derivation for itself, refreshes its ID token, and resolves identities from the repaired claims — with no administrator involvement and no manual repair control anywhere in the UI. The server SHALL derive the repaired claims exclusively from the caller's own profile document (server truth), so a self-repair can never grant more than the profile already records. A self-repair failure SHALL leave sign-in behaviour identical to today (the existing categorised permission banner), never block sign-in.

#### Scenario: Wiped nurse account heals on next sign-in
- **WHEN** a nurse whose claims were wiped (token roles empty, users doc says `nurse`) signs in
- **THEN** her claims are re-derived server-side from her users doc, her token is refreshed, and she lands in the app with full nurse access — no admin action required

#### Scenario: Self-repair cannot escalate privileges
- **WHEN** any signed-in user triggers a self-repair
- **THEN** the resulting claims equal exactly what their `users/{uid}` doc records — a caller whose doc has no roles receives no roles (and a self-repair that would derive no roles is refused rather than wiping a healthy account's claims)

#### Scenario: Healthy accounts skip the repair
- **WHEN** a user whose token already carries non-empty roles signs in
- **THEN** no repair call is made and sign-in proceeds unchanged

### Requirement: Admin accounts list stays within the viewport
The admin console accounts list SHALL never cause horizontal page overflow at any supported viewport width. Row action controls SHALL wrap onto additional lines when the row is too narrow to hold them beside the account name, and long names/emails SHALL truncate rather than stretch the row.

#### Scenario: Narrow viewport wraps actions
- **WHEN** a Super Admin views the accounts list at a narrow width (e.g. 768px)
- **THEN** each row's action buttons wrap below the account identity instead of pushing the page wider than the screen

#### Scenario: No horizontal scrollbar
- **WHEN** the accounts list renders at any width from 360px up
- **THEN** the document body has no horizontal scrollbar attributable to the list

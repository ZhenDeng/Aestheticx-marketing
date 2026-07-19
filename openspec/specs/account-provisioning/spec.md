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

### Requirement: Clinic accounts hydrate successfully on first login
A freshly created clinic account SHALL complete live hydration and land on its dashboard without a permission error. Specifically: every Firestore list query the client issues for a clinic scope (including the clinic-calendar `appointments where ownerId == clinicId` query) SHALL be provable under the deployed security rules for a clinic member, and the clinic-calendar read grant SHALL cover all clinic members (`inClinic`), matching the existing clinic-member pattern used by `externalBusy` and `slotPublications`. The web client SHALL treat the clinic-scope appointments query as best-effort so a rules/web deploy in either order (or a future rules regression) degrades that single scope rather than aborting login.

#### Scenario: New clinic account first login
- **WHEN** a super admin creates a clinic account and the clinic signs in and completes the first-login password change
- **THEN** hydration completes, the dashboard renders, and no permission-denied banner is shown

#### Scenario: Clinic member sees the clinic calendar
- **WHEN** a signed-in clinic member lists appointments owned by their clinic
- **THEN** the rules permit the list query, and an outsider issuing the same query for a clinic they do not belong to is denied

#### Scenario: Web deployed before the rules fix
- **WHEN** the web client with the best-effort clinic-scope query runs against rules that still lack the clinic-member appointments arm
- **THEN** login still succeeds with an empty clinic-calendar scope instead of a permission-denied lockout

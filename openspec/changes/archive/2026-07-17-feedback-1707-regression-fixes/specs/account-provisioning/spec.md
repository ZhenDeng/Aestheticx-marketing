# account-provisioning — delta (feedback-1707-regression-fixes)

## ADDED Requirements

### Requirement: Wiped role claims self-heal at sign-in
An account whose ID-token custom claims carry an empty `roles` list while its `users/{uid}` profile document holds one or more roles (the wiped-claims signature) SHALL be repaired automatically during sign-in identity resolution — the client requests a server-side claims re-derivation for itself, refreshes its ID token, and resolves identities from the repaired claims — with no administrator involvement and no manual repair control anywhere in the UI. The server SHALL derive the repaired claims exclusively from the caller's own profile document (server truth), so a self-repair can never grant more than the profile already records. A self-repair failure SHALL leave sign-in behaviour identical to today (the existing categorised permission banner), never block sign-in.

#### Scenario: Wiped nurse account heals on next sign-in
- **WHEN** a nurse whose claims were wiped (token roles empty, users doc says `nurse`) signs in
- **THEN** her claims are re-derived server-side from her users doc, her token is refreshed, and she lands in the app with full nurse access — no admin action required

#### Scenario: Self-repair cannot escalate privileges
- **WHEN** any signed-in user triggers a self-repair
- **THEN** the resulting claims equal exactly what their `users/{uid}` doc records — a caller whose doc has no roles receives no roles

#### Scenario: Healthy accounts skip the repair
- **WHEN** a user whose token already carries non-empty roles signs in
- **THEN** no repair call is made and sign-in proceeds unchanged

## REMOVED Requirements

### Requirement: Manual admin repair control
**Reason**: The 16/07 "Repair access" button treated a symptom; recovery is now automatic at sign-in and the root cause (first-login claims wipe) is fixed server-side, so a manual admin-facing repair control is unwanted UI surface.
**Migration**: None needed for users — the self-heal covers every account the button covered. The superAdmin arm of the `syncUserClaims` callable remains for operational use via script.

## ADDED Requirements

### Requirement: Admin accounts list stays within the viewport
The admin console accounts list SHALL never cause horizontal page overflow at any supported viewport width. Row action controls SHALL wrap onto additional lines when the row is too narrow to hold them beside the account name, and long names/emails SHALL truncate rather than stretch the row.

#### Scenario: Narrow viewport wraps actions
- **WHEN** a Super Admin views the accounts list at a narrow width (e.g. 768px)
- **THEN** each row's action buttons wrap below the account identity instead of pushing the page wider than the screen

#### Scenario: No horizontal scrollbar
- **WHEN** the accounts list renders at any width from 360px up
- **THEN** the document body has no horizontal scrollbar attributable to the list

# account-provisioning Delta

## ADDED Requirements

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

## ADDED Requirements

### Requirement: Filled micro pills stay legible
A `micro` label rendered on a filled chip or button (tint or rose background with `text-card`) SHALL render in the card text colour, not the faint ink colour, so selected Employee/Prescriber kind chips and confirm/save buttons remain readable on their fill.

#### Scenario: Selected kind chip
- **WHEN** a super admin selects the Employee or Prescriber chip on a cooperation relationship row
- **THEN** the chip's label renders in the card colour on the tint fill and is legible

### Requirement: Action refreshes overlay the page instead of replacing it
When a live-mode action triggers a data refresh for the same signed-in identity set that has already hydrated, the app SHALL keep the current page content mounted and render a blocking translucent loading overlay (with a spinner) over it until the refresh completes. The initial hydrate and an identity switch SHALL keep the existing full-page loading state. A refresh failure SHALL keep the rendered data and surface the categorised reason through the existing sync-error banner.

#### Scenario: Editing a relationship
- **WHEN** a super admin toggles a relationship setting in live mode and the store re-hydrates
- **THEN** the Admin page stays visible beneath a blocking overlay spinner, and the page (including scroll position) is intact when the refresh completes

#### Scenario: First sign-in still shows the loading state
- **WHEN** a user signs in live and the first hydrate runs
- **THEN** the full-page loading state renders as before

### Requirement: Business entity information lives on account rows
The Admin page SHALL NOT render a standalone Business entities section. Each account row in Accounts SHALL show the account's business entity — legal name, trading name, ABN (or an explicit "no ABN"), and inactive state — resolved by owner id (the account uid, or the account's clinic ids for clinic-admin accounts, decoded from the users doc `clinics` map in live and clinic identity contexts in demo). The row SHALL offer inline Edit for an existing entity and, for an account without one, an "Add business entity" action pre-scoped to the correct owner id and type (clinic → clinic id, doctor → uid/independentDoctor, nurse → uid/independentNurse); super-admin-only accounts offer no entity action. Adds and edits SHALL persist through the existing `setBusinessEntity` path.

#### Scenario: Clinic admin account shows the clinic's entity
- **WHEN** a super admin views an account that administers a clinic with a provisioned business entity
- **THEN** the row shows that entity's legal name and ABN, and Edit updates it in place

#### Scenario: Account without an entity
- **WHEN** an account (doctor or nurse) has no business entity
- **THEN** the row offers "Add business entity" pre-filled with the account's owner id and inferred type, and saving creates the entity

#### Scenario: Section removed
- **WHEN** a super admin opens the Admin page
- **THEN** no "Business entities" section heading renders

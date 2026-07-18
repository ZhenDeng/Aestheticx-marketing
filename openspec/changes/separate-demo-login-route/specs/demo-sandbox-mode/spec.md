## ADDED Requirements

### Requirement: Dedicated demo entry point

The system SHALL serve the demo role-picker at `/demo`, and SHALL do so whether or not
Firebase is configured for the deployment.

#### Scenario: Demo picker renders on a Firebase-configured deployment

- **WHEN** a visitor navigates to `/demo` on a deployment where Firebase environment
  variables are set
- **THEN** the demo role-picker renders, listing the preset accounts from `DEMO_ACCOUNTS`
- **AND** the live email/password form is not rendered

#### Scenario: Demo picker renders without Firebase configuration

- **WHEN** a visitor navigates to `/demo` on a deployment with no Firebase environment
  variables (local dev, preview build, E2E run)
- **THEN** the demo role-picker renders identically

#### Scenario: Choosing a preset account enters the app

- **WHEN** a visitor selects a preset account on `/demo` and submits
- **THEN** the app navigates to that role's landing page and the shell re-tints to the
  chosen identity

### Requirement: Sandbox mode is scoped to the browser tab

Sandbox mode SHALL be activated by a per-tab flag stored in `sessionStorage`, which overrides
the environment-derived mode. The system SHALL NOT let one visitor's sandbox session affect
any other visitor or tab.

#### Scenario: Visiting /demo activates the sandbox for the tab

- **WHEN** a visitor loads `/demo`
- **THEN** the sandbox flag is written to `sessionStorage`
- **AND** the auth provider's `mode` becomes `demo`
- **AND** the data store reads and writes the in-memory seed rather than Firestore

#### Scenario: Sandbox survives navigation within the tab

- **WHEN** a visitor who entered via `/demo` navigates to `/app/patients` and reloads the page
- **THEN** the tab remains in sandbox mode and the in-memory seed is used

#### Scenario: A live session in another tab is unaffected

- **WHEN** one tab is in sandbox mode and a second tab loads `/login` on the same deployment
- **THEN** the second tab is in live mode and authenticates against Firebase

### Requirement: The login route always serves the real login

`/login` SHALL serve only the live Firebase email/password form, and SHALL clear any sandbox
flag on entry so a visitor arriving from the demo gets a clean live sign-in.

#### Scenario: Live form on a configured deployment

- **WHEN** a visitor navigates to `/login` on a Firebase-configured deployment
- **THEN** the email/password form renders
- **AND** the demo role-picker is not rendered

#### Scenario: Entering /login leaves the sandbox

- **WHEN** a visitor who is in sandbox mode navigates to `/login`
- **THEN** the sandbox flag is cleared from `sessionStorage`
- **AND** the tab returns to live mode

#### Scenario: Firebase not configured

- **WHEN** a visitor navigates to `/login` on a deployment with no Firebase configuration
- **THEN** the page states that sign-in is unavailable and links to `/demo`
- **AND** no demo role-picker is rendered at `/login`

### Requirement: Mode has a single source of truth

The auth provider SHALL be the only component that derives the demo/live mode. Other
consumers, including the data store, SHALL read `mode` from the auth provider rather than
re-deriving it from the environment.

#### Scenario: Store follows the provider into sandbox mode

- **WHEN** the auth provider's `mode` is `demo` on a Firebase-configured deployment
- **THEN** the data store routes reads and writes to the in-memory backend, not Firestore

#### Scenario: Store follows the provider in live mode

- **WHEN** the auth provider's `mode` is `live`
- **THEN** the data store routes reads and writes to Firestore

### Requirement: Signed-out redirects respect the active mode

When a signed-out visitor requests a guarded `/app/*` path, the system SHALL redirect them to
the entry point matching the tab's active mode, preserving the requested path in `?next=`.

#### Scenario: Sandbox visitor is sent to /demo

- **WHEN** a signed-out visitor whose tab is in sandbox mode requests `/app/calendar`
- **THEN** the system redirects to `/demo?next=%2Fapp%2Fcalendar`

#### Scenario: Live visitor is sent to /login

- **WHEN** a signed-out visitor whose tab is in live mode requests `/app/calendar`
- **THEN** the system redirects to `/login?next=%2Fapp%2Fcalendar`

#### Scenario: Non-app paths carry no next parameter

- **WHEN** a redirect is computed for a path outside `/app`
- **THEN** the target is the bare entry point with no `?next=` parameter

### Requirement: Signing out leaves the sandbox

`signOut()` SHALL clear the sandbox flag so the tab returns to the environment-derived mode.

#### Scenario: Sign out from a sandbox session

- **WHEN** a visitor in sandbox mode signs out
- **THEN** the sandbox flag is removed from `sessionStorage`
- **AND** on a Firebase-configured deployment the tab returns to live mode

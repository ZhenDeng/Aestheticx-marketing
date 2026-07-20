# admin-relationship-views Delta

## ADDED Requirements

### Requirement: Relationships are presented as two views — Prescribing and Employment
The super-admin console SHALL replace the single combined cooperation-relationships list with two switchable views: **Prescribing** and **Employment**. A view switcher SHALL make exactly one view visible at a time, defaulting to Prescribing. Switching views SHALL NOT lose in-progress edits silently — an open edit form may simply persist per row, but the switcher itself MUST NOT clear saved data.

#### Scenario: Two views, one visible
- **WHEN** a super admin opens the relationships section
- **THEN** a Prescribing | Employment switcher is shown, the Prescribing view renders by default, and selecting Employment swaps the list to the clinic-grouped view

### Requirement: Prescribing view groups authorisation counterparties by doctor
The Prescribing view SHALL group relationships by doctor and, under each doctor, list every counterparty that doctor can issue authorisations to: all nurse relationships, and clinic relationships whose effective kind set includes `prescriber`. A clinic relationship whose kind set is employee-only SHALL NOT appear in the Prescribing view. Each listed row SHALL retain the existing edit affordances (kind chips for clinic rows, active / requests-allowed / invoicing toggles, price override, remove with confirmation, audit history).

#### Scenario: Employee-only clinic link hidden from Prescribing
- **WHEN** a doctor has a clinic relationship with kinds `[employee]` and another with kinds `[prescriber]`
- **THEN** the Prescribing view lists only the prescriber-kind clinic (plus any nurse counterparties) under that doctor

#### Scenario: Nurse counterparties always prescribing
- **WHEN** a doctor has an active nurse relationship
- **THEN** the nurse appears under that doctor in the Prescribing view with the full edit affordances

### Requirement: Employment view groups staff by clinic
The Employment view SHALL group by clinic and, under each clinic, list that clinic's staff: doctor relationships whose effective kind set includes `employee` (with the same edit affordances as elsewhere), and non-doctor member accounts (nurse / clinicAdmin) whose account record lists the clinic. Member-account rows are informational — their employment derives from account claims, not from a cooperation relationship — and SHALL NOT offer relationship edit controls. A clinic with no staff SHALL still be listed with an explicit empty-state line rather than omitted.

#### Scenario: Clinic staff listing
- **WHEN** a clinic has an employee-kind doctor relationship, a nurse member account, and a clinicAdmin member account
- **THEN** the Employment view shows all three under that clinic — the doctor row editable, the nurse and admin rows informational

#### Scenario: Prescriber-only doctor not employment
- **WHEN** a doctor's relationship with a clinic has kinds `[prescriber]` only
- **THEN** that doctor does not appear under the clinic in the Employment view

### Requirement: Dual-kind relationships appear in both views as one record
A doctor↔clinic relationship whose kind set includes both `employee` and `prescriber` SHALL appear in both views, backed by the same underlying record: an edit made in either view (kind change, toggle, price, removal) SHALL be reflected in the other view.

#### Scenario: Edit in one view reflects in the other
- **WHEN** a super admin removes the `prescriber` kind from a dual-kind relationship in the Employment view
- **THEN** the relationship disappears from the Prescribing view while remaining under the clinic in the Employment view

### Requirement: Relationship creation remains available alongside the views
The create-relationship form (doctor picker, nurse/clinic counterparty choice, kind chips for clinic, price override, duplicate-pair guard) SHALL remain reachable from the relationships section regardless of which view is active.

#### Scenario: Create from Employment view
- **WHEN** a super admin is on the Employment view and creates a new employee-kind doctor↔clinic relationship
- **THEN** the new relationship appears under the clinic without leaving the section

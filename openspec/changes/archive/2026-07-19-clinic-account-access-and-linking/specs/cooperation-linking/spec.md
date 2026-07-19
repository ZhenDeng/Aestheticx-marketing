# cooperation-linking Delta

## ADDED Requirements

### Requirement: Super admin can create a cooperation relationship for either counterparty type
The platform admin console SHALL let a super admin create a doctor ↔ counterparty cooperation relationship where the counterparty is a nurse **or a clinic**. The create form SHALL offer a counterparty-type choice; choosing Clinic SHALL present a directory of clinics (id + display name) to pick from, and submission SHALL persist a relationship with `counterpartyType: 'clinic'`, the picked clinic's id as `counterpartyID`, and the clinic's name as `counterpartyName`. The created relationship SHALL gate authorisation requests exactly as nurse relationships do: an active, request-allowed clinic relationship makes that doctor requestable by the clinic's members acting in clinic context.

#### Scenario: Linking a clinic to a doctor
- **WHEN** a super admin opens "Add cooperation relationship", selects counterparty type Clinic, picks a doctor and a clinic, and submits
- **THEN** the relationship list shows the clinic (by name, not raw id) under that doctor, and the clinic's members can raise authorisation requests to that doctor

#### Scenario: Nurse creation is unchanged
- **WHEN** a super admin creates a relationship with counterparty type Nurse
- **THEN** the flow behaves exactly as before (nurse picker, same defaults, same persistence)

### Requirement: Clinic directory is available to the admin console
Super-admin hydration SHALL load the clinic directory (the `clinics` collection in live mode; the seeded demo clinic in demo mode) so clinic pickers can offer every provisioned clinic by name. A clinic whose name cannot be resolved SHALL be listed by a non-blank fallback label rather than silently omitted.

#### Scenario: Freshly provisioned clinic appears in the picker
- **WHEN** a super admin creates a clinic account (which provisions a `clinics/{id}` doc) and then opens the create-relationship form
- **THEN** the new clinic is offered in the clinic picker by its name

#### Scenario: No clinics provisioned
- **WHEN** no clinic exists and the super admin selects counterparty type Clinic
- **THEN** the form explains there are no clinic accounts yet instead of offering an empty control

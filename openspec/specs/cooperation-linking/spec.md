# cooperation-linking Specification

## Purpose

Platform-admin management of doctor ↔ (nurse|clinic) cooperation relationships — the gate that controls which doctors a nurse or clinic may request authorisation from, including creating the link for either counterparty type from the admin console.

## Requirements

### Requirement: Super admin can create a cooperation relationship for either counterparty type
The platform admin console SHALL let a super admin create a doctor ↔ counterparty cooperation relationship where the counterparty is a nurse **or a clinic**. The create form SHALL offer a counterparty-type choice; choosing Clinic SHALL present a directory of clinics (id + display name) to pick from, and submission SHALL persist a relationship with `counterpartyType: 'clinic'`, the picked clinic's id as `counterpartyID`, and the clinic's name as `counterpartyName`. The created relationship SHALL gate authorisation requests exactly as nurse relationships do: an active, request-allowed clinic relationship makes that doctor requestable by the clinic's members acting in clinic context. Because persistence is an upsert on the deterministic doctor+counterparty id, the create form SHALL refuse to submit a pair that already has a relationship (directing the admin to the edit row) rather than silently reactivating a removed relationship or overwriting its negotiated pricing.

#### Scenario: Linking a clinic to a doctor
- **WHEN** a super admin opens "Add cooperation relationship", selects counterparty type Clinic, picks a doctor and a clinic, and submits
- **THEN** the relationship list shows the clinic (by name, not raw id) under that doctor, and the clinic's members can raise authorisation requests to that doctor

#### Scenario: Nurse creation is unchanged
- **WHEN** a super admin creates a relationship with counterparty type Nurse
- **THEN** the flow behaves exactly as before (nurse picker, same defaults, same persistence)

#### Scenario: Existing pair is not silently overwritten
- **WHEN** a super admin submits a create for a doctor + counterparty pair that already has a relationship (active or removed)
- **THEN** nothing is persisted and the form explains the pair already has a relationship, pointing to the edit row

### Requirement: Clinic directory is available to the admin console
Super-admin hydration SHALL load the clinic directory (the `clinics` collection in live mode; the seeded demo clinic in demo mode) so clinic pickers can offer every provisioned clinic by name. A clinic whose name cannot be resolved SHALL be listed by a non-blank fallback label rather than silently omitted, but SHALL NOT be linkable — its synthetic label must never persist as a durable `counterpartyName`. A transient failure loading the directory SHALL fail hydration loudly rather than silently presenting an empty directory (which would misreport "no clinic accounts yet").

#### Scenario: Freshly provisioned clinic appears in the picker
- **WHEN** a super admin creates a clinic account (which provisions a `clinics/{id}` doc) and then opens the create-relationship form
- **THEN** the new clinic is offered in the clinic picker by its name

#### Scenario: No clinics provisioned
- **WHEN** no clinic exists and the super admin selects counterparty type Clinic
- **THEN** the form explains there are no clinic accounts yet instead of offering an empty control

#### Scenario: Unnamed clinic is listed but not linkable
- **WHEN** the directory contains a clinic whose doc has a blank name and the super admin tries to link it
- **THEN** the clinic appears with an explicit fallback label, and submission is refused with a prompt to name the clinic first

## MODIFIED Requirements

### Requirement: Super admin can create a cooperation relationship for either counterparty type
The platform admin console SHALL let a super admin create a doctor ↔ counterparty cooperation relationship where the counterparty is a nurse **or a clinic**. The create form SHALL offer a counterparty-type choice; choosing Clinic SHALL present a directory of clinics (id + display name) to pick from, and submission SHALL persist a relationship with `counterpartyType: 'clinic'`, the picked clinic's id as `counterpartyID`, and the clinic's name as `counterpartyName`. The created relationship SHALL gate authorisation requests exactly as nurse relationships do: an active, request-allowed clinic relationship makes that doctor requestable by the clinic's members acting in clinic context. Choosing Clinic SHALL additionally require a **relationship kind** — `employee` or `prescriber` (see the relationship-kind requirement); nurse relationships carry no kind. An active doctor ↔ clinic relationship of kind `employee` SHALL grant the doctor an employee membership of that clinic, update the user's membership claims, and expose the corresponding clinic identity under "Practise as" on the doctor's profile; a `prescriber` relationship SHALL NOT. Inactivating or removing the relationship SHALL revoke only a membership created by that relationship; an independently granted admin, employee, or contractor membership MUST be preserved. Because persistence is an upsert on the deterministic doctor+counterparty id, the create form SHALL refuse to submit a pair that already has a relationship (directing the admin to the edit row) rather than silently reactivating a removed relationship or overwriting its negotiated pricing.

#### Scenario: Linking a clinic to a doctor
- **WHEN** a super admin opens "Add cooperation relationship", selects counterparty type Clinic, picks a doctor, a clinic, and kind Employee, and submits
- **THEN** the relationship list shows the clinic (by name, not raw id) under that doctor, the doctor sees a clinic identity on their profile, and the clinic's members can raise authorisation requests to that doctor

#### Scenario: Removing a clinic relationship preserves unrelated access
- **WHEN** a super admin removes a doctor ↔ clinic relationship
- **THEN** a clinic membership created by that relationship is revoked, while any membership granted independently of the relationship remains unchanged

#### Scenario: Nurse creation is unchanged
- **WHEN** a super admin creates a relationship with counterparty type Nurse
- **THEN** the flow behaves exactly as before (nurse picker, same defaults, same persistence, no kind choice)

#### Scenario: Existing pair is not silently overwritten
- **WHEN** a super admin submits a create for a doctor + counterparty pair that already has a relationship (active or removed)
- **THEN** nothing is persisted and the form explains the pair already has a relationship, pointing to the edit row

## ADDED Requirements

### Requirement: Doctor–clinic relationships carry an employee or prescriber kind
A doctor ↔ clinic cooperation relationship SHALL carry a `relationshipKind` of `employee` or `prescriber`. The create form SHALL offer the kind choice whenever counterparty type Clinic is selected, with a short explanation of the difference; relationship rows SHALL display the kind. Kind `employee` SHALL grant the doctor an employee membership of the clinic (claims + clinic identity) while the relationship is active, exactly as clinic relationships behaved before kinds existed. Kind `prescriber` SHALL create the same authorisation-request gate, pricing override, and invoicing behaviour but SHALL NOT grant any clinic membership or identity. Changing an existing relationship's kind SHALL reconcile membership: `employee → prescriber` revokes a membership that this relationship created (never an independently granted one); `prescriber → employee` grants the membership. A stored clinic relationship without a `relationshipKind` field SHALL be treated as `employee`, so already-linked doctors keep their clinic access without migration. Nurse relationships SHALL NOT carry a kind, and supplying one for a nurse counterparty SHALL be rejected as invalid.

#### Scenario: Prescriber link gates requests without membership
- **WHEN** a super admin creates a doctor ↔ clinic relationship with kind Prescriber
- **THEN** the clinic's members can raise authorisation requests to that doctor, but the doctor gains no clinic identity under "Practise as" and no membership claim for the clinic

#### Scenario: Employee link matches prior behaviour
- **WHEN** a super admin creates a doctor ↔ clinic relationship with kind Employee
- **THEN** the doctor is granted an employee membership of the clinic and the corresponding clinic identity, exactly as before kinds existed

#### Scenario: Switching employee to prescriber revokes only the relationship's grant
- **WHEN** a super admin changes an active clinic relationship's kind from Employee to Prescriber
- **THEN** a membership created by this relationship is revoked, while an independently granted membership is preserved

#### Scenario: Legacy relationship defaults to employee
- **WHEN** a stored doctor ↔ clinic relationship has no `relationshipKind` field
- **THEN** it behaves as kind `employee` (membership retained, row displays Employee)

#### Scenario: Kind is rejected for nurse counterparties
- **WHEN** a write supplies a `relationshipKind` for a nurse counterparty
- **THEN** the write is rejected as invalid

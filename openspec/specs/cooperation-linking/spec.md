# cooperation-linking Specification

## Purpose

Platform-admin management of doctor ↔ (nurse|clinic) cooperation relationships — the gate that controls which doctors a nurse or clinic may request authorisation from, including creating the link for either counterparty type from the admin console.
## Requirements
### Requirement: Super admin can create a cooperation relationship for either counterparty type
The platform admin console SHALL let a super admin create a doctor ↔ counterparty cooperation relationship where the counterparty is a nurse **or a clinic**. The create form SHALL offer a counterparty-type choice; choosing Clinic SHALL present a directory of clinics (id + display name) to pick from, and submission SHALL persist a relationship with `counterpartyType: 'clinic'`, the picked clinic's id as `counterpartyID`, and the clinic's name as `counterpartyName`. The created relationship SHALL gate authorisation requests exactly as nurse relationships do: an active, request-allowed clinic relationship makes that doctor requestable by the clinic's members acting in clinic context. Choosing Clinic SHALL additionally require a **relationship kind set** — at least one of `employee` and `prescriber`, both allowed together (see the relationship-kind requirement); nurse relationships carry no kinds. An active doctor ↔ clinic relationship whose kind set includes `employee` SHALL grant the doctor an employee membership of that clinic, update the user's membership claims, and expose the corresponding clinic identity under "Practise as" on the doctor's profile; a prescriber-only relationship SHALL NOT. Inactivating or removing the relationship SHALL revoke only a membership created by that relationship; an independently granted admin, employee, or contractor membership MUST be preserved. Because persistence is an upsert on the deterministic doctor+counterparty id, the create form SHALL refuse to submit a pair that already has a relationship (directing the admin to the edit row) rather than silently reactivating a removed relationship or overwriting its negotiated pricing.

#### Scenario: Linking a clinic to a doctor
- **WHEN** a super admin opens "Add cooperation relationship", selects counterparty type Clinic, picks a doctor and a clinic, keeps the default Employee kind, and submits
- **THEN** the relationship list shows the clinic (by name, not raw id) under that doctor, the doctor sees a clinic identity on their profile, and the clinic's members can raise authorisation requests to that doctor

#### Scenario: Removing a clinic relationship preserves unrelated access
- **WHEN** a super admin removes a doctor ↔ clinic relationship
- **THEN** a clinic membership created by that relationship is revoked, while any membership granted independently of the relationship remains unchanged

#### Scenario: Nurse creation is unchanged
- **WHEN** a super admin creates a relationship with counterparty type Nurse
- **THEN** the flow behaves exactly as before (nurse picker, same defaults, same persistence, no kind chips)

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

### Requirement: Doctor–clinic relationships carry a set of employee/prescriber kinds
A doctor ↔ clinic cooperation relationship SHALL carry a `relationshipKinds` set drawn from `employee` and `prescriber` — one or both, never empty (the kinds are not mutually exclusive: a doctor can work at a clinic and also authorise for it). The create form SHALL offer both kinds as multi-select chips whenever counterparty type Clinic is selected, with a short explanation of the difference, and SHALL NOT allow the selection to become empty; relationship rows SHALL display the kind set and offer the same chips for editing. A set including `employee` SHALL grant the doctor an employee membership of the clinic (claims + clinic identity) while the relationship is active, exactly as clinic relationships behaved before kinds existed. A prescriber-only set SHALL create the same authorisation-request gate, pricing override, and invoicing behaviour but SHALL NOT grant any clinic membership or identity. Changing an existing relationship's kind set SHALL reconcile membership: removing `employee` revokes a membership that this relationship created (never an independently granted one); adding `employee` grants the membership. A stored clinic relationship without a `relationshipKinds` field SHALL be treated as `[employee]`, so already-linked doctors keep their clinic access without migration; an interim doc carrying the singular `relationshipKind` field SHALL be honoured as a one-element set. Nurse relationships SHALL NOT carry kinds, and supplying kinds for a nurse counterparty SHALL be rejected as invalid, as SHALL an empty or invalid-valued set for a clinic.

#### Scenario: Prescriber-only link gates requests without membership
- **WHEN** a super admin creates a doctor ↔ clinic relationship with only Prescriber selected
- **THEN** the clinic's members can raise authorisation requests to that doctor, but the doctor gains no clinic identity under "Practise as" and no membership claim for the clinic

#### Scenario: Employee in the set matches prior behaviour
- **WHEN** a super admin creates a doctor ↔ clinic relationship whose kind set includes Employee (alone or with Prescriber)
- **THEN** the doctor is granted an employee membership of the clinic and the corresponding clinic identity, exactly as before kinds existed

#### Scenario: Removing employee from the set revokes only the relationship's grant
- **WHEN** a super admin edits an active clinic relationship's kind set from including Employee to prescriber-only
- **THEN** a membership created by this relationship is revoked, while an independently granted membership is preserved

#### Scenario: Legacy relationship defaults to employee
- **WHEN** a stored doctor ↔ clinic relationship has no `relationshipKinds` field
- **THEN** it behaves as the set `[employee]` (membership retained, row displays Employee)

#### Scenario: Kinds are rejected for nurse counterparties and empty sets for clinics
- **WHEN** a write supplies `relationshipKinds` for a nurse counterparty, or an empty/invalid set for a clinic
- **THEN** the write is rejected as invalid

### Requirement: A dual-kind relationship's two kinds operate independently
When a doctor↔clinic relationship carries both `employee` and `prescriber` kinds, the two kinds SHALL be treated as independent facets of one link. Employment SHALL govern only clinic-data access through the minted clinic identity: the doctor sees and edits the clinic's clients and appointments only while their active identity is the clinic identity. Prescribing SHALL be unaffected by employment and by the currently selected identity: incoming authorisation requests, incoming consult calls, the review inbox, and authorisation invoicing all follow the doctor's account (their always-on prescriber identity), whichever identity is active. Billing SHALL likewise treat the facets independently — the doctor continues to issue authorisation invoices to the clinic regardless of also being its employee, and employment does not create, suppress, or merge any authorisation billing.

#### Scenario: Employee identity gates clinic data only
- **WHEN** a dual-kind doctor's active identity is their independent one
- **THEN** the clinic's clients and calendar are not visible to them, while their authorisation inbox and callable status are unchanged

#### Scenario: Prescribing survives identity switching
- **WHEN** the same doctor switches to the clinic (employee) identity
- **THEN** pending authorisation requests addressed to them remain visible and actionable, and incoming consult calls still reach them

#### Scenario: Authorisation billing unaffected by employment
- **WHEN** the doctor generates an authorisation invoice for that clinic's approved authorisations
- **THEN** the invoice is created exactly as it would be without the employee kind — same counterparty, pricing precedence, and totals

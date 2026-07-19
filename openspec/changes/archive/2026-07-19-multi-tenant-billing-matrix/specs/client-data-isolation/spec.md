# client-data-isolation — Delta Spec

## ADDED Requirements

### Requirement: Ownership-scoped client visibility
The client book SHALL be scoped by `PatientOwner`. A doctor-owned client SHALL be visible only to the owning doctor. A nurse-owned client SHALL be visible only to the owning nurse. A clinic-owned client SHALL be visible to users whose active identity context is that clinic and to doctors holding an active cooperation relationship with that clinic. Existing clinical grants (a patient's `prescribingDoctorIDs` and open reviewer access) SHALL continue to allow authorisation review, but SHALL NOT grant commercial access (checkout, wallet, invoicing). Platform-admin oversight routes SHALL be unaffected.

#### Scenario: Independent nurse cannot see a doctor-owned client
- **WHEN** a nurse acting independently opens the patients list
- **THEN** clients owned by a doctor silo are absent from the list and their detail pages are not accessible

#### Scenario: Clinic staff see clinic-owned clients
- **WHEN** a clinic nurse or clinic admin with the clinic as active context opens the patients list
- **THEN** clinic-owned clients of that clinic are listed

#### Scenario: Collaborating doctor sees clinic-owned clients
- **WHEN** a doctor with an active cooperation relationship with the clinic opens the patients list
- **THEN** that clinic's clients appear, marked as clinic-owned

#### Scenario: Same user, different identity, different book
- **WHEN** a user holding both an independent-nurse identity and a clinic-nurse identity switches active identity
- **THEN** the independent identity shows only their nurse-owned clients and the clinic identity shows only the clinic-owned clients

#### Scenario: Commercial-only access renders a reduced file
- **WHEN** a collaborating doctor with no prescribing or review grant opens a clinic client's file
- **THEN** they see an identity strip and the Account (wallet/checkout) surface only — no demographics detail, allergies/medications, alert, authorisations, notes, forms, or history

### Requirement: Ownership-scoped management and invoicing rights
Only the owning silo SHALL manage (edit, top up, check out, invoice) a client. For doctor-owned and nurse-owned clients that is the owning practitioner alone. For clinic-owned clients, clinic-context users SHALL manage the client and collaborating practitioners SHALL be able to operate (record treatments, run a checkout) — but every commercial artifact for a clinic-owned client SHALL keep the clinic as the client-facing commercial party.

#### Scenario: Collaborator cannot invoice a clinic client in their own name
- **WHEN** a collaborating practitioner checks out a clinic-owned client
- **THEN** the client-facing invoice issuer is the clinic, never the practitioner's own entity

#### Scenario: Non-owner cannot manage
- **WHEN** a user without owner or collaborator access attempts to view, edit, top up, or check out a client
- **THEN** the action is rejected and no state changes

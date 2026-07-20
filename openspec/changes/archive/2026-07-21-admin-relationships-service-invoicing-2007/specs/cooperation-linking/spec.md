# cooperation-linking Delta

## ADDED Requirements

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

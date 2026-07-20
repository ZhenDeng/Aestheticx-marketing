# invoicing Delta

## ADDED Requirements

### Requirement: Business entity edits flow into subsequently generated invoices
Invoice party blocks SHALL be resolved from the party's *current* active business entity at generation time. When a super admin edits a business entity's legal name, trading name, or ABN (for example a clinician switching between sole-trader and company structures), every invoice generated after the edit — authorisation, client-sale, service-fee, or top-up — SHALL carry the updated business name and ABN in its frozen issuer/bill-to snapshot. Invoices generated before the edit SHALL keep their original frozen snapshots unchanged.

#### Scenario: New invoices pick up the edited entity
- **WHEN** a super admin changes a doctor's entity from sole-trader legal name + old ABN to a company name + new ABN, and the doctor then generates an authorisation invoice
- **THEN** the new invoice's issuer block shows the company name and new ABN

#### Scenario: Existing invoices keep their snapshot
- **WHEN** the same edit is made after an invoice was already generated
- **THEN** the earlier invoice continues to render the original name and ABN

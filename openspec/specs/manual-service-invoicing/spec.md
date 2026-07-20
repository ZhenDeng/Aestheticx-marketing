# manual-service-invoicing Specification

## Purpose

Practitioner-initiated service invoices to a clinic — handwritten line items with automatically stamped business identities — plus the populated nurse Invoice page (client picker into the checkout flow).

## Requirements

### Requirement: Employee practitioners can issue a manual service invoice to their clinic
The Invoice page SHALL offer an "Invoice the clinic" composer to a practitioner (nurse or doctor) whose held identities include a clinic membership, letting them issue a `service-fee` invoice to that clinic on their own initiative (not only as a checkout auto-draft). When the practitioner belongs to more than one clinic, the composer SHALL let them pick which clinic to bill. Roles without a clinic membership (independent-only practitioners, clinicAdmin, superAdmin) SHALL NOT see the composer. While the billing-matrix layer is demo-only, the composer follows the same gate as other matrix surfaces (hidden in live mode until the backend callable ships).

#### Scenario: Employed nurse sees the composer
- **WHEN** a nurse holding a clinic identity opens the Invoice page in demo mode
- **THEN** an "Invoice the clinic" composer is available, targeting that clinic

#### Scenario: Employed doctor sees the composer
- **WHEN** a doctor with an active employee-kind clinic relationship opens the Invoice page
- **THEN** the same composer is available to them, alongside their authorisation invoicing

#### Scenario: Independent practitioner does not
- **WHEN** a practitioner with no clinic membership opens the Invoice page
- **THEN** no clinic-invoice composer is shown

### Requirement: Handwritten line items with GST-exclusive B2B math
The composer SHALL accept one or more handwritten line items, each a free-text description plus an ex-GST amount. Submission SHALL require every line to have a non-blank description and a positive amount. GST SHALL be computed at 10% on top of each line (GST-exclusive, matching existing B2B service-fee math), and the composer SHALL preview subtotal, GST, and total before issue.

#### Scenario: Valid lines compute exclusive GST
- **WHEN** the practitioner enters lines "Cosmetic nursing services — June" $1,000.00 and "Travel" $50.00
- **THEN** the preview shows subtotal $1,050.00, GST $105.00, total $1,155.00, and issuing produces an invoice with those figures

#### Scenario: Blank or non-positive line blocked
- **WHEN** a line has an empty description or a zero/negative amount
- **THEN** the composer refuses to issue and indicates the offending line

### Requirement: Business identities are stamped automatically on manual service invoices
A manually issued service invoice SHALL be created with `kind: "service-fee"`, the practitioner as issuer (`issuerRef`) and the clinic as counterparty, and SHALL automatically freeze both parties' business blocks (business name, ABN, email, address) from their current business entities at generation time — the practitioner never types their own or the clinic's business details. The invoice SHALL be issued final (not a draft awaiting finalization), SHALL appear in the issuer's service-fee stream and in the clinic's payable stream, and its PDF SHALL follow the structured tax-invoice layout carrying both business identities.

#### Scenario: Auto-stamped parties
- **WHEN** an employed nurse issues a manual service invoice to their clinic
- **THEN** the stored invoice carries the nurse's business entity as issuer and the clinic's entity as bill-to, without either being entered by hand

#### Scenario: Visible to both sides
- **WHEN** the invoice is issued
- **THEN** the nurse sees it in their outgoing service-fee stream and the clinic admin sees it among invoices billed to the clinic

### Requirement: The nurse Invoice page is populated
For a nurse, the Invoice page SHALL no longer render empty: it SHALL show an "Invoice a client" picker listing the clients the nurse can check out (their own book, plus the clinic book when acting in a clinic identity with checkout access), each entry linking to that client's account section where the checkout/invoice flow lives; the "Invoice the clinic" composer when eligible; and the existing invoice streams. When the nurse has no invoiceable clients, the picker SHALL show an explicit empty-state message rather than disappearing.

#### Scenario: Client picker lists checkout-eligible clients
- **WHEN** a nurse with clients opens the Invoice page in demo mode
- **THEN** the clients they can check out are listed, and choosing one navigates to that client's account/checkout section

#### Scenario: No silent empty page
- **WHEN** a nurse with no clients and no clinic membership opens the Invoice page
- **THEN** the page explains what would appear there instead of rendering only a heading

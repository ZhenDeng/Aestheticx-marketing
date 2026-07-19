# invoicing — Delta Spec

## ADDED Requirements

### Requirement: Checkout-generated documents follow the structured tax-invoice layout
Every invoice kind introduced by the billing matrix (`client-sale`, `service-fee`, `top-up`) SHALL render — on-screen preview and PDF — with the verified template: TAX INVOICE title top-left with DATE ISSUED and INVOICE NUMBER in the top-right corner aligned with the title band; seller credentials and bill-to details as vertically stacked blocks with one element per line (never a single comma-clumped string); line items inside a bordered table (Description, Qty, Unit price, GST, Amount) with visible outer frame, column dividers, and row rules; totals right-aligned beneath the grid. Seller blocks SHALL keep the ABN em-dash fallback; client bill-to blocks SHALL omit the ABN row entirely. Top-up invoices SHALL additionally carry the non-taxable gift-credit footnote row when a gift applies.

#### Scenario: Client-sale invoice uses the template
- **WHEN** a B2C client invoice renders as PDF
- **THEN** the metadata sits top-right aligned with the TAX INVOICE title, seller and TO blocks are stacked line-per-element, and items sit in a ruled bordered grid

#### Scenario: Service-fee invoice carries both business identities
- **WHEN** a clinician→clinic service-fee invoice renders
- **THEN** the seller block stacks the practitioner's name, trading name, and ABN, and the TO block stacks the clinic's name, ABN, and address on separate lines

#### Scenario: Client bill-to has no ABN row
- **WHEN** a client-sale or top-up invoice renders for a client
- **THEN** the TO block shows the client's name and address lines with no ABN row

### Requirement: Invoice access by direction and kind
Invoice read scoping SHALL extend to the new kinds: a user SHALL see an invoice when their active identity is the issuer silo or the bill-to counterparty. Doctors SHALL keep their authorisation invoices unchanged and additionally see their own client-sale and service-fee documents; nurses SHALL see documents they issued; clinic-context users SHALL see clinic-issued client invoices and service-fee invoices billed to the clinic. Practitioner-issued CLIENT documents (sales/top-ups) belong to the independent identity's book — the same user's clinic identity SHALL NOT see them; service-fee invoices are the practitioner's own earnings and SHALL follow the person across identities. The Invoice navigation entry SHALL be available to doctors, nurses, and clinic admins, with each role's page showing only its streams. Existing authorisation-invoice visibility SHALL be unchanged.

#### Scenario: Clinic admin sees both sides of a split checkout
- **WHEN** a split-billing checkout completes and the clinic admin opens billing
- **THEN** the clinic→client invoice appears in the clinic's issued stream and the practitioner's service-fee invoice appears as a received document

#### Scenario: Nurse gains a billing page
- **WHEN** an independent nurse opens the app navigation
- **THEN** the Invoice entry is present and shows only invoices the nurse issued (client sales, top-ups, service fees)

#### Scenario: Doctor's authorisation stream unchanged
- **WHEN** a doctor opens billing after this change with no checkouts performed
- **THEN** the authorisation invoicing view (summary, generate panel, invoice list) is identical to the pre-change behavior

#### Scenario: Client documents stay in the independent book
- **WHEN** an independent nurse who also holds a clinic identity issues a client sale, then switches to her clinic identity
- **THEN** the clinic identity's billing page shows her service fees but not her independent client sales or top-ups

### Requirement: Matrix invoice settlement lifecycle
Matrix invoices SHALL be settled by their ISSUER silo: the issuing practitioner (any identity) or, for clinic-issued documents, any clinic-context member may mark them paid. Draft service-fee invoices SHALL NOT be markable as paid before finalizing. Matrix invoices SHALL NOT be deletable — top-up and wallet-settled invoices are cross-linked from the append-only wallet ledger, so deletion would orphan ledger entries. Top-up invoices are born paid (settled at the counter); wallet-settled checkouts are marked paid by the wallet at generation.

#### Scenario: Issuer marks a client invoice paid
- **WHEN** the issuing nurse (or a clinic admin for a clinic-issued invoice) clicks Mark paid on an unpaid client invoice
- **THEN** the invoice records paid with timestamp and actor; outsiders attempting the same are rejected

#### Scenario: Drafts cannot settle
- **WHEN** anyone attempts to mark a draft service-fee invoice paid
- **THEN** the action is rejected until the practitioner finalizes it

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
Invoice read scoping SHALL extend to the new kinds: a user SHALL see an invoice when their active identity is the issuer silo or the bill-to counterparty. Doctors SHALL keep their authorisation invoices unchanged and additionally see their own client-sale and service-fee documents; nurses SHALL see documents they issued; clinic-context users SHALL see clinic-issued client invoices and service-fee invoices billed to the clinic. The Invoice navigation entry SHALL be available to doctors, nurses, and clinic admins, with each role's page showing only its streams. Existing authorisation-invoice visibility SHALL be unchanged.

#### Scenario: Clinic admin sees both sides of a split checkout
- **WHEN** a split-billing checkout completes and the clinic admin opens billing
- **THEN** the clinic→client invoice appears in the clinic's issued stream and the practitioner's service-fee invoice appears as a received document

#### Scenario: Nurse gains a billing page
- **WHEN** an independent nurse opens the app navigation
- **THEN** the Invoice entry is present and shows only invoices the nurse issued (client sales, top-ups, service fees)

#### Scenario: Doctor's authorisation stream unchanged
- **WHEN** a doctor opens billing after this change with no checkouts performed
- **THEN** the authorisation invoicing view (summary, generate panel, invoice list) is identical to the pre-change behavior

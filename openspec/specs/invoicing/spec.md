# invoicing Specification

## Purpose

Doctor invoice generation with per-authorisation selection, invoice deletion/regeneration for corrections, the structured tax-invoice layout (PDF + on-screen preview), and invoice party identity resolution — plus the billing-matrix streams (client-sale, top-up, and service-fee invoices) that reuse the same template with direction/kind read scoping and issuer-side settlement.

## Requirements

### Requirement: Selective invoicing with per-authorisation checkboxes
When a doctor generates an invoice, the generate panel SHALL list every un-invoiced authorisation (script) for the counterparty-month with a checkbox per row (all selected by default). The generated invoice SHALL include exactly the selected scripts; deselected scripts SHALL remain un-invoiced and selectable later. The preview totals SHALL track the current selection. A multi-item request SHALL remain one script — selection operates at the script grain, never splitting a request across invoices.

#### Scenario: Doctor excludes a free script
- **WHEN** the doctor unticks one patient's authorisation and generates
- **THEN** the invoice bills only the ticked scripts and the unticked one stays in the un-invoiced pool

#### Scenario: Empty selection cannot generate
- **WHEN** every checkbox is unticked
- **THEN** the Generate button is disabled

#### Scenario: Selection survives a live re-hydrate
- **WHEN** the billable set is re-read from the server (reordered or replaced) after the doctor has unticked a script
- **THEN** that untick persists and the excluded script is not silently re-included

### Requirement: Delete and regenerate invoices
A doctor SHALL be able to delete an invoice they issued (confirmation required). Deleting an invoice SHALL return every member authorisation to the un-invoiced pool so a corrected invoice can be generated again. Deletion SHALL be recorded in the audit log. In live mode deletion SHALL be server-authoritative (Function-only invoice documents).

#### Scenario: Delete then regenerate
- **WHEN** the doctor deletes an invoice and reopens the generate panel
- **THEN** the deleted invoice's authorisations are selectable again and a replacement invoice can be generated

#### Scenario: Delete requires confirmation
- **WHEN** the doctor clicks Delete and declines the confirmation
- **THEN** the invoice is unchanged

### Requirement: Structured tax-invoice layout
The tax-invoice document SHALL follow a professional financial-document layout:

- **Header**: the TAX INVOICE title SHALL sit top-left; DATE ISSUED and INVOICE NUMBER SHALL render in the top-right corner of the header, horizontally aligned with the title band — never stacked in the left column.
- **Seller block (top left, under the title)**: the issuer's identity SHALL render as a vertical block with each element on its own line — practitioner name (e.g. "Dr Jenn Lee"), business/clinic trading name, ABN, business address, and contact email. Elements without data SHALL be omitted (no placeholder rows), except ABN which SHALL keep an em-dash fallback as an ATO-required element.
- **TO block (below the header, left-aligned)**: the bill-to party SHALL render under a "TO" label as a vertical block — recipient name on its own line, followed by the address split across separate lines (location line, then city/state/postcode) — never merged into one comma-joined row.
- **Items**: line items SHALL render in a bordered table — column headers (Description, Qty, Unit price, GST, Total), visible column framing and row rules. The on-screen invoice preview in the generate panel SHALL match: a bordered table grid with visible outer frame and column dividers, not loose lines or pipe-separated text.
- **Totals**: subtotal (excl. GST), GST (10%), and TOTAL AMOUNT PAYABLE SHALL render right-aligned beneath the items grid with bold/weighted accents.
- Every ATO Example-2 element SHALL be retained: the words TAX INVOICE, seller identity and ABN, buyer identity, issue date, per-line GST, and the statement "The total price includes GST".

#### Scenario: Header metadata in the top-right corner
- **WHEN** an invoice PDF is generated
- **THEN** DATE ISSUED and INVOICE NUMBER render in the top-right corner aligned with the TAX INVOICE title, and do not appear as left-column field rows

#### Scenario: Seller identity renders as a multi-line block
- **WHEN** the issuer has a name, trading name, ABN, address, and email on record
- **THEN** each renders on its own line in the top-left seller block, in that order

#### Scenario: Seller block omits missing data
- **WHEN** the issuer has no address or email on record
- **THEN** those lines are omitted entirely (no empty or placeholder rows) while ABN still renders (em dash when blank)

#### Scenario: TO block splits the address across lines
- **WHEN** the bill-to party has an address containing comma-separated components (e.g. "Internal Clinic, Chatswood Westfield, Chatswood NSW 2067")
- **THEN** the TO block renders the recipient name on line 1 and the address components on separate subsequent lines, not one merged row

#### Scenario: Items render as a table
- **WHEN** an invoice PDF is generated
- **THEN** line items appear inside a ruled, bordered table with one column per field rather than stacked prose lines

#### Scenario: On-screen preview matches the bordered grid
- **WHEN** the doctor opens the generate panel with at least one script selected
- **THEN** the preview table renders with a visible outer border and column dividers, and subtotal/GST/total render right-aligned beneath it with weighted accents

#### Scenario: ATO elements preserved
- **WHEN** the PDF renders
- **THEN** TAX INVOICE, seller ABN, buyer identity, issue date, per-line GST and the GST-inclusion statement are all present

### Requirement: Invoice party identity enrichment
Invoice party resolution SHALL supply the seller and bill-to blocks with the richest identity available: an optional person name alongside the business name, plus address and email where knowable. Generation-time snapshots (live invoices) SHALL take precedence; state-resolved parties (demo and legacy invoices) SHALL fill name from the owner's account, address from the party's principal place of practice falling back to the profile address (doctor), clinic address (clinic), or active premise (nurse), and email from the account record. Absent data SHALL stay empty rather than fabricated.

#### Scenario: Demo doctor issuer resolves a full block
- **WHEN** a demo invoice is rendered for a doctor with a business entity, principal place of practice, and account email
- **THEN** the issuer party carries the doctor's name, entity trading name, ABN, address, and email

#### Scenario: Business address outranks the personal address
- **WHEN** a doctor has both a principal place of practice and a personal profile address
- **THEN** the seller address on the invoice is the principal place of practice

#### Scenario: Legacy snapshot without new fields still renders
- **WHEN** an invoice carries a legacy issuer/billTo snapshot with only businessName, abn, and email
- **THEN** the PDF renders the available lines and omits the rest without error

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

### Requirement: Business entity edits flow into subsequently generated invoices
Invoice party blocks SHALL be resolved from the party's *current* active business entity at generation time. When a super admin edits a business entity's legal name, trading name, or ABN (for example a clinician switching between sole-trader and company structures), every invoice generated after the edit — authorisation, client-sale, service-fee, or top-up — SHALL carry the updated business name and ABN in its frozen issuer/bill-to snapshot. Invoices generated before the edit SHALL keep their original frozen snapshots unchanged.

#### Scenario: New invoices pick up the edited entity
- **WHEN** a super admin changes a doctor's entity from sole-trader legal name + old ABN to a company name + new ABN, and the doctor then generates an authorisation invoice
- **THEN** the new invoice's issuer block shows the company name and new ABN

#### Scenario: Existing invoices keep their snapshot
- **WHEN** the same edit is made after an invoice was already generated
- **THEN** the earlier invoice continues to render the original name and ABN

# client-checkout Specification

## Purpose

Checkout of products, services, and top-ups against a client, with scenario routing derived from client ownership — independent B2C (Scenario A) and clinic-collaborative split billing (Scenario B: clinic retail invoice + drafted practitioner service-fee invoice) — plus wallet settlement.

## Requirements

### Requirement: Checkout with itemized selection and GST-inclusive preview
A user with commercial access to a client SHALL be able to run a checkout: select one or more services/products from the applicable price list (with quantities), and see a live preview of subtotal, GST, and total before confirming. B2C retail prices SHALL be treated as GST-inclusive: per-line GST = round(line total / 11). An empty selection SHALL NOT be checkoutable.

#### Scenario: Preview tracks selection
- **WHEN** the operator adds two services and removes one
- **THEN** the previewed subtotal, GST, and total reflect exactly the remaining selection

#### Scenario: Empty checkout blocked
- **WHEN** no items are selected
- **THEN** the confirm action is disabled

### Requirement: Scenario routing derived from client ownership
The checkout SHALL derive its billing scenario from the client's owner — never from operator choice. When the operator's own silo owns the client (independent doctor or nurse), checkout SHALL produce a single B2C invoice priced from the operator's own price list. When the client is clinic-owned, checkout SHALL use the clinic's retail price list and produce the split-billing pair.

#### Scenario: Independent checkout uses own fee schedule
- **WHEN** an independent nurse checks out their own client
- **THEN** items and prices come from the nurse's price list and exactly one invoice is generated

#### Scenario: Clinic client checkout uses clinic retail pricing
- **WHEN** a practitioner checks out a clinic-owned client
- **THEN** items and prices come from the clinic's retail price list

### Requirement: Scenario A — independent B2C invoice
The B2C invoice for an owner checkout SHALL carry: issuer = the operator's own business entity (personal/trading name, ABN) with address and email where known; bill-to = the client (name, address where known, no ABN row); lines = the selected items with quantity, GST-inclusive unit price, per-line GST, and amount; kind `client-sale`; and a frozen issuer/bill-to snapshot at generation time.

#### Scenario: Seller is the clinician's own entity
- **WHEN** an independent doctor checks out their own client
- **THEN** the invoice issuer block shows the doctor's personal trading name and ABN, and the bill-to block shows the client

### Requirement: Scenario B — split billing for clinic-owned clients
Checking out a clinic-owned client SHALL generate, in one atomic action: (1) a `client-sale` tax invoice with issuer = the clinic's business entity and bill-to = the client, priced at clinic retail; and (2) when the operator is a practitioner (doctor or nurse), an auto-drafted `service-fee` invoice with issuer = the operating practitioner's business entity and bill-to = the clinic (clinic name, ABN, address), amount = the agreed per-session service fee for that clinic–practitioner pair (GST-exclusive plus 10% GST). The two documents SHALL be linked to the same checkout. The service-fee invoice SHALL be created as a draft that the practitioner can finalize from their billing page. A checkout performed by a clinic admin SHALL create no service-fee invoice.

#### Scenario: Dual documents from one checkout
- **WHEN** a collaborating nurse checks out a clinic-owned client for a treatment
- **THEN** a clinic→client tax invoice at retail price and a draft nurse→clinic service-fee invoice for the agreed fee are both created and cross-linked

#### Scenario: Practitioner finalizes the drafted service-fee invoice
- **WHEN** the practitioner opens their billing page and finalizes the draft
- **THEN** the service-fee invoice becomes issued and visible to the clinic as a received invoice

#### Scenario: Clinic keeps the margin
- **WHEN** the retail total exceeds the practitioner's service fee
- **THEN** neither document nets the other — the client invoice bills full retail and the service-fee invoice bills only the agreed fee

### Requirement: Wallet payment at checkout
When the client's account balance covers the checkout total, the operator SHALL be able to settle the invoice from the wallet in the same action: a drawdown ledger entry equal to the invoice total is recorded, linked to the invoice, and the invoice is marked paid. Wallet settlement SHALL be all-or-nothing; when the balance is insufficient the option SHALL be unavailable and the balance SHALL never go negative.

#### Scenario: Wallet covers the checkout
- **WHEN** the operator confirms a $500 checkout with "pay from account balance" for a client holding $800 credit
- **THEN** the invoice is marked paid, a $500 drawdown appears in the ledger, and the balance becomes $300

#### Scenario: Insufficient balance
- **WHEN** the client's balance is below the checkout total
- **THEN** wallet payment is not offered and confirming leaves the invoice unpaid with the balance unchanged

### Requirement: Coexistence with authorisation invoicing
Checkout-generated invoices SHALL be additive: they SHALL never include authorisation scripts, never alter the un-invoiced authorisation pool, and the existing doctor→counterparty authorisation invoicing flow (selective generation, delete/regenerate, mark-paid, party enrichment) SHALL behave exactly as before.

#### Scenario: Authorisation billing unaffected by checkout
- **WHEN** a doctor runs a client checkout and then opens the authorisation generate panel
- **THEN** the billable script pool and the generated authorisation invoice are identical to what they would have been without the checkout

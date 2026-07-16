# invoicing Specification

## Purpose

Doctor invoice generation with per-authorisation selection, invoice deletion/regeneration for corrections, and the structured tax-invoice PDF layout.

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
The tax-invoice PDF SHALL present line items in a bordered table — column headers (Description, Qty, Unit price, GST, Total), visible column framing and row rules — with a framed totals block (subtotal excl. GST, GST, total payable), while retaining every ATO Example-2 element: the words TAX INVOICE, seller identity and ABN, buyer identity, issue date, per-line GST, and the statement "The total price includes GST".

#### Scenario: Items render as a table
- **WHEN** an invoice PDF is generated
- **THEN** line items appear inside a ruled, bordered table with one column per field rather than stacked prose lines

#### Scenario: ATO elements preserved
- **WHEN** the PDF renders
- **THEN** TAX INVOICE, seller ABN, buyer identity, issue date, per-line GST and the GST-inclusion statement are all present

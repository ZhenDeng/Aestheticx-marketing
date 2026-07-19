# Authorisation PDF — delta spec

## ADDED Requirements

### Requirement: Authorisation PDF sections
The combined Treatment Authorisation PDF generated at approval SHALL contain, in order: the
header (clinic name for clinic-context requests, otherwise the doctor's name, plus the title and
authorisation number), the responsible-provider and dates block, the patient block, the
"Authorisation to treat" table, the complication/anaphylaxis notices (backend renderer), the
"Premises of administration" field, the "Standing emergency authorisations" list (when any
exist), and the prescriber signature block. The document SHALL NOT contain a
"Per administration — to record" section, a recording grid, or a
"Direction under Clause 68C — NSW Poisons and Therapeutic Goods Regulation 2008" heading.

#### Scenario: Removed sections never render
- **WHEN** an approval PDF is generated for any approved request
- **THEN** the document text contains no "PER ADMINISTRATION" heading, no recording-grid column
  labels (Nurse name / Date administered / Batch no.), and no "DIRECTION UNDER CLAUSE 68C" heading

#### Scenario: Premises of administration survives without its section heading
- **WHEN** an approval PDF is generated for a request with a stamped premise (or clinic context)
- **THEN** the "Premises of administration" field renders with the premise (or clinic) display line
- **AND** it is the only field of the former Clause 68C block — no "Prescriber",
  "Principal place of practice", "Period direction has effect", or "Administrations" fields render

### Requirement: Header contact lines exclude the prescriber phone
The document header SHALL NOT print the prescriber's phone number under the doctor's name.
Clinic-context headers MAY keep the clinic's own contact lines (phone/email).

#### Scenario: Independent (doctor-header) document
- **WHEN** an approval PDF is generated for a request with no clinic context
- **THEN** the header shows the doctor's name with no phone line beneath it

#### Scenario: Signature block unchanged
- **WHEN** an approval PDF is generated
- **THEN** the prescriber signature block still prints the name, "Electronically authorised on"
  date, prescriber number when present, and available e:/p:/a: contact lines

### Requirement: Default timing wording
When a medication item carries no timing captured on the request, its "Timing of treatment"
cell SHALL read "PRN, max 5 treatments, expire after 6 months". A per-item timing captured on
the request SHALL take precedence over the default.

#### Scenario: Item without timing
- **WHEN** a row is built for an item whose `timing` is empty or absent
- **THEN** the Timing of treatment cell reads "PRN, max 5 treatments, expire after 6 months"

#### Scenario: Item with captured timing
- **WHEN** a row is built for an item whose `timing` is "Single session"
- **THEN** the Timing of treatment cell reads "Single session"

### Requirement: Renderer parity
The demo-mode web renderer and the backend Cloud Function renderer SHALL implement the same
document sections and the same default timing wording, so a demo approval and a live approval
produce equivalent documents.

#### Scenario: Both renderers drop the removed sections
- **WHEN** the same approved request is rendered by the demo renderer and the backend renderer
- **THEN** neither output contains the removed headings or fields, and both use the new default
  timing wording

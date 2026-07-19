# aftercare-delivery Specification

## Purpose
How the web app composes an aftercare email and gets it to the patient, and what it records
on the patient file.

Aftercare is handed to the practitioner's own mail client as a prefilled `mailto:` — the same
mechanism as "Send a consent to sign" — rather than sent by the platform. The practice keeps
its own sender reputation and deliverability, the patient sees a familiar address, and a reply
reaches the practitioner. The trade-off is deliberate: a hand-off is unobservable, so the app
claims no delivery status and records only that aftercare was issued.

Scope note: this covers the WEB app. iOS still sends aftercare server-side through the
`sendAftercare` callable and the `mailOutbox`/Resend pipeline, which remain deployed. Both
clients append an `aftercareRecord` note, so the clinical record is consistent across them.
## Requirements
### Requirement: Aftercare is handed off to the practitioner's email client
The web app SHALL send aftercare by opening a prefilled `mailto:` addressed to the patient, matching the consent-to-sign flow. It SHALL NOT send the email itself, and SHALL NOT call the `sendAftercare` Cloud Function.

#### Scenario: Practitioner sends aftercare
- **WHEN** a nurse or doctor composes aftercare for a patient with an email address and confirms the send
- **THEN** the app opens a `mailto:` to that patient prefilled with the aftercare subject and the assembled body
- **AND** no Cloud Function is called and no `mailOutbox` document is created by the web

#### Scenario: Patient has no email address
- **WHEN** the patient on file has no email address
- **THEN** the send control is disabled and the app explains that an address must be added first

### Requirement: The send is recorded on the patient file
The app SHALL append an `aftercareRecord` note capturing the body sent, the selected categories, and any attached medication details, so the clinical record shows aftercare was issued.

#### Scenario: Note written on send
- **WHEN** the practitioner confirms an aftercare send
- **THEN** an `aftercareRecord` note is appended with the composed body and selected categories
- **AND** in live mode the note is written by the client to Firestore, not by a Cloud Function

#### Scenario: Medications attached
- **WHEN** the practitioner leaves the medication toggle enabled and the latest treatment note has medications
- **THEN** those medications are recorded on the aftercare note

### Requirement: No delivery status is claimed
Because a `mailto:` hand-off is unobservable, the app SHALL NOT display or store a delivery status, a failure reason, or a retry control for aftercare.

#### Scenario: Aftercare note displayed
- **WHEN** a practitioner views an `aftercareRecord` note on the patient file
- **THEN** no Queued, Delivered, or Failed badge is shown
- **AND** no failure reason and no "Retry delivery" control is offered

#### Scenario: Historical note carrying a legacy status
- **WHEN** a note written before this change still carries a `deliveryStatus` field in Firestore
- **THEN** the app ignores it and renders the note without a delivery badge

### Requirement: Aftercare prefill content is preserved
The composed body SHALL keep the existing prefill behaviour — the default text when no
category is selected, the assembled category templates in selection order, and the
practitioner's manual edits until the next category toggle — over the owner's 19/07
template set: eight categories (`antiwrinkle`, `skinbooster`, `haFiller`,
`biostimulatorFiller`, `biostimulatorRejuvenation`, `fatDissolve`, `fillerDissolve`,
`prpPrf`), each carrying the owner's per-treatment text (an intro paragraph followed by
its bulleted instructions) with the treatment content preserved verbatim.

The email greeting SHALL be "Dear {patient name}," ("Dear patient," when no name is on
file). The subject SHALL be the owner's per-treatment "Your Aftercare Guide for …"
line when exactly one category is selected, and a generic "Your Aftercare Guide" form
when zero or several are selected.

#### Scenario: No category selected
- **WHEN** the aftercare panel is opened and no category is selected
- **THEN** the body is the default aftercare text and the subject is the generic form

#### Scenario: One category selected
- **WHEN** the practitioner selects exactly one category
- **THEN** the body is that category's owner template under its uppercased heading
- **AND** the subject is that treatment's "Your Aftercare Guide for …" line

#### Scenario: Several categories selected
- **WHEN** the practitioner selects several categories
- **THEN** the body is those categories' templates, in selection order, each under its uppercased heading
- **AND** the subject is the generic form

#### Scenario: New biostimulator and PRP categories selectable
- **WHEN** the practitioner opens the aftercare panel or the templates page
- **THEN** `biostimulatorFiller`, `biostimulatorRejuvenation`, and `prpPrf` are offered alongside the original five
- **AND** the Firestore mappers accept those ids on `aftercareCategories`

### Requirement: The aftercare body closes by directing questions to the practitioner
The assembled aftercare body SHALL end with the owner's closing sentence — "If you have
any questions regarding your care, please contact your designated practitioner directly."
— appearing exactly once regardless of how many categories are selected. It SHALL NOT
describe the message as automated or instruct the patient not to reply (the document's
"automated system email / do not reply" sentence is deliberately not adopted), since the
message is sent from the practitioner's own address and a reply reaches them.

#### Scenario: Single category selected
- **WHEN** the practitioner selects one category
- **THEN** the body ends with the closing sentence, appearing exactly once

#### Scenario: Several categories selected
- **WHEN** the practitioner selects several categories
- **THEN** the closing sentence still appears exactly once, at the very end

#### Scenario: No automated-email disclaimer
- **WHEN** any aftercare body is assembled
- **THEN** it contains no "automated" claim and no "do not reply" instruction

#### Scenario: Consent email untouched
- **WHEN** a practitioner generates a consent signing link
- **THEN** the consent email prefill is unchanged by this requirement


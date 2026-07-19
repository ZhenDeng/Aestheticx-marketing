## ADDED Requirements

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
The composed body SHALL keep the existing prefill behaviour: the default text when no category is selected, the assembled category templates in selection order, and the practitioner's manual edits until the next category toggle.

#### Scenario: No category selected
- **WHEN** the aftercare panel is opened and no category is selected
- **THEN** the body is the default aftercare text

#### Scenario: Categories selected
- **WHEN** the practitioner selects one or more categories
- **THEN** the body is those categories' templates, in selection order, each under its uppercased heading

### Requirement: The aftercare body closes by directing questions to the practitioner
The assembled aftercare body SHALL end with a single closing sentence telling the patient to contact their practitioner directly with questions or concerns. It SHALL appear exactly once regardless of how many categories are selected, and SHALL NOT describe the message as automated or instruct the patient not to reply, since the message is sent from the practitioner's own address and a reply reaches them.

#### Scenario: Single category selected
- **WHEN** the practitioner selects one category
- **THEN** the body ends with the closing sentence, appearing exactly once

#### Scenario: Several categories selected
- **WHEN** the practitioner selects several categories
- **THEN** the closing sentence still appears exactly once, at the very end

#### Scenario: Consent email untouched
- **WHEN** a practitioner generates a consent signing link
- **THEN** the consent email prefill is unchanged by this requirement

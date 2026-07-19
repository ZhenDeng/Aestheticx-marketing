# aftercare-delivery — delta for aftercare-template-texts-1907

## MODIFIED Requirements

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

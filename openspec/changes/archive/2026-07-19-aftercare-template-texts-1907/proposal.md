# Aftercare prefill email texts — 19/07 owner templates

## Why

The owner supplied a document ("aftercare template all treatment", 19/07) with the exact
aftercare email text they want sent for each treatment. The web app's prefill still uses the
five short iOS-ported templates, a generic subject, and a "Hi {name}," greeting — none of
which match the owner's copy. The document also covers three treatments the app has no
category for at all (biostimulator fillers, biostimulator rejuvenation, PRP/PRF).

## What Changes

- Replace the five category template texts with the owner's per-treatment copy (intro
  paragraph + bulleted instructions), verbatim in content.
- Add three new categories: `biostimulatorFiller` (Ellansé / HArmonyCa / Radiesse),
  `biostimulatorRejuvenation` (Sculptra / Lenisna / Gouri / Hyperdiluted Radiesse), and
  `prpPrf` (PRP / PRF). They appear in the aftercare panel, the templates page, and are
  accepted by the Firestore mappers.
- Subject becomes the owner's per-treatment "Your Aftercare Guide for … Treatment" when
  exactly one category is selected, with a generic "Your Aftercare Guide" form otherwise.
- Greeting becomes "Dear {name}," per the document (fallback "Dear patient," when no name).
- Closing adopts the document's practitioner-contact sentence ("If you have any questions
  regarding your care, please contact your designated practitioner directly."). The
  document's "This is an automated system email. Please do not reply." sentence is
  **deliberately not adopted** on web: since PR #127 the email leaves from the
  practitioner's own mail client, replies do reach them, and the existing spec forbids
  claiming the message is automated.
- Display names updated to match the document's treatment names (e.g. "Anti-wrinkle",
  "Filler dissolve (Hylase)").

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `aftercare-delivery`: the "prefill content is preserved" requirement is replaced — the
  category set grows from five to eight, template texts change to the owner's copy, the
  subject becomes per-treatment, and the greeting changes. The closing requirement's
  wording updates to the document's sentence while keeping the no-"automated / do not
  reply" rule.

## Impact

- `src/lib/demo/aftercare.ts` — categories, display names, templates, subject, greeting,
  closing.
- `src/components/app/AftercareForm.tsx` — passes the selection into the subject builder.
- `src/app/app/templates/page.tsx`, `src/lib/firebase/mappers.ts` — pick up the three new
  categories automatically via `AFTERCARE_CATEGORIES`; no logic change expected.
- Tests: `src/lib/demo/__tests__/aftercare.test.ts`, `src/components/app/__tests__/AftercareForm.test.tsx`.
- iOS parity note: the new category ids and texts are web-first; iOS still carries the old
  five. `aftercareRecord` notes written with new category ids are ignored by clients that
  don't know them (mappers filter unknown strings), so nothing breaks, but iOS should adopt
  the same set later.
- Longer templates make multi-category `mailto:` bodies exceed ~2k chars sooner; the
  existing truncation warning in the form covers this.

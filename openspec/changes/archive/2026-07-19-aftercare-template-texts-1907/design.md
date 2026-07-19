# Design — aftercare prefill email texts (19/07 owner templates)

## Context

All prefill content lives in `src/lib/demo/aftercare.ts`; the form
(`AftercareForm.tsx`), templates page, and Firestore mappers consume it through
`AFTERCARE_CATEGORIES` / `aftercareDisplayName` / `aftercareBody` / `aftercareEmail`.
The owner's document has eight per-treatment emails, each with its own subject, a
"Dear [Client Name]," greeting, an intro paragraph, bulleted instructions, and an
"automated system email" closing.

## Decisions

1. **Category ids.** Keep the five existing ids untouched (they are stored on
   `aftercareRecord` notes in Firestore and shared with iOS). Add
   `biostimulatorFiller`, `biostimulatorRejuvenation`, `prpPrf`. Order follows the
   document: antiwrinkle, skinbooster, haFiller, biostimulatorFiller,
   biostimulatorRejuvenation, fatDissolve, fillerDissolve, prpPrf.

2. **Template shape.** Each template = intro paragraph, blank line, then one line per
   instruction as `Label: text` (the document's bold labels become plain-text
   prefixes). Content verbatim from the document apart from dropping its per-template
   closing sentence — the closing is appended exactly once by `aftercareBody`, as today.

3. **Closing.** `AFTERCARE_CLOSING` becomes the document's second sentence:
   "If you have any questions regarding your care, please contact your designated
   practitioner directly." The "automated system email / do not reply" sentence is NOT
   adopted (web sends from the practitioner's own mail client — PR #127; spec forbids it).

4. **Subject.** New `aftercareSubject(categories)`: exactly one selected → that
   treatment's documented subject; zero or many → "Your Aftercare Guide".
   `aftercareEmail(patientName, body, categories)` gains the categories parameter; the
   form passes its current selection.

5. **Greeting.** "Dear {name}," / "Dear patient," (was "Hi {name}," / "Hi,").

6. **Display names** (chips + section headings): Anti-wrinkle, Skinbooster, HA filler,
   Biostimulator filler, Biostimulator rejuvenation, Fat dissolve,
   Filler dissolve (Hylase), PRP / PRF.

7. **No UI redesign.** The panel already renders chips from `AFTERCARE_CATEGORIES`;
   three more chips wrap onto the next line. The existing >2k-char mailto truncation
   warning covers the longer bodies.

## Risks

- **HA filler loses the explicit "URGENT … changes in vision" vascular warning** — the
  owner's document does not include one. Followed the document verbatim; flagged to the
  owner in the PR for an explicit clinical sign-off.
- New ids reach Firestore before iOS knows them; iOS mappers filter unknown strings, so
  records degrade gracefully. Parity follow-up noted in the proposal.

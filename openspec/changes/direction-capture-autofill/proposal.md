## Why

Exporting a Clause 68C direction currently opens a capture dialog with fields blank that the
app already knows the answers to, so the clinician retypes information the system holds — on a
legal document, where a typo matters. Reported from a live session with four fields empty and
one wrongly pre-filled.

Three of the five have causes inside this repo:

- **Premises of administration** falls back to `""` when the authorisation carries no stamped
  premise (legacy authorisations, and any created before the round-6 premise stamp).
- **Route** only appears when the authorisation's medication has no route — but the route WAS
  chosen at request time (`request/page.tsx` requires it per line item), and nothing carries it
  across, so the clinician re-enters a value the request already recorded.
- **Number & intervals** is pre-filled `"Up to 5, ≥ 4 weeks apart"`, a clinical claim the app
  invented. It must not assert a schedule nobody entered.

## What Changes

- **Premises of administration** SHALL fall back to the acting user's currently selected
  premise (`activePremise`: selected → default → first) when the authorisation has none stamped.
  This is the same resolver that stamps new requests, so capture and request agree.
- **Route** SHALL fall back to the route recorded on the originating request's matching line
  item. Matching is by medication name + dosage, and only an unambiguous single match is used —
  an ambiguous match leaves the field blank rather than guessing on a legal document.
- **Number & intervals** default becomes `"PRN"`. **BREAKING** for any test asserting the old
  string.
- All three remain editable; these are prefills, not locks.

## Capabilities

### New Capabilities
- `direction-capture`: what the Clause 68C direction capture dialog prefills, from which source,
  and what it must refuse to guess.

### Modified Capabilities
<!-- None. No existing spec covers the direction capture dialog. -->

## Non-Goals — prescriber phone and principal place

The report also flagged **Prescriber phone** and **Principal place of practice** as needing
autofill. Both are **deliberately out of scope: they cannot be fixed in this repo.**

The autofill code already exists (`DirectionDialog.tsx` reads `store.profileForUser(doctorID)`)
and works in demo, where the whole cast is seeded. It fails in live because
`hydrate.ts` loads only the **caller's own** `users/{uid}` document — a nurse exporting a
direction has never loaded the doctor's profile, so `profileForUser` returns its all-blank
default. Nothing else carries the data: `listDoctors` returns only `{doctorId, doctorName}`,
and neither the `authRequests` nor the `authorisations` document stamps prescriber contact.

Fixing it requires a backend change in the Cloud Functions repo — either `approveRequest`
stamping `prescriberPhone` / `prescriberPrincipalPlace` onto the authorisation document, or
extending `listDoctors` to return them. Stamping at approval is preferable: it snapshots the
prescriber's details as they were when the direction was authorised, which is what a legal
document should record.

A related defect found while investigating, also **not** fixed here:
`directionPrescriberName` and `directionResponsibleProvider` (`direction.ts:224-234`) resolve
names by searching the hardcoded `DEMO_ACCOUNTS` cast. In live, a real Firebase uid is not in
that list, so the direction prints the **raw uid** as the prescriber name. This needs its own
decision about the source of truth (cooperation relationships carry `doctorName`; requests
carry `nurse.name`) and is filed separately rather than folded in here.

## Impact

- `src/lib/demo/direction.ts` — `DEFAULT_CAPTURED_FIELDS` default; new pure resolvers for the
  premise and route fallbacks.
- `src/components/app/DirectionDialog.tsx` — prefill wiring; needs the acting identity.
- Tests asserting the old `"Up to 5, ≥ 4 weeks apart"` default: `direction.test.ts`,
  `direction-pdf.test.ts`.
- No backend, Firestore, or Cloud Functions changes. No PDF layout change.

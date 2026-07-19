# Authorization PDF feedback (19/07)

## Why

The owner reviewed the combined Treatment Authorisation PDF (generated at approval) and asked
for a simpler document: the regulatory boilerplate sections (Clause 68C heading, per-administration
recording grid, prescriber/period/administration fields) crowd the document, the default timing
wording is wrong, and the doctor's phone number should not print under the doctor's name in the
header.

## What Changes

- **Remove** the "PER ADMINISTRATION — TO RECORD" section (heading, instruction text, and the
  backend's blank recording grid).
- **Remove** the "DIRECTION UNDER CLAUSE 68C — NSW POISONS AND THERAPEUTIC GOODS REGULATION 2008"
  section heading. The "Premises of administration" field stays, now without a section bar above it.
- **Remove** the body fields "Prescriber", "Principal place of practice", "Period direction has
  effect", and "Administrations". "Premises of administration" is the only field kept from that block.
- **Change** the default "Timing of treatment" value from
  "PRN monthly, max 6 treatments yearly (6 months in NSW)" to
  "PRN, max 5 treatments, expire after 6 months". Per-item timing captured on the request still
  takes precedence.
- **Remove** the phone number printed under the doctor's name in the document header (backend
  renderer's `headerContactLines`). Clinic-context headers keep the clinic's own contact lines.
- The prescriber signature block at the bottom of the document is unchanged (name, authorised-on
  date, prescriber number, e:/p:/a: contact lines).

Both renderers change in lockstep: the demo-mode web renderer (`src/lib/demo/approvalPdf.ts`,
this repo) and the LIVE Cloud Function renderer (`backend/functions/src/authorisationPdf.ts` in
the Aestheticx backend repo — layout truth), shipped as two coupled PRs like prior feedback rounds.

## Capabilities

### New Capabilities

- `authorisation-pdf`: layout and content of the combined Treatment Authorisation PDF produced at
  approval (header, dates/patient blocks, Authorisation-to-treat table, premises of administration,
  emergency references, signature block) — for both the demo web renderer and the backend Cloud
  Function renderer.

### Modified Capabilities

(none — no existing spec covers the approval PDF layout)

## Impact

- Web (this repo): `src/lib/demo/approvalPdf.ts` (model + renderer), `src/lib/demo/__tests__/approval-pdf.test.ts`.
- Backend repo: `backend/functions/src/authorisationPdf.ts` (model + pdfkit renderer + generator),
  `backend/functions/src/authorisationPdf.test.ts`; requires a Functions deploy of `approveRequest`
  / `regenerateApprovalDocument` for the live document to change.
- Already-generated PDFs in Storage are unchanged; a doctor/super-admin can regenerate a specific
  request's document via the existing regenerate callable.
- iOS in-app renderer is out of scope for this round (web + backend parity only), consistent with
  previous feedback rounds.

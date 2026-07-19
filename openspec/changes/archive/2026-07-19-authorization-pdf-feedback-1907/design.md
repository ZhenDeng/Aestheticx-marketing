# Design — authorization-pdf-feedback-1907

## Context

Two renderers produce the combined Treatment Authorisation PDF and must stay in parity:

- **Demo/web** (this repo): `src/lib/demo/approvalPdf.ts` — pure model
  (`buildApprovalDocumentModel`) + hand-rolled writer (`renderApprovalPdf`).
- **Backend/live** (Aestheticx repo): `backend/functions/src/authorisationPdf.ts` — same model
  split + pdfkit renderer; `approveRequest` / `regenerateApprovalDocument` call it. Layout truth.

The 19/07 owner feedback removes regulatory boilerplate (Clause 68C heading, prescriber block
fields, per-administration recording grid), changes the default timing wording, and drops the
phone under the doctor-name header.

## Goals / Non-Goals

**Goals:**
- Both renderers drop the removed sections/fields identically.
- New default timing wording: "PRN, max 5 treatments, expire after 6 months" (captured per-item
  timing still wins).
- No prescriber phone in the doctor-name header (backend `headerContactLines`).
- Model and tests stay honest: fields the document no longer prints leave the document model.

**Non-Goals:**
- iOS in-app renderer (`AuthorisationPDFRenderer`, `AuthorisationDocument.defaultTiming`) — out
  of scope this round, as in prior feedback rounds.
- Regenerating already-stored PDFs (existing regenerate callable covers ad-hoc needs).
- Any change to approval flow, note writing, storage paths, or emergency-authorisation logic.

## Decisions

- **Remove dead model fields, don't just skip drawing them.** `periodOfEffect`,
  `administrations`, `recordingRowCount` (backend), and the demo's `prescriberName`/`prescriberPhone`/
  `prescriberPrincipalPlace` field usages leave the model where no renderer consumes them —
  except the prescriber block, which the signature block still needs (backend keeps
  `prescriber: PrescriberBlock`; demo keeps its prescriber fields for the signature block).
  Rationale: an unused model field on a compliance document invites drift between model tests
  and rendered truth.
- **Signature block unchanged.** Item 5 says "in the title under doctor name" — the header.
  The bottom signature block keeps p:/a: lines (they are the prescriber's contact for the
  document recipient, a different concern than the header).
- **`DEFAULT_TIMING` constant changes in both repos**; `REPEATS_PER_AUTHORISATION`/`VALIDITY_MONTHS`
  domain constants are untouched (they drive repeats fan-out and expiry, not wording).
- **Clinic headers keep clinic phone/email.** The feedback targets the doctor-name header; the
  clinic block prints the clinic's own reception contact, which the owner has not flagged.
- **Two coupled PRs** (web + backend), backend deploy required for live parity — same shipping
  pattern as rounds 16/07–19/07.

## Risks / Trade-offs

- [Owner may have meant forcing ALL timing cells to the new wording] → captured per-item timing
  still wins (matches "modify value of Timing of treatment" reading as the default; per-item
  capture was an explicit earlier feature). Flag in the PR description for easy reversal.
- [Live PDFs unchanged until Functions deploy] → note deploy step in backend PR; regenerate
  callable available for already-approved requests.
- [iOS renderer now diverges further] → recorded as a non-goal; web-port roadmap tracks parity.

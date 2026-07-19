# Backfill plan — prescriber contact on legacy authorisations

**Status: NOT EXECUTED. Specified for the owner to review and run.**
Repo: `AestheticX` (backend), not this one. Mutates production Firestore data.

## Why it is needed

This is the only fix for the reported case. An authorisation approved before
`prescriberContactStamp` shipped carries neither `prescriberPhone` nor `prescriberPrincipalPlace`.
A nurse opening its Clause 68C direction cannot fall back to the prescriber's profile — Firestore
rules and `hydrate` give her only her own `users` doc — so both fields are blank, the export gate
correctly blocks, and she is prompted to type them onto a legal document. No client-side change
can resolve this; the values are simply not on the wire.

## What to write

For each `authorisations` document lacking either field, stamp from the approving doctor's
`users/{doctorId}` document using the **existing** `prescriberContactStamp` helper
(`backend/functions/src/domain.ts:228`) — do not reimplement its semantics:

- trim; treat a non-string as absent;
- **omit** an unusable field rather than writing `""`. This is load-bearing. The web reader treats
  any non-empty stamp as authoritative and stops there, so a blank stamp would both empty the field
  on the document and satisfy the `missingDirectionFields` gate that exists to catch it;
- the two fields are independent — a clinic-account doctor legitimately has no principal place and
  must still receive a usable phone.

## Rules that must hold

1. **Never overwrite an existing non-empty stamp.** A stamp records the doctor's contact *as it was
   at authorisation*. Overwriting it with today's profile would silently restate a months-old legal
   document. Only fill absent fields.
2. **Use the authorisation's own `doctorId`**, never the requesting nurse, the clinic, or the
   operator running the script. The direction names the doctor who approved.
3. **Do not touch any other field**, and do not alter `createdAt` / `reviewedAt`.
4. **Idempotent** — a second run must be a no-op. Rule 1 gives this for free.
5. Leave a document untouched, not partially written, if its doctor's `users` doc is missing or
   holds nothing usable. Those authorisations keep prompting, which is the correct fail-closed
   outcome.

## How to run it

1. **Dry run first**, writing nothing: report how many authorisations lack each field, how many
   would be filled, how many would remain unfillable (doctor doc missing or blank), and the
   distinct doctor ids involved. Sanity-check the doctor count against the real prescriber roster.
2. Run against the **emulator** seeded with a production export before touching production.
3. Batch writes (Firestore caps a batch at 500) and make the script resumable — record progress so
   an interrupted run can continue without re-reading everything.
4. Run in production **off-hours**, then re-run the dry run to confirm the remaining count is only
   the genuinely unfillable ones.

## Verification

- Pick a known legacy authorisation, open its direction **as the nurse who holds it**, and confirm
  Phone and Principal place of practice are prefilled and the export is no longer gated on them.
- Confirm a doctor whose profile has no phone produced an authorisation with **no**
  `prescriberPhone` key — not an empty string.
- Re-run the script; confirm zero writes.

## Rollback

The script only *adds* absent fields, so rollback is deleting the fields it wrote. Record the ids
it touched in the dry run and in the live run so that set is known exactly. There is no
loss-of-data risk from the script itself; the risk is writing the *wrong* contact, which rules 1
and 2 exist to prevent.

## If the backfill is declined

The behaviour then stands as it is today: legacy authorisations prompt the nurse for both fields,
now legibly (PR #124), and she supplies them from the doctor's letterhead. That is safe — the
export gate holds and nothing wrong is printed — but it is manual, repeated per export, and asks a
nurse to transcribe a prescriber's details onto a legal document.

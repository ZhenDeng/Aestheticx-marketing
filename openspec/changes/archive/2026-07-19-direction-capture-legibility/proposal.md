## Why

Two 18/07 feedback items, both on the Clause 68C direction flow, both about legibility rather
than correctness:

1. The affordance that opens the direction is labelled `68C` — a bare regulation number. Users
   report not knowing what the button does.
2. Opening a direction on an older authorisation shows three blank fields and a single red line
   at the bottom of the form: *"Still needed: Prescriber phone, Principal place of practice,
   Route"*. The blanks themselves are **correct** — a nurse in live mode genuinely cannot resolve
   those values (see below) and the direction is a legal document, so blank-and-prompt beats
   guessing. But the form gives no signal at the field itself, no explanation of why the app
   couldn't fill it, and the free-text Route input invites arbitrary prose onto a legal document.

Root cause of the blanks (investigated, not in dispute): `hydrate` loads only the caller's own
`users` doc, so `profileForUser(authorisation.doctorID)` returns the blank default for a nurse —
the profile fallback in `prescriberContactForCapture` is dead in live for anyone but the doctor
themselves. Authorisations approved before the prescriber-contact stamp shipped carry no stamp to
fall back to, and authorisations predating per-item routes (2026-07-14) carry no route on either
the medication or the originating request's items. All three fields are therefore genuinely
unknowable to that client. This change does **not** try to make them knowable — it makes the
prompt legible and the answer constrained.

## What Changes

- The `68C` button in the Active authorisations sidebar is relabelled **Direction**. The Clause
  68C citation moves to a hover tooltip; the dialog heading and the accessible name are unchanged,
  so the legal reference is never lost — only demoted from the primary label.
- Route capture switches from a free-text input to the **canonical five-option selector** already
  used by the request form. A route printed on a direction can now only be one of the five legal
  values. As on the request form, it is never pre-chosen — it must be an active choice.
- Required-but-empty capture fields are marked **at the field**: an inline required affordance and
  accessible invalid state on the input, plus one short line explaining that the app could not
  resolve the value and that filling it unblocks export. The bottom-of-form summary remains as the
  roll-up.
- Export gating is **unchanged**. `missingDirectionFields` still decides what is missing and still
  blocks both Preview and Download. No field becomes newly optional or newly required.

### Follow-up, deliberately out of scope

Making prescriber phone and principal place *resolvable* for legacy authorisations requires the
backend repo, and is left as a separate change: either a backfill stamping
`prescriberPhone` / `prescriberPrincipalPlace` onto pre-existing authorisation docs, or carrying
prescriber contact on the nurse-readable cooperation relationship doc. Neither is attempted here.

## Capabilities

### New Capabilities

None. This change refines an existing capability.

### Modified Capabilities

- `direction-capture`: Route is captured through a constrained five-option selector rather than
  free text; required-but-empty fields carry an inline required/invalid affordance and an
  explanation; the entry-point affordance is named for the document it produces rather than for
  the regulation clause.

## Impact

- `src/app/app/patients/[id]/page.tsx` — the Active authorisations button label and tooltip.
- `src/components/app/DirectionDialog.tsx` — the capture form: Route control, per-field required
  state, explanatory copy.
- `src/lib/demo/types.ts` (read-only use) — `ROUTES_OF_ADMINISTRATION` / `ROUTE_DISPLAY_LABELS`
  become shared between the request form and the capture dialog. The shared selector may be
  lifted out of `src/app/app/patients/[id]/request/page.tsx` so both surfaces use one control.
- Tests: `src/components/app/__tests__/DirectionDialog-prefill.test.tsx` gains the live-shaped
  composite regression case (nurse caller, blank prescriber profile, unstamped contact, routeless
  medication and routeless originating request) that no existing test can reach.
- No wire-format, Firestore-rules, PDF-layout, or gating changes. The exported PDF bytes for a
  fully-populated direction are unaffected.

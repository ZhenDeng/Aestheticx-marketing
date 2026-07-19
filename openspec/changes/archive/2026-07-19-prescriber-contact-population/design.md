## Context

The reading side of prescriber contact is correct and stays untouched: the capture dialog prefers
the stamp written at approval, falls back to the prescriber's profile, resolves the two fields
independently, and blocks export when neither source yields a value. The deployed backend already
writes that stamp. What this change addresses is the **writing** side, in the two places this repo
owns, plus a plan for the one it does not.

## Goals / Non-Goals

**Goals:**

- Demo approval stamps prescriber contact exactly as the deployed backend does, so the two modes
  agree and demo-mode tests can catch a regression in the stamp.
- A doctor cannot silently destroy their own future directions by clearing a required field.
- A written, reviewed backfill plan for the legacy authorisations that are the reported case.

**Non-Goals:**

- Running the backfill, or any production data mutation.
- Changing prefill precedence, the export gate, or anything the capture dialog reads.
- Retrofitting validation onto `updateProfile` as a general-purpose rule. The guard belongs where
  the user is, so it can explain itself; a silent throw deep in the store would surface as a dead
  Save button.

## Decisions

### Mirror `prescriberContactStamp` rather than re-deriving it

Demo's stamp copies the deployed function's semantics literally: trim, treat a non-string as
absent, and **omit** an unusable field rather than writing `""`. The omission is the load-bearing
part — the reader treats any non-empty stamp as authoritative and stops there, so a blank stamp
would empty the field on the document *and* satisfy the gate meant to catch it. The two
implementations are checked against the same scenarios in the delta spec.

*Alternative rejected:* stamping `phone: profile.phone` unconditionally. Simpler, and wrong in
exactly the case that matters — a doctor with no phone would produce authorisations that look
stamped and print blank.

### Guard at the editor, refusing the whole save

The check lives in the profile form's `save()`, where it can name the consequence. A refused save
applies **nothing**, including unrelated fields edited at the same time: applying a partial save
would leave the form showing values that were not stored, and the user has no way to tell which
took.

*Alternative rejected:* disabling Save while a required field is blank. It gives no reason, and a
disabled control that the user cannot explain reads as a bug — the same failure this whole line of
feedback is about.

### The doctor role, not the account type, decides principal place

The editor already shows the field on `holdsDoctorRole`, and provisioning requires it of non-clinic
doctors. The guard keys off the same `showsPrincipalPlace` flag the field renders on, so what is
required is exactly what is visible. A clinic account carries no doctor role and is unaffected.

## Risks / Trade-offs

- **[A doctor whose profile is *already* blank cannot save any profile edit]** → Real, and the
  guard would trap them. It only refuses a field the user is *clearing* or leaving blank while
  editing; an already-blank field must still be fixable, so the refusal must not fire until the
  field has a value to protect. Handled by requiring non-blank on save regardless of prior state —
  which means such a doctor is forced to supply the missing value to save anything, and that is the
  correct outcome: their directions are broken until they do.
- **[Demo stamping changes seeded authorisation shape]** → The seed approves through the same
  `approveRequest`, so seeded authorisations gain the stamp. That is the point (demo should mirror
  live), but any test asserting the absence of these fields on a seeded authorisation will need
  updating; the prefill tests construct their own fixtures and are unaffected.
- **[The reported case is still not fixed by this change]** → Stated plainly in the proposal and in
  the PR. Only the backfill resolves it, and that is the owner's to run.

## Migration Plan

None in this repo. The backfill is specified separately in `backfill-plan.md` and is not executed.

## Open Questions

None.

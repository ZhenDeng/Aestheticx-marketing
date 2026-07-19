## Why

Feedback, 19/07: *"Prescriber phone and Principal place of practice should be the doctor's phone
and Principal place of practice who approved the authorisation."*

That is already the intent, and the deployed backend already implements it —
`approveRequest` stamps `prescriberContactStamp(doctorSnap.data())` onto every authorisation it
grants (`backend/functions/src/index.ts:207`), and the capture dialog reads that stamp first.
Doctor provisioning already requires both fields (`userAdmin.ts:52` phone, `:64` principal place).

So the requirement holds; what fails is population, in three distinct places:

1. **Legacy authorisations carry no stamp.** The reporter's case. An authorisation approved before
   the stamp shipped has neither field, and a nurse cannot fall back to the prescriber's profile —
   `hydrate` reads only the caller's own `users` doc. Nothing client-side can recover them. **Only
   a backfill fixes this, and it lives in the backend repo.**
2. **A doctor can blank the fields after provisioning.** `updateProfile` merges whatever it is
   given, empty strings included, and the profile editor has no guard. Provisioning insists on
   phone and principal place; editing quietly lets a doctor remove them. From that moment every
   authorisation they approve stamps nothing for the blanked field, and every direction drawn from
   those authorisations is permanently blocked for the nurse who holds it — with no signal to the
   doctor that they caused it.
3. **Demo never stamps at all.** `approveRequest` in `src/lib/demo/backend.ts` stamps `doctorName`,
   `nurseName`, `premise` and `clinicPremise`, but not prescriber contact. Demo only appears to
   work because `profileForUser` resolves every user there. So the demo cannot reproduce the live
   behaviour, and — as with the routeless-authorisation defect before it — a real regression in
   the stamp would pass every demo-mode test.

## What Changes

- **The profile editor refuses to save a blank required field.** Phone (every account) and
  principal place (doctors) cannot be cleared once set, mirroring the rules provisioning already
  enforces. The save is blocked with an explanation naming the consequence, rather than silently
  accepted.
- **Demo `approveRequest` stamps prescriber contact**, field-independently and omitting rather
  than blanking, exactly as the deployed `prescriberContactStamp` does — so demo and live agree,
  and demo-mode tests can catch a regression in it.
- **No change to the capture dialog, the export gate, or the reading precedence.** The stamp still
  wins over the profile; both blank still blocks export.

### Not in this change

The **backfill** of `prescriberPhone` / `prescriberPrincipalPlace` onto pre-existing authorisation
documents. It is the only fix for cause 1, it belongs to the backend repo, and it mutates
production data — so it is specified here as a reviewed plan (`backfill-plan.md`) for the owner to
execute, and deliberately not run.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `direction-capture`: prescriber contact is stamped at approval in demo as well as live, so the
  documented prefill precedence holds identically in both modes.
- `profile-premises`: a required profile field that provisioning demanded cannot later be cleared
  through the profile editor.

## Impact

- `src/lib/demo/backend.ts` — `approveRequest` gains the prescriber-contact stamp.
- `src/app/app/profile/page.tsx` — save-time guard and its message.
- Tests: demo-approval stamping, and the profile editor's refusal to clear.
- No wire-format, Firestore-rules, or PDF change. The reading side is untouched.
- **Does not resolve the reported authorisation**, which is legacy and needs the backfill.

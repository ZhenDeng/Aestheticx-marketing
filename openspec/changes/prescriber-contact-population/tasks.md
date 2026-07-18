## 1. Demo approval stamps prescriber contact

- [x] 1.1 Write failing tests: approving a request stamps the approving doctor's phone and principal place onto every granted authorisation; the values are the doctor's, not the nurse's or the clinic's
- [x] 1.2 Write failing tests for the omission rule: an unusable profile value yields NO key on the authorisation rather than an empty string, and the two fields are omitted independently
- [x] 1.3 Add the stamp to `approveRequest` in `src/lib/demo/backend.ts`, mirroring the deployed `prescriberContactStamp` semantics (trim, non-string treated as absent, omit rather than blank)
- [x] 1.4 Confirm the capture dialog now prefills from the stamp in demo, and that `DirectionDialog-prefill.test.tsx`'s profile-fallback case still exercises the fallback (its fixtures build authorisations directly, so it should be unaffected — verify rather than assume)

## 2. A required profile field cannot be cleared

- [x] 2.1 Write failing tests: a doctor clearing Phone is refused and the stored value is unchanged; same for Principal place of practice; whitespace-only is refused as blank
- [x] 2.2 Write a failing test that a refused save applies NOTHING — an AHPRA edit made alongside a blanked Phone is not persisted either
- [x] 2.3 Write failing tests for the allowed paths: a non-blank change still saves, and an account holding no doctor role is not required to supply a principal place
- [x] 2.4 Add the save-time guard to `ProfileFieldsEditor` in `src/app/app/profile/page.tsx`, keyed off the same `showsPrincipalPlace` flag the field renders on
- [x] 2.5 Add the refusal message, naming the consequence (directions from this doctor's approvals would be blocked) rather than saying only "required"
- [x] 2.6 Give the message an accessible association with the offending control, consistent with the direction dialog's `aria-invalid` / `aria-describedby` treatment

## 3. Backfill (specified, NOT executed)

- [x] 3.1 Write `backfill-plan.md`: what to write, the five rules that must hold, dry-run-first procedure, verification, rollback, and the consequence of declining
- [ ] 3.2 Owner decision — run it, or accept that legacy authorisations keep prompting. **Not actionable in this repo**

## 4. Verification

- [x] 4.1 Full unit suite green, including any seeded-authorisation assertions that the new demo stamp changes
- [x] 4.2 `tsc --noEmit`, lint, and `next build` clean
- [x] 4.3 e2e green; confirm the direction e2e still passes now that seeded demo authorisations carry the stamp
- [x] 4.4 Verify the stamp — **not drivable in a browser, by design**: demo resolves every profile, so the capture dialog would prefill from the fallback whether or not the stamp existed, and the browser cannot tell the two apart. Isolated instead in `backend.test.ts` ("approveRequest — prescriber contact stamp"), which sets the doctor's profile explicitly and asserts the granted authorisation's own fields, including the nurse's contact never being substituted
- [x] 4.5 Drive the guard in a browser: as a doctor, clear Phone, confirm the refusal names the consequence and the control reports `aria-invalid`. Persistence is asserted in the unit test (`updateProfile` never called) rather than by reloading — demo state resets on reload. Driving it surfaced a real bug the unit tests had missed: a stored refusal went stale once the field was corrected, since restoring the value makes the form clean and removes the Save button. Now derived from an `attempted` flag so it clears reactively; pinned by a new unit test

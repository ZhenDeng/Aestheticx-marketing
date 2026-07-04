# Auth-overlap parity in the demo backend — design

**Date:** 2026-07-04 · **Spec source:** appointments spec *Double-booking rules*; deployed
behaviour source: AestheticX#49 (`assertNoAuthOverlapTx`, deployed to australia-southeast1
2026-07-04).

## Problem

The demo port deliberately had **no** overlap check on `requestAdHocAuth` (documented as
parity with the then-deployed `adHocAuthTx`), and `bookAuthSlot` only rejected an **exact**
slot-start match (`isSlotTaken`). AestheticX#49 changed the deployed behaviour: both
authorisation-creating callables now reject any overlap with a non-cancelled authorisation
appointment (half-open intervals — touching allowed; treatment overlaps allowed). The demo
must follow the deployed backend.

## Change (web-only)

- Pure `hasAuthOverlap(state, doctorID, dateISO, startMinute, endMinute)` in `backend.ts` —
  the demo mirror of `assertNoAuthOverlapTx`'s predicate (no mutex needed: the demo store is
  single-threaded synchronous state).
- `requestAdHocAuth` throws `BackendError("slotTaken")` on overlap (after the
  online/always-accept gate, matching the deployed check order).
- `bookAuthSlot` uses `hasAuthOverlap` instead of the exact-match `isSlotTaken` (a superset:
  an off-grid ad-hoc appointment now blocks straddled slots). `isSlotTaken` stays for the
  open-slot display grid, matching the deployed `listDoctorOpenSlots`, which also doesn't
  consider ad-hoc appointments — the booking attempt is where rejection happens, both live
  and demo.
- Ad-hoc card error mapping: `slotTaken` → "That time was just taken — pick another."
  (the deployed callable's message).

## Tests

`adhoc-auth.test.ts`: overlap above/below rejects; touching allowed; cancelled ignored;
treatment/other-doctor/other-day ignored. `auth-slots.test.ts`: slot straddled by an
off-grid ad-hoc appointment rejects on both sides, next touching slot books.

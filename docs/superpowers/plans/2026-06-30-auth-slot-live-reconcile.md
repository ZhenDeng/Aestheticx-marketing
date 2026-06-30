# Auth-Slot Live Reconciliation (doctor side) — Plan

Design: `docs/superpowers/specs/2026-06-30-auth-slot-live-reconcile-design.md`
Backend dependency: AestheticX `feat/functions-withdraw-auth-slots` (`withdrawAuthSlots`).

## 1. Backend (separate repo)
- [x] 1.1 `withdrawAuthSlots` callable + `withdrawAuthSlotsTx` (TDD, emulator) — done on AestheticX branch

## 2. Web mappers + hydrate
- [x] 2.1 `mapAvailabilityWindow` (pure) + unit test
- [x] 2.2 hydrate the doctor's own `slotPublications` → `availabilityWindows` (both paths; optional rows default)

## 3. Web mirrors + store
- [x] 3.1 `mirrorPublishAvailability` → `publishAuthSlots`; `mirrorWithdrawAvailability(dateISO,startMinute)` → `withdrawAuthSlots`
- [x] 3.2 `store.withdrawAvailability` passes the window's dateISO+startMinute to the mirror
- [x] 3.3 `mirrorBookAuthSlot` payload aligned (nurse live booking deferred — TODO)

## 4. Review
- [x] 4.1 Engineer review (typescript-reviewer); fixed 2 HIGH — optimistic window id now = backend composite key (no ghost on hydrate, idempotent re-publish); `mapAvailabilityWindow` hard-codes `doctorName=''` (+ slotStarts comment, test pin)
- [x] 4.2 QA: demo regression on `/app/availability` (publish + withdraw) — green, no console errors

## 5. Verify + ship
- [x] 5.1 `npm test` green (251); `npm run build` + `eslint` + `tsc` clean
- [x] 5.2 Update `web-port-roadmap` memory (auth-slot doctor side live; nurse read model still TODO)
- [ ] 5.3 `/create-pr` (web) + the backend PR

## Out of scope (next slice)
Nurse-side availability read model + async page + book-then-rehydrate (see design "Out of scope").

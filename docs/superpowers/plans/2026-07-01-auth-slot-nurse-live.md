# Auth-Slot Nurse-Side Live — Plan

Design: `docs/superpowers/specs/2026-07-01-auth-slot-nurse-live-design.md`

## 1. Backend (AestheticX `feat/functions-nurse-availability`)
- [x] 1.1 `listAvailableDoctors` + `listDoctorOpenSlots` callables (+ testable cores); integration tests; `fileParallelism:false`

## 2. Web mirrors + store
- [x] 2.1 `mirrorListAvailableDoctors` / `mirrorListDoctorOpenSlots`; `mirrorBookAuthSlot(rawFields)`
- [x] 2.2 store async `listAvailableDoctors` / `listDoctorOpenSlots` (mode-branched)
- [x] 2.3 `store.bookAuthSlot` async + server-authoritative in live (no eager local validation)

## 3. Web page
- [x] 3.1 `BookConsult` async fetch (doctors + slots) with loading + stale-response guard
- [x] 3.2 refetch open slots after a booking (booked/lost slot drops)

## 4. Review
- [ ] 4.1 Engineer review (typescript-reviewer); address CRITICAL/HIGH
- [x] 4.2 Demo regression (preview): load doctors + slots, book → slot drops; no console errors

## 5. Verify + ship
- [x] 5.1 `npm test` green (251); build + eslint + tsc clean
- [ ] 5.2 Update `web-port-roadmap` memory (nurse side live — auth-slot feature fully live)
- [ ] 5.3 `/create-pr` (web) + backend PR; deploy the two callables

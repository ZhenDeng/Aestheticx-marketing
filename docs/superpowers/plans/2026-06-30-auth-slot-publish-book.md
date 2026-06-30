# Authorisation-Slot Publish + Book — Plan

Design: `docs/superpowers/specs/2026-06-30-auth-slot-publish-book-design.md`

## 1. Model
- [x] 1.1 Add `AvailabilityWindow` type + `availabilityWindows` to `DemoState`; init in `emptyState` + live `hydrate` (empty)

## 2. Domain (TDD)
- [x] 2.1 Failing tests then green: `auth-slots.test.ts` — `slotsForWindow`, `publishAvailability` (doctor/own/end>start), `isSlotTaken`, `openSlotsForDoctorOnDay` (union/taken/sorted), `withdrawAvailability` (empty/booked/owner), `bookAuthSlot` (create + slot-validation + double-book)
- [x] 2.2 Implement helpers + mutators in `backend.ts` (`SLOT_MINUTES = 10`)

## 3. Store + live
- [x] 3.1 Reads: `availabilityWindowsForDoctor`, `doctorsWithAvailability`, `openSlotsForDoctorOnDay`
- [x] 3.2 Actions: `publishAvailability`, `withdrawAvailability`, `bookAuthSlot` via `applyAndMirror` + deferred mirrors

## 4. UI
- [x] 4.1 `/app/availability` page + AppShell "Availability" nav (role-aware)
- [x] 4.2 Doctor: publish form + windows list (open/booked slots) + withdraw (blocked when booked)
- [x] 4.3 Nurse/clinic: pick doctor → open slots for a date → search patient → book; booked slot leaves the list

## 5. Review
- [ ] 5.1 Engineer review (typescript-reviewer); address CRITICAL/HIGH
- [x] 5.2 Web QA (preview): doctor sees seeded window + publishes (09:00 shows 1 booked from seed authSlot) ✓; withdraw empty removes, withdraw booked blocked ✓; nurse picks Voss → 6 slots → books Claire 14:00 → slot leaves list ✓ — no console errors

## 6. Verify + ship
- [x] 6.1 `npm test` green; `npm run build` + `eslint` + `tsc` clean
- [ ] 6.2 Update `web-port-roadmap` memory (auth-slot publish/book existing-patient shipped; lead-booking + Cloud Functions + online status deferred)
- [ ] 6.3 `/create-pr`

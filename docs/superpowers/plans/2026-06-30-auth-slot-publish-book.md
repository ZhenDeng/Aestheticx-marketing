# Authorisation-Slot Publish + Book — Plan

Design: `docs/superpowers/specs/2026-06-30-auth-slot-publish-book-design.md`

## 1. Model
- [ ] 1.1 Add `AvailabilityWindow` type + `availabilityWindows` to `DemoState`; init in `emptyState` + live `hydrate` (empty)

## 2. Domain (TDD)
- [ ] 2.1 Failing tests then green: `auth-slots.test.ts` — `slotsForWindow`, `publishAvailability` (doctor/own/end>start), `isSlotTaken`, `openSlotsForDoctorOnDay` (union/taken/sorted), `withdrawAvailability` (empty/booked/owner), `bookAuthSlot` (create + slot-validation + double-book)
- [ ] 2.2 Implement helpers + mutators in `backend.ts` (`SLOT_MINUTES = 10`)

## 3. Store + live
- [ ] 3.1 Reads: `availabilityWindowsForDoctor`, `doctorsWithAvailability`, `openSlotsForDoctorOnDay`
- [ ] 3.2 Actions: `publishAvailability`, `withdrawAvailability`, `bookAuthSlot` via `applyAndMirror` + deferred mirrors

## 4. UI
- [ ] 4.1 `/app/availability` page + AppShell "Availability" nav (role-aware)
- [ ] 4.2 Doctor: publish form + windows list (open/booked slots) + withdraw (blocked when booked)
- [ ] 4.3 Nurse/clinic: pick doctor → open slots for a date → search patient → book; booked slot leaves the list

## 5. Review
- [ ] 5.1 Engineer review (typescript-reviewer); address CRITICAL/HIGH
- [ ] 5.2 Web QA (preview): publish → slots; nurse books → calendar + slot removed; double-book + withdraw-when-booked rejected

## 6. Verify + ship
- [ ] 6.1 `npm test` green; `npm run build` + `eslint` + `tsc` clean
- [ ] 6.2 Update `web-port-roadmap` memory (auth-slot publish/book existing-patient shipped; lead-booking + Cloud Functions + online status deferred)
- [ ] 6.3 `/create-pr`

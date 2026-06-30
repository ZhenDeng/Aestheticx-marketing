# Patient File: Appointment-History Section — Plan

Design: `docs/superpowers/specs/2026-06-30-patient-appointment-history-design.md`

## 1. Domain (TDD)
- [x] 1.1 Failing tests then green: `appointmentsForPatient` — patient filter, most-recent-first ordering (across dates + within a day), all statuses included, empty case (extend `appointments-ops.test.ts`)
- [x] 1.2 Implement `appointmentsForPatient` in `backend.ts`

## 2. Store
- [x] 2.1 Add `appointmentsForPatient(patientID)` passthrough to the store

## 3. UI
- [x] 3.1 Collapsible "Appointment history (N)" card in the patient-file `<aside>`, collapsed by default
- [x] 3.2 Expanded list: date · time range + status chip (calendar palette) + appointment note; empty state

## 4. Review
- [x] 4.1 Engineer review (typescript-reviewer); no CRITICAL/HIGH correctness bugs. Applied a11y `aria-expanded` + sort comment. (HIGH-1 empty-state is correct, not dead code — verified on p-3; skipped shared-helper extraction to avoid widening the diff into the calendar page.)
- [x] 4.2 Web QA (preview): collapsed by default ("Show") ✓; p-1 lists 2 appts newest-first (09:30 before 09:00) w/ status+note ✓; p-3 empty state ✓ — no console errors

## 5. Verify + ship
- [x] 5.1 `npm test` green (230); `npm run build` + `eslint` + `tsc` clean
- [x] 5.2 Update `web-port-roadmap` memory (appointment-history shipped; merge-reassign gap flagged)
- [ ] 5.3 `/create-pr`

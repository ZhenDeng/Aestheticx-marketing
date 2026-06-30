# Patient File: Appointment-History Section — Plan

Design: `docs/superpowers/specs/2026-06-30-patient-appointment-history-design.md`

## 1. Domain (TDD)
- [ ] 1.1 Failing tests then green: `appointmentsForPatient` — patient filter, most-recent-first ordering (across dates + within a day), all statuses included, empty case (extend `appointments-ops.test.ts`)
- [ ] 1.2 Implement `appointmentsForPatient` in `backend.ts`

## 2. Store
- [ ] 2.1 Add `appointmentsForPatient(patientID)` passthrough to the store

## 3. UI
- [ ] 3.1 Collapsible "Appointment history (N)" card in the patient-file `<aside>`, collapsed by default
- [ ] 3.2 Expanded list: date · time range + status chip (calendar palette) + appointment note; empty state

## 4. Review
- [ ] 4.1 Engineer review (typescript-reviewer); address CRITICAL/HIGH
- [ ] 4.2 Web QA (preview): collapsed by default; expand lists newest-first w/ status+note; empty state

## 5. Verify + ship
- [ ] 5.1 `npm test` green; `npm run build` + `eslint` + `tsc` clean
- [ ] 5.2 Update `web-port-roadmap` memory (appointment-history shipped; merge-reassign gap flagged)
- [ ] 5.3 `/create-pr`

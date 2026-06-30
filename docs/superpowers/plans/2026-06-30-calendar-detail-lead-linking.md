# Appointment Detail: Patient Link + New-Lead → Create-Patient — Plan

Design: `docs/superpowers/specs/2026-06-30-calendar-detail-lead-linking-design.md`

## 1. Domain (TDD)
- [x] 1.1 Failing tests then green: `appointment-lead.test.ts` — `calendarName`, `isLeadAppointment`, `leadName`, `draftFromLead`, `linkAppointmentPatient` (stamp id+name, owner guard, missing appt/patient)
- [x] 1.2 Implement helpers + `linkAppointmentPatient` in `backend.ts`

## 2. Store + live
- [x] 2.1 `store.linkAppointmentPatient(apptId, patientId, identity)` via `applyAndMirror`
- [x] 2.2 `mirrorLinkAppointmentPatient(id, patientId)` (callable `linkAppointmentPatient` — deferred backend; demo-complete)

## 3. Components
- [x] 3.1 `PatientForm` optional `onCreated?(id)` — called after `createPatient`, before navigate; existing callers unchanged
- [x] 3.2 `DayView` detail patient row: existing patient → link to `/app/patients/[id]`
- [x] 3.3 lead → "Create patient from lead" (gated on `canCreatePatient`) → inline `PatientForm` prefilled via `draftFromLead`, `onCreated` links the appointment
- [x] 3.4 blocked time → plain label, no action

## 4. Review
- [ ] 4.1 Engineer review (typescript-reviewer); address CRITICAL/HIGH
- [x] 4.2 Web QA (preview): existing-patient row → `/app/patients/p-2` ✓; lead → create → linked, block now "Jordan Lee" + row links to new patient (no longer a lead) ✓; block has no action ✓ — no console errors

## 5. Verify + ship
- [ ] 5.1 `npm test` green; `npm run build` + `eslint` + `tsc` clean
- [ ] 5.2 Update `web-port-roadmap` memory (detail patient-link + lead→create shipped; `linkAppointmentPatient` callable + structured lead fields deferred)
- [ ] 5.3 `/create-pr`

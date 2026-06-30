# Appointment Detail: Patient Link + New-Lead → Create-Patient — Plan

Design: `docs/superpowers/specs/2026-06-30-calendar-detail-lead-linking-design.md`

## 1. Domain (TDD)
- [ ] 1.1 Failing tests then green: `appointment-lead.test.ts` — `calendarName`, `isLeadAppointment`, `leadName`, `draftFromLead`, `linkAppointmentPatient` (stamp id+name, owner guard, missing appt/patient)
- [ ] 1.2 Implement helpers + `linkAppointmentPatient` in `backend.ts`

## 2. Store + live
- [ ] 2.1 `store.linkAppointmentPatient(apptId, patientId, identity)` via `applyAndMirror`
- [ ] 2.2 `mirrorLinkAppointmentPatient(id, patientId)` (callable `linkAppointmentPatient` — deferred backend; demo-complete)

## 3. Components
- [ ] 3.1 `PatientForm` optional `onCreated?(id)` — called after `createPatient`, before navigate; existing callers unchanged
- [ ] 3.2 `DayView` detail patient row: existing patient → link to `/app/patients/[id]`
- [ ] 3.3 lead → "Create patient from lead" (gated on `canCreatePatient`) → inline `PatientForm` prefilled via `draftFromLead`, `onCreated` links the appointment
- [ ] 3.4 blocked time → plain label, no action

## 4. Review
- [ ] 4.1 Engineer review (typescript-reviewer); address CRITICAL/HIGH
- [ ] 4.2 Web QA (preview): existing-patient row links to file; lead → create → links + lands on file (no longer a lead); block has no action

## 5. Verify + ship
- [ ] 5.1 `npm test` green; `npm run build` + `eslint` + `tsc` clean
- [ ] 5.2 Update `web-port-roadmap` memory (detail patient-link + lead→create shipped; `linkAppointmentPatient` callable + structured lead fields deferred)
- [ ] 5.3 `/create-pr`

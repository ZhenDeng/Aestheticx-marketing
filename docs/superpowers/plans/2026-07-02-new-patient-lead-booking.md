# New-patient-lead booking — plan

Design: `docs/superpowers/specs/2026-07-02-new-patient-lead-booking-design.md`
Branch: `feat/new-patient-lead-booking`

## Tasks

- [ ] 1. Model: `AppointmentLead` in `types.ts` + `lead?` on `Appointment`
- [ ] 2. Pure backend (test-first, `appointment-lead.test.ts` / `adhoc-auth.test.ts`):
  - [ ] structured `isLeadAppointment` / `leadName` / `draftFromLead` (ISO dob parse, legacy fallback)
  - [ ] `bookTreatmentAppointment` accepts `lead` (patientID | lead | neither=block)
  - [ ] `bookAuthSlot` accepts `lead` (patientID XOR lead, else `validationFailed`)
  - [ ] `requestAdHocAuth` accepts `lead` (patientID XOR lead); patientID/patientName now optional
  - [ ] `linkAppointmentPatient` clears `lead`
  - [ ] seed: Jordan Lee → structured lead
- [ ] 3. Live parity: `mapAppointment` reads `lead` (test), mirrors send `lead`/`patientId:null`,
      store live branches pass `lead` through
- [ ] 4. Calendar UI: New-appointment "New patient" mode (5-field grid, name required);
      chips/detail resolve lead name + "new patient" annotation; detail prefill from structured lead
- [ ] 5. Availability UI: BookConsult slot-booking + ad-hoc panels get "New patient" toggle
- [ ] 6. Verify: full vitest + `next build` green; engineer review; fix findings
- [ ] 7. Docs/memory sync + PR

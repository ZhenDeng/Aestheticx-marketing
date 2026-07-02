# New-patient-lead booking — plan

Design: `docs/superpowers/specs/2026-07-02-new-patient-lead-booking-design.md`
Branch: `feat/new-patient-lead-booking`

## Tasks

- [x] 1. Model: `AppointmentLead` in `types.ts` + `lead?` on `Appointment`
- [x] 2. Pure backend (test-first, `appointment-lead.test.ts` / `adhoc-auth.test.ts`):
  - [x] structured `isLeadAppointment` / `leadName` / `draftFromLead` (ISO dob parse, legacy fallback)
  - [x] `bookTreatmentAppointment` accepts `lead` (patientID | lead | neither=block)
  - [x] `bookAuthSlot` accepts `lead` (patientID XOR lead, else `validationFailed`)
  - [x] `requestAdHocAuth` accepts `lead` (patientID XOR lead); patientID/patientName now optional
  - [x] `linkAppointmentPatient` clears `lead`
  - [x] seed: Jordan Lee → structured lead
  - [x] `appointmentTitle` display helper (lead annotated → stored name → placeholder), used by
        calendar chips + bookings inbox
- [x] 3. Live parity: `mapAppointment` reads `lead` (test), mirrors send `lead`/`patientId:null`,
      store live branches pass `lead` through
- [x] 4. Calendar UI: New-appointment "New patient" mode (5-field grid, name required);
      chips/detail resolve lead name + "new patient" annotation; detail prefill from structured lead
- [x] 5. Availability UI: BookConsult slot-booking + ad-hoc panels get "New patient" toggle
- [x] 6. Verify: full vitest (308) + tsc + `next build` green; typescript-reviewer approved
      (no CRITICAL/HIGH; prefer-const nit fixed; permissive mapLead kept deliberately — a
      no-name live lead must render "New patient", not blocked time)
- [ ] 7. Docs/memory sync + PR

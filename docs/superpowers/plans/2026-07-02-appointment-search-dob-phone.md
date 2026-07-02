# Add-appointment patient search by DOB/phone — plan

Design: `docs/superpowers/specs/2026-07-02-appointment-search-dob-phone-design.md`
Branch: `feat/appointment-search-dob-phone`

## Tasks

- [ ] 1. Characterization tests (`backend.test.ts`): `classifySearch` table; `searchPatients`
      phone arm (formatted/unformatted digit-normalised exact match, non-match); dateOfBirth arm
      (exact d/m/y, malformed → empty); visibility scoping on both arms
- [ ] 2. UI: "Search by name, DOB (dd/mm/yyyy), or phone" placeholder in calendar
      `NewAppointmentForm` + BookConsult slot + ad-hoc panels
- [ ] 3. Verify: vitest + tsc + build green; browser check of DOB/phone search in the
      add-appointment flow; engineer review
- [ ] 4. Docs/memory sync + PR

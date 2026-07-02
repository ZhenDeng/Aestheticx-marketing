# Add-appointment patient search by DOB/phone — plan

Design: `docs/superpowers/specs/2026-07-02-appointment-search-dob-phone-design.md`
Branch: `feat/appointment-search-dob-phone`

## Tasks

- [x] 1. Characterization tests (`backend.test.ts`): `classifySearch` table; `searchPatients`
      phone arm (formatted/unformatted digit-normalised exact match, non-match); dateOfBirth arm
      (exact d/m/y, malformed → empty); visibility scoping on both arms
- [x] 2. UI: "Search by name, DOB (dd/mm/yyyy), or phone" placeholder in calendar
      `NewAppointmentForm` + BookConsult slot + ad-hoc panels
- [x] 3. Verify: vitest (317) + tsc + build green; browser-checked DOB `17/01/1979` and phone
      spaced/unspaced/partial in the add-appointment flow (Grace Huang matches; partial doesn't);
      engineer review below
- [x] 4. Docs/memory sync + PR — https://github.com/ZhenDeng/Aestheticx-marketing/pull/41

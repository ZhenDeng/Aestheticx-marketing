# Add-appointment patient search by DOB/phone — design

**Date:** 2026-07-02 · **Spec source:** `~/Documents/AestheticX/openspec/specs/appointments/spec.md`
(requirement: *Add-appointment date selection and patient search* — "a patient search that matches
existing patient files by name, by date of birth entered as `dd/mm/yyyy`, or by phone number").

## Gap analysis (what's actually missing)

The matching engine **already exists and is already wired in**: `classifySearch` +
`searchPatients` (`src/lib/demo/backend.ts`, ported with patient-records) classify a query as
name / dateOfBirth (contains `/` + digits) / phone (digits, spaces, `+` only) and every booking
search box (calendar New-appointment, BookConsult slot + ad-hoc panels) calls
`store.searchPatients`. So searching `02/07/1990` or `0400 111 222` in the add-appointment flow
works today.

Two real gaps:

1. **No test coverage.** `backend.test.ts` covers only the name and blank-query arms.
   The dateOfBirth and phone arms of `searchPatients`, and `classifySearch` itself, have zero
   unit tests — the spec scenarios (search by phone, search by DOB) are unverified.
2. **No discoverability.** The patients page placeholder documents the syntax
   ("Search by name, date of birth (dd/mm/yyyy), or phone") but the three booking search boxes
   say only "Search patient…", so the capability is invisible exactly where the appointments
   spec requires it.

## Change

- **Tests** (characterization — the behaviour exists, the coverage doesn't):
  `classifySearch` classification table (dd/mm/yyyy → dateOfBirth; digits/spaces/`+` → phone;
  anything else → name); `searchPatients` phone arm matches digit-normalised exact numbers
  (formatted query vs stored, unformatted vs formatted); dateOfBirth arm exact d/m/y match,
  malformed date → no results; both respect the visibility scope.
- **UI**: the three booking search boxes get the patients-page placeholder wording
  ("Search by name, DOB (dd/mm/yyyy), or phone") — calendar `NewAppointmentForm`,
  BookConsult slot panel, BookConsult ad-hoc panel.

## Deliberately unchanged (iOS parity)

- Phone match stays **exact** on the full digit string (both sides digit-stripped) — the ported
  iOS behaviour; neither spec asks for partial/prefix matching.
- No international-format normalisation (`+61 400…` won't match a stored `0400…`) — same
  limitation as the source implementation; noted for a future increment if the spec grows one.

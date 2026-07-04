# Scheduled ad-hoc auth requests — plan

Design: `docs/superpowers/specs/2026-07-04-adhoc-auth-scheduled-design.md`
Branch: `feat/adhoc-auth-scheduled`

## Tasks

- [x] 1. `isPastSlot(dateISO, minute, nowMs)` in `backend.ts` (test-first in
      `adhoc-auth.test.ts`): UTC-frame past/future/today-boundary cases
- [x] 2. Ad-hoc card on `/app/availability`: "When" radio (Now | Pick a time), date + time
      inputs, past-guard disable + message, payload passes chosen dateISO/minute, success
      copy includes the scheduled slot
- [x] 3. Verify: vitest (355) + tsc + `next build` green; browser-checked as nurse Sarah with
      a temporary always-accept seed (reverted): past date disables the patient buttons with
      the guard message, future 2026-06-27 09:30 request confirms "Sent an ad-hoc request for
      Claire Donovan — 2026-06-27 at 09:30.", plain "Now" request still works; no console
      errors
- [ ] 4. Engineer review; fix findings
- [ ] 5. Docs/memory sync + PR

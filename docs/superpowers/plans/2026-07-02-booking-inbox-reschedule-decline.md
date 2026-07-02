# Booking-inbox reschedule/decline — plan

Design: `docs/superpowers/specs/2026-07-02-booking-inbox-reschedule-decline-design.md`
Branch: `feat/booking-inbox-reschedule-decline`

## Tasks

- [ ] 1. Tests: confirm/decline remove a booking from `pendingBookings`; reschedule keeps it
      pending at the new date/time (re-sorted); unavailable reschedule throws unchanged
- [ ] 2. UI (`/app/bookings`): per-row Decline (cancelled) + Reschedule expander
      (date/time/duration, Apply/Close, unavailable-error message)
- [ ] 3. Verify: vitest + tsc + build; browser check (decline removes row, reschedule moves
      row + stays pending, confirm still works); engineer review
- [ ] 4. Docs/memory sync + PR

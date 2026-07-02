# Booking-inbox reschedule/decline — plan

Design: `docs/superpowers/specs/2026-07-02-booking-inbox-reschedule-decline-design.md`
Branch: `feat/booking-inbox-reschedule-decline`

## Tasks

- [x] 1. Tests: confirm/decline remove a booking from `pendingBookings`; reschedule keeps it
      pending at the new date/time (re-sorted); unavailable reschedule throws unchanged
- [x] 2. UI (`/app/bookings`): per-row Decline (cancelled) + Reschedule expander
      (date/time/duration, Apply/Close, unavailable-error message)
- [x] 3. Verify: vitest (322) + tsc + build green; browser-checked (Sunday reschedule rejected
      with treatment-hours message + row unchanged; valid reschedule moved the row to
      2026-07-09 11:30 still pending; decline emptied the inbox); engineer review found one
      HIGH (confirm/decline BackendError thrown inside the setState updater → render-phase
      crash on an already-actioned race) — fixed in 257d5cc: store eager-validates both
      (rescheduleAppointment's existing pattern) + PendingRow catches with an inline
      "already actioned elsewhere" row error; re-verified in browser (confirm empties inbox,
      no console errors), 322 tests green. Re-review then flagged the knock-on (calendar's
      four unguarded Confirm/Complete/No-show/Cancel now throw synchronously in onClick) —
      fixed in 7f95e98 with the same act() guard on the existing scheduleError line
      (onDone only on success); reviewer confirmed zero unguarded call sites remain → Approve
- [ ] 4. Docs/memory sync + PR

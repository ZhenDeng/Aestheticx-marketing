# Appointment detail as a modal — design

**Date:** 2026-07-05 · **Request:** "make it a modal instead of showing booking details
under the calendar."

## Problem

Clicking an appointment in the calendar's day view renders `AppointmentDetail` (title,
status, contact line, create-from-lead, reschedule/status actions) inline *below* the
timeline — off-screen on a busy day, and easy to miss that anything appeared.

## Change

`AppointmentDetail` (calendar/page.tsx) renders in a centred modal overlay instead,
using the repo's one existing dialog pattern (`DirectionDialog`): `role="dialog"
aria-modal` fixed full-screen scrim (`color-mix` ink 45%), centred `max-w-lg
max-h-[85vh] overflow-y-auto` card. Additions over the inline version:

- Header row gains a **Close** button (DirectionDialog's "Done" pattern).
- Clicking the scrim closes (card clicks `stopPropagation`); **Escape** closes
  (keydown listener in an effect — event-driven, no setState-in-effect).
- All inner content and behaviour is unchanged: actions still close via the existing
  `onDone` (which clears `selectedId`), create-from-lead, reschedule, race-guarded
  status buttons.

No model/store changes. The `PendingBookings` section above the calendar is untouched.

## Testing

No new pure logic — gate is the full suite/build/lint plus live preview QA: click an
appointment → modal over the calendar with details + actions; scrim click, Close, and
Escape all dismiss; an action dismisses and applies.

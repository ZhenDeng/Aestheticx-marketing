# Booking-inbox reschedule/decline — design

**Date:** 2026-07-02 · **Spec source:** `~/Documents/AestheticX/openspec/specs/patient-self-booking/spec.md`
(requirement: *Clinician sees and confirms pending bookings in a requests inbox* — "From that
inbox the clinician SHALL be able to open a pending booking and confirm it (**and may also
reschedule or decline it**). Once a booking is confirmed or declined it SHALL leave the pending
inbox.")

## Problem

The `/app/bookings` pending inbox (PR #21) offers only **Confirm**. A clinician cannot decline a
booking they don't want (it lingers, and in live mode keeps consuming the per-owner-per-day
unconfirmed public-booking cap) and cannot move a booking to a workable time without leaving the
inbox for the calendar.

## What already exists (no new domain code, no backend PR)

- `pendingBookings(state, ownerID)` — every awaiting-confirmation booking across all dates,
  earliest first (already spec-compliant).
- **Decline** = `markAppointment(id, "cancelled", identity)` — existing pure mutator + deployed
  `markAppointment` callable. Cancelling removes it from `pendingBookings` (leaves the inbox) and,
  live, frees cap capacity (the server counts `status === 'awaitingConfirmation'` only).
- **Reschedule** = `rescheduleAppointment(id, dateISO, startMinute, durationMinutes, identity)` —
  existing pure mutator + deployed callable; honours a changed `dateISO`, gates treatment
  availability (`BackendError("unavailable")`), and **keeps `awaitingConfirmation`** — a
  rescheduled booking stays in the inbox until confirmed or declined, matching the spec (only
  confirm/decline remove it).

## Change

**UI only** (`src/app/app/bookings/page.tsx`) + spec-anchored tests.

Each pending row's Confirm button gains two siblings, mirroring the calendar detail's action
idiom (`AppointmentActions`):

- **Decline** — rose-coloured text button; `markAppointment(id, "cancelled")`; row disappears.
- **Reschedule** — soft button toggling an inline expander under the row with a date input
  (defaults to the booking's date — inbox rows span dates, so unlike the calendar detail the
  date is editable), time input, duration select (15/30/45/60 preserving the current length as
  default), and Apply/Close. Apply calls `rescheduleAppointment`; `unavailable` maps to the
  existing "outside your treatment hours" message; the row stays pending with the new time.

State: one `openId` (single expander at a time) + per-page `actionError`. Errors clear on the
next successful action.

## Tests (pure, `booking.test.ts` or wherever pendingBookings is covered)

- Confirmed booking leaves `pendingBookings`; declined (cancelled) booking leaves it.
- Rescheduling a pending booking keeps it in `pendingBookings` (still awaiting) with the new
  date/time, and the earliest-first ordering re-sorts.
- Reschedule to an unavailable time throws and the booking is unchanged.

## Out of scope

Public booking surface itself, availability computation for self-booking, notifications to the
patient about decline/reschedule (spec's booking-notification requirement is iOS push, deferred),
Google-calendar external-busy checks.

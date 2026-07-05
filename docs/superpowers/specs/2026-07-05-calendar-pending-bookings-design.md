# Pending bookings on the calendar + client notifications — design

**Date:** 2026-07-05 · **Request:** move pending booking requests to the calendar with
approve/reschedule/reject there; show DOB, phone and email in the calendar; notify the
client on approve/reschedule/reject "by email or phone message, whichever is cheaper".

## Channel decision: email

Email wins the "whichever is cheaper" test outright: the platform already runs a deployed
mail pipeline (`mailOutbox` → Resend — effectively free per message, already used for
welcome/reset/aftercare mail), while SMS would require a new paid provider (~AU 5–8¢ per
message plus integration). Documented here so the trade-off is on record; an SMS channel
can be layered later behind the same notification point if ever wanted.

## Web changes (`Aestheticx-marketing`)

- **Pending requests move to `/app/calendar`.** The inbox list (confirm / reschedule /
  decline rows, currently on `/app/bookings`) is extracted into a shared
  `src/components/app/PendingBookings.tsx` and rendered as a section at the top of the
  calendar page. The rows keep their existing behaviours (cross-date, eager-validated
  race handling, treatment-hours error). `/app/bookings` keeps the booking link + QR
  (its remaining purpose) with a one-line pointer to the calendar.
- **Client contact details.** New pure `appointmentContact(appt, patient?)` in
  `backend.ts`: resolves DOB / phone / email from the structured lead (PR #40 fields,
  ISO dob → d/m/yyyy) or, for linked appointments, from the patient record
  (`dateOfBirth` parts → d/m/yyyy). Rendered as a `micro` contact line on each pending
  row and in the calendar `AppointmentDetail` (day view), so approvers see who they are
  confirming without opening the patient file. Absent fields are simply omitted.

## Backend changes (`AestheticX/backend`)

- New pure `bookingNotify.ts`: `clientEmailFor(appt, patientEmail?)` (lead email first,
  else the linked patient's email, trimmed, null when neither) and
  `bookingEmail(action, {name, dateISO, startMinute, endMinute})` →
  `{subject, body}` for `confirmed` / `rescheduled` / `cancelled` (AU d/m/yyyy dates,
  HH:MM times, client-facing plain text).
- Wiring in `appointmentsFn.ts`: after a successful `confirmAppointment`,
  `rescheduleAppointment`, or `markAppointment(status === "cancelled")`, resolve the
  recipient (appt lead email, else `patients/{patientId}.email`) and queue a
  `mailOutbox` doc (same shape as `queueEmail` in index.ts). Notification failures are
  caught and logged — they never fail the booking action. `completed`/`noShow` send
  nothing. iOS gets the same behaviour for free (same callables).

## Out of scope

SMS (decision above); push notifications to clients (no client app); removing the
Bookings nav tab (the link/QR sharing surface stays there).

## Testing

- Backend: unit tests for `clientEmailFor` precedence/null and `bookingEmail` wording
  per action; suite + build green; deploy `confirmAppointment`, `rescheduleAppointment`,
  `markAppointment`.
- Web: unit tests for `appointmentContact` (lead full/partial, patient fallback, blank
  → omitted); suite/build/lint green; live QA: pending section renders on the calendar
  with contact line; bookings page shows the pointer.

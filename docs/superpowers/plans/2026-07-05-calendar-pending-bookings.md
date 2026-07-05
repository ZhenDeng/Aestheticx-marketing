# Pending bookings on the calendar + client notifications — implementation plan

Spec: `docs/superpowers/specs/2026-07-05-calendar-pending-bookings-design.md`
Branches: web `feat/calendar-pending-bookings` · backend `feat/functions-booking-notify`

## Tasks

### Backend (AestheticX PR #51 — callables DEPLOYED to australia-southeast1)
- [x] 1.1 Tests first: `bookingNotify.test.ts` — recipient precedence (lead → patient →
      null, blank handling) + per-action subject/wording + generic greeting (7 tests).
- [x] 1.2 `bookingNotify.ts` pure module (channel decision — email over SMS — documented).
- [x] 1.3 `notifyBookingClient` wired after the tx in `confirmAppointment`,
      `rescheduleAppointment` (doc read post-move → new time), `markAppointment`
      (cancelled only); best-effort, never fails the action. Suite 173/173, build clean.
- [x] 1.4 Deployed all three callables (verified via functions:list).

### Web
- [x] 2.1 Tests first: `appointment-contact.test.ts` — lead full/partial, patient
      fallback, per-field lead-wins merge, blocked time → {} (5 tests).
- [x] 2.2 `appointmentContact` in `backend.ts` (d/m/yyyy DOB, absent fields omitted).
- [x] 2.3 `PendingBookings.tsx` shared component (inbox rows moved from /app/bookings;
      Confirm relabelled Approve; contact line added); calendar renders it above the
      header; bookings page keeps link/QR + pointer; `AppointmentDetail` contact line.
- [x] 2.4 Suite 503/503 (5 new), build + lint clean.

### QA (live, production infra)
- [x] 3.1 Seeded a QA pending booking (public-booking doc shape) for the test doctor →
      calendar showed the section with "DOB 17/4/1992 · 0400 777 666 · ax.qa.lead…" and
      Approve/Reschedule/Decline → Approve → appointment `confirmed` AND the deployed
      hook queued "Your booking is confirmed / Hi QA Lead," in `mailOutbox` (delivery
      `failed` only because example.com is a reserved domain — the pipeline attempted
      the send). QA appointment + mail docs deleted; prod clean.

## Review dispositions (2026-07-05)

Verdict: Warning → resolved. Web commit reviewed clean (no regressions in the moved
inbox, correct PII scoping — staff-only auth surface, less PII on /app/bookings than
before). Backend findings:

- **Fixed (HIGH):** duplicate client emails on retried / re-actioned / racing calls —
  `setAppointmentStatusTx` + `rescheduleTx` are now idempotent (same-status call or
  identical-slot move returns `false` without writing) and every handler gates
  `notifyBookingClient` on the returned change flag. 173 unit + 68 emulator integration
  tests green; callables redeployed.
- **Fixed (MEDIUM, same guard):** "new time" email on a no-op reschedule.
- **Fixed (LOW, same guard):** freshness check bundled into the transaction rather than
  patched separately in the notifier.
- **Noted:** the reviewer again flagged the harness's session reminders/hook warnings in
  shell output as injected content; confirmed benign.

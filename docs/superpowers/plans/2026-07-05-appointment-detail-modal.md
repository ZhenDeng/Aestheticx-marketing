# Appointment detail as a modal — implementation plan

Spec: `docs/superpowers/specs/2026-07-05-appointment-detail-modal-design.md`
Branch: `feat/appointment-detail-modal`

## Tasks

- [x] 1. Convert `AppointmentDetail` (calendar/page.tsx) to a centred modal using the
      `DirectionDialog` pattern (role="dialog" aria-modal, fixed inset-0 color-mix scrim,
      max-w-lg max-h-[85vh] overflow-y-auto card).
- [x] 2. Dismiss paths: Close button in the header, scrim click (card stopPropagation),
      Escape keydown listener (useEffect, cleaned up). Inner content/behaviour unchanged;
      actions still dismiss via the existing `onDone`.
- [x] 3. Verify: suite 503/503, `tsc`/eslint/build clean.
- [x] 4. Live QA on production infra (seeded a confirmed lead appointment for the test
      doctor): tap the chip → modal over the calendar with the contact line
      ("DOB 20/5/1990 · 0400 555 111 · …") + Close/Create-from-lead/Reschedule/Complete/
      No-show/Cancel; Escape, scrim click, and Close all dismiss; reopen works.
      Screenshot captured; QA appointment deleted, prod clean.
- [x] 5. Engineer review — dispositions below.

## Review dispositions (2026-07-05)

Verdict: **Approve** — no CRITICAL/HIGH. JSX tag balance, scrim-vs-card click
propagation (no double-fire), and the Escape effect's cleanup + dependency are all
confirmed correct.

- **Fixed (MEDIUM, cheap subset):** added initial focus (Close button on open) and
  body-scroll lock while the modal is up — both restore on unmount, folded into the
  existing effect. Re-QA'd live: focus lands on Close, `body.overflow` is `hidden`
  while open and restored on Escape.
- **Deferred (MEDIUM):** a full Tab focus-trap. Same gap exists in the reference
  `DirectionDialog`, so it belongs in a shared modal abstraction applied to both
  rather than diverging one modal here — follow-up ticket, not a regression from this
  change.
- **Noted:** the reviewer again flagged the harness's injected session reminders in
  tool output; confirmed benign.

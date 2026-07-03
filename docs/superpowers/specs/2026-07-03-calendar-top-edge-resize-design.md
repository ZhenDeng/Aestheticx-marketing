# Calendar top-edge resize (move start) — design

**Date:** 2026-07-03 · **Spec source:** `~/Documents/AestheticX/openspec/specs/appointments/spec.md`
(requirement: *Treatment appointments* — "the time editable by dragging on the calendar";
roadmap gap: "top-edge resize (move-start)").

## Problem

The day and week timelines support body-drag (move), bottom-edge resize (change end), and
tap-empty-slot — but not dragging an appointment's **top edge** to move its start while the
end stays put. Shortening the front of an appointment currently requires the detail panel's
time/duration inputs.

## Change (web-only, pure-helper + two blocks)

- **`calendar.ts`**: `dragTopMinute(origStart, deltaPx, pxPerMin, step, endMin, minDuration, winStart)`
  — the exact mirror of `dragEndMinute`: new start snapped to the step grid, clamped to
  `[winStart, endMin − minDuration]`; the end never moves. `endMin` is always on the step grid
  (bookings only move in step increments), so `endMin − minDuration` stays on-grid.
- **`TimelineBlock` (day) + `WeekBlock` (week)**: a top handle (`absolute inset-x-0 top-0 h-2`,
  ns-resize cursor) mirroring the existing bottom handle — same pointer-capture /
  stopPropagation / pointercancel discipline, its own `topDy` state + ref. Preview runs the
  delta through the same clamp used at commit (`top` and `height` both shift so the bottom edge
  stays visually fixed). Commit calls the existing
  `rescheduleAppointment(id, dateISO, newStart, endMinute − newStart, me)`; `unavailable` maps
  to the existing treatment-hours message.

No model, store, mirror, or backend changes — `rescheduleAppointment` already takes an
arbitrary start + duration.

## Tests

`calendar-dates.test.ts` (where the other drag helpers are covered): snap-to-step, clamp at
`winStart`, clamp at `endMin − minDuration` (can't invert or collapse below minimum), no-op
delta returns the original start, off-grid raw values round to the nearest step.

## Out of scope

Auto-scroll while dragging near the window edges, month-view drag (separate roadmap items).

# Calendar auto-scroll while dragging + month-view drag — design

**Date:** 2026-07-03 · **Spec source:** `~/Documents/AestheticX/openspec/specs/appointments/spec.md`
(requirement: *Treatment appointments* — "the time editable by dragging on the calendar";
roadmap gaps: "auto-scroll while dragging near the window edges" and "month-view drag").

## Problem

1. **Auto-scroll**: the day/week rail is 720px tall (07:00–19:00 at 1px/min) and the **window**
   scrolls (no inner scroll container). Dragging an appointment toward a time outside the
   visible viewport dead-ends at the screen edge — the user must drop, scroll, and re-drag.
2. **Month drag**: month-view chips are inert; moving an appointment to another day means
   leaving the month view. Day and week views already drag; month is the gap.

## Change 1 — edge auto-scroll on the move drag (day + week)

- **Pure helper** `edgeScrollVelocity(clientY, viewportHeight, edge = 48, maxSpeed = 14)` in
  `calendar.ts` (test-first): 0 outside the top/bottom edge zones; inside a zone, ramps
  linearly from 0 at the zone's inner boundary to ±maxSpeed at the viewport edge (clamped
  beyond it, e.g. pointer captured above the viewport). Negative = scroll up.
- **Gesture integration** (body-move drag only — the long-distance gesture; edge resizes are
  short-range and stay as-is): each block's drag ref additionally records `startScrollY` and
  the latest `clientY`. While a move drag is active, a `requestAnimationFrame` loop reads the
  ref, applies `window.scrollBy(0, v)`, and recomputes the drag delta as
  `dy = (clientY − startY) + (window.scrollY − startScrollY)` — scrolling changes the drop
  time without the pointer moving, so the scroll delta must join the pointer delta in both the
  preview state and the commit. `onPointerMove` uses the same compensated formula (a no-op
  until the first scroll). The loop starts when the drag passes the move threshold and stops
  on up/cancel; effect cleanup also stops it (unmount safety).

## Change 2 — month-view chip drag to another day

- Month day-cells gain `data-iso`; chips (only `canReschedule` ones) become pointer-gesture
  targets: capture + `DRAG_THRESHOLD`, translate-transform preview while dragging (zIndex
  lifted), drop target resolved at pointer-up via
  `document.elementFromPoint(x, y)?.closest('[data-iso]')`. A drop on a different day calls
  the existing `rescheduleAppointment(id, targetISO, same start, same duration)` — time
  unchanged, date moves (out-of-month grid cells carry a valid iso too, so dragging into the
  next month's spill row works).
- **Tap keeps opening the day**: the chip doesn't stopPropagation on pointerdown; if the
  gesture never crosses the threshold, the native click bubbles to the cell button (openDay).
  After a real drag, the chip's `onClick` capture suppresses that click.
- **Errors** (`unavailable` / failure): month cells are too small for inline messages — the
  chip reports through an `onError` callback and `MonthView` shows one message line above the
  grid, cleared on the next successful drop.

No model, store, mirror, or backend changes — `rescheduleAppointment` already handles a
changed `dateISO` (week-view cross-day drag uses it today).

## Tests

`calendar-layout.test.ts`: `edgeScrollVelocity` — zero in the middle, ramp within the top and
bottom zones, max at the edges, clamped outside the viewport, custom edge/speed parameters.
(The rAF loop and elementFromPoint drop are DOM-bound — covered by browser verification.)

## Out of scope

Auto-scroll for the edge-resize gestures (short-range), horizontal auto-scroll (week grid fits
the viewport), month-to-month drag across a grid boundary (drop on the visible spill cells
covers adjacent-month moves).

# Calendar auto-scroll + month-view drag — plan

Design: `docs/superpowers/specs/2026-07-03-calendar-autoscroll-month-drag-design.md`
Branch: `feat/calendar-autoscroll-month-drag`

## Tasks

- [ ] 1. `edgeScrollVelocity` in `calendar.ts` (test-first in `calendar-layout.test.ts`):
      zero mid-viewport, linear ramp in both zones, max/clamp at + beyond the edges,
      custom parameters
- [ ] 2. Day `TimelineBlock` + week `WeekBlock` move drag: rAF auto-scroll loop while
      dragging + scroll-compensated dy (preview + commit); stops on up/cancel/unmount
- [ ] 3. Month view: `data-iso` cells; draggable chips (threshold, translate preview,
      elementFromPoint drop, click suppression after drag); reschedule to target day;
      error line above the grid
- [ ] 4. Verify: vitest + tsc + build; browser check (auto-scroll both directions in day +
      week, month chip drag to another day + spill cell, tap still opens day, unavailable
      error); engineer review loop
- [ ] 5. Docs/memory sync + PR

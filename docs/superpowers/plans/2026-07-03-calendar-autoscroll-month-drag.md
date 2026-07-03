# Calendar auto-scroll + month-view drag — plan

Design: `docs/superpowers/specs/2026-07-03-calendar-autoscroll-month-drag-design.md`
Branch: `feat/calendar-autoscroll-month-drag`

## Tasks

- [x] 1. `edgeScrollVelocity` in `calendar.ts` (test-first in `calendar-layout.test.ts`):
      zero mid-viewport, linear ramp in both zones, max/clamp at + beyond the edges,
      custom parameters
- [x] 2. Day `TimelineBlock` + week `WeekBlock` move drag: rAF auto-scroll loop while
      dragging + scroll-compensated dy (preview + commit); stops on up/cancel/unmount
- [x] 3. Month view: `data-iso` cells; draggable chips (threshold, translate preview,
      elementFromPoint drop, click suppression after drag); reschedule to target day;
      error line above the grid
- [x] 4. Verify: vitest (339) + tsc + `next build` green; browser-checked — day-view edge
      hold auto-scrolled 124px and committed the compensated time (09:00 → 17:15 from a
      ~430px pointer travel), month chip dragged 2026-07-03 → 2026-06-29 staying in month
      view (post-drag click suppressed), plain tap opened the day showing the moved booking
      at its unchanged 10:00 time; no console errors; engineer review below
- [ ] 5. Docs/memory sync + PR

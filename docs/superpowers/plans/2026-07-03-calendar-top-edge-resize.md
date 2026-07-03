# Calendar top-edge resize — plan

Design: `docs/superpowers/specs/2026-07-03-calendar-top-edge-resize-design.md`
Branch: `feat/calendar-top-edge-resize`

## Tasks

- [x] 1. `dragTopMinute` in `calendar.ts` (test-first in `calendar-layout.test.ts`, where the
      other drag helpers live): snap, clamp to winStart, clamp to endMin − minDuration, no-op,
      off-grid rounding, non-unit px scale
- [x] 2. Day `TimelineBlock`: top handle + preview (top/height shift, bottom edge fixed) +
      commit via rescheduleAppointment; same pointer discipline as the bottom handle
- [x] 3. Week `WeekBlock`: same top handle
- [x] 4. Verify: vitest (334) + tsc + `next build` green; browser-checked — day up-drag
      (09:00→08:35, end pinned), 500px down-drag clamps at end−minimum (10:15–10:30, no
      inversion), week up-drag (10:15→10:00); no console errors; engineer review below
- [x] 5. Docs/memory sync + PR — https://github.com/ZhenDeng/Aestheticx-marketing/pull/44

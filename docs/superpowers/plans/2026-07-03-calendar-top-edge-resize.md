# Calendar top-edge resize — plan

Design: `docs/superpowers/specs/2026-07-03-calendar-top-edge-resize-design.md`
Branch: `feat/calendar-top-edge-resize`

## Tasks

- [ ] 1. `dragTopMinute` in `calendar.ts` (test-first in `calendar-dates.test.ts`):
      snap, clamp to winStart, clamp to endMin − minDuration, no-op, off-grid rounding
- [ ] 2. Day `TimelineBlock`: top handle + preview (top/height shift, bottom edge fixed) +
      commit via rescheduleAppointment; same pointer discipline as the bottom handle
- [ ] 3. Week `WeekBlock`: same top handle
- [ ] 4. Verify: vitest + tsc + build; browser check (drag top edge up/down in day + week,
      snap + clamps + unavailable error); engineer review loop
- [ ] 5. Docs/memory sync + PR

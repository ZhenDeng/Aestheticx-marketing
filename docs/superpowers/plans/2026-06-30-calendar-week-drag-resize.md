# Calendar Week-View Drag + Resize — Plan

Design: `docs/superpowers/specs/2026-06-30-calendar-week-drag-resize-design.md`

## 1. Domain: reschedule day + dayDelta (TDD)
- [ ] 1.1 Update the 3 existing `rescheduleAppointment` tests to the new `(state, id, dateISO, startMinute, durationMinutes, identity)` signature; add a case asserting the day changes
- [ ] 1.2 Add `dateISO` to `backend.rescheduleAppointment` (set it on the moved appt)
- [ ] 1.3 Failing tests then green: `dayDelta` in `calendar-layout.test.ts` (sub-column→0, ±n at multiples, half-column rounding, dayWidth<=0→0)
- [ ] 1.4 Implement `dayDelta` in `calendar.ts`

## 2. Store
- [ ] 2.1 Thread `dateISO` into the `backend.rescheduleAppointment` call in `store.tsx`

## 3. UI: WeekBlock
- [ ] 3.1 `WeekBlock` with pointer move (dx→day via `dayDelta` + measured column width, dy→start via `dragStartMinute`), live translate, commit `rescheduleAppointment(id, days[idx], newStart, duration)`
- [ ] 3.2 Bottom-edge resize handle (`dragEndMinute`, same day; stopPropagation) + pointercancel
- [ ] 3.3 Tap (< threshold) → `openDay`; only awaiting/confirmed draggable; terminal chips stay plain click-to-open; headers unchanged

## 4. Review
- [ ] 4.1 Engineer review (typescript-reviewer); address CRITICAL/HIGH
- [ ] 4.2 Web QA (preview): vertical drag → time same day; horizontal drag → day change; resize → duration; tap → opens day; re-layout after move

## 5. Verify + ship
- [ ] 5.1 `npm test` green; `npm run build` + `eslint` + `tsc` clean
- [ ] 5.2 Update `web-port-roadmap` memory (week drag+resize shipped + reschedule day-fix; top-edge resize/auto-scroll/month-drag deferred)
- [ ] 5.3 `/create-pr`

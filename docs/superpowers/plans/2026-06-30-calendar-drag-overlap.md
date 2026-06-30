# Calendar Drag-to-Reschedule + Side-by-Side Overlap — Plan

Design: `docs/superpowers/specs/2026-06-30-calendar-drag-overlap-design.md`

## 1. Domain: overlap layout (TDD)
- [x] 1.1 Failing tests then green: `layoutDay` in `calendar-layout.test.ts` — no overlap; two overlapping; three mutual (cols:3); chain A∩B,B∩C with col reuse (cols:2); order-independent; adjacent treated as non-overlapping
- [x] 1.2 Implement `layoutDay(appts)` in `src/lib/demo/calendar.ts`

## 2. Domain: drag math (TDD)
- [x] 2.1 Failing tests then green: `dragStartMinute` — snap to step, clamp top/bottom (start+duration ≤ winEnd), zero-delta identity, negative delta
- [x] 2.2 Implement `dragStartMinute(...)` in `src/lib/demo/calendar.ts`

## 3. UI: day timeline with overlap
- [x] 3.1 Add `DayTimeline` (hour rail + positioned blocks); place blocks with `layoutDay` (left=col/cols, width=1/cols, gutter)
- [x] 3.2 Tap a block → select + render existing `AppointmentActions` below; tap empty clears
- [x] 3.3 Keep follow-ups + reminder settings; New-appointment form still works against `selectedISO`

## 4. UI: drag-to-reschedule
- [x] 4.1 Pointer-drag a block (pointerdown/move/up + capture); live translate; commit via `rescheduleAppointment(dragStartMinute(...))`
- [x] 4.2 Movement threshold distinguishes tap (select) from drag (move); enable drag only for awaiting/confirmed
- [x] 4.3 Block-time + status colours preserved on blocks

## 5. UI: week overlap
- [x] 5.1 Apply `layoutDay` per day column in `WeekView` so overlapping chips render side-by-side

## 6. Review
- [ ] 6.1 Engineer review (typescript-reviewer); address CRITICAL/HIGH
- [x] 6.2 Web QA (preview): overlap side-by-side (day + week) ✓; drag moves+persists snapped ✓; tap selects without moving ✓ — no console errors

## 7. Verify + ship
- [ ] 7.1 `npm test` green; `npm run build` + `eslint` + `tsc` clean
- [ ] 7.2 Update `web-port-roadmap` memory (overlap + drag-to-reschedule shipped; resize/cross-day/week-drag still deferred)
- [ ] 7.3 `/create-pr`

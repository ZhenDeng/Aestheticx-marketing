# Calendar Week & Month Views — Plan

Design: `docs/superpowers/specs/2026-06-30-calendar-week-month-design.md`

## 1. Domain: range selector (TDD)
- [x] 1.1 Failing test then green: `appointmentsForOwnerInRange` — inclusive bounds, owner filter, `cancelled` excluded, sorted by `dateISO` then `startMinute` (extend `appointments-ops.test.ts`)
- [x] 1.2 Implement `appointmentsForOwnerInRange` in `backend.ts`

## 2. Domain: pure date helpers (TDD)
- [x] 2.1 Failing tests then green: `calendar-dates.test.ts` covering `addDaysISO`, `weekStartISO`, `weekDaysFor`, `monthGridFor`, `isWeekend`, `monthLabel`, `weekRangeLabel`
- [x] 2.2 Implement `src/lib/demo/calendar.ts` (UTC date math, matches `isoDay`)

## 3. Store passthrough
- [x] 3.1 Add `appointmentsForOwnerInRange(ownerID, startISO, endISO)` to the store interface + impl

## 4. UI: view switch + navigation + day-view generalisation
- [x] 4.1 Add `view` (`day|week|month`) + `selectedISO` state; segmented control; `‹ › Today` navigation + period label
- [x] 4.2 Generalise the day view to read `selectedISO`; pass `selectedISO` into `NewAppointmentForm`
- [x] 4.3 Extract `apptTypeAccent` / `apptColor` shared colour helpers (reused by all views)

## 5. UI: week view
- [x] 5.1 Seven-day timeline: hour rail (07:00–19:00), day column headers with today highlighted
- [x] 5.2 Position chips by start/end; show time+name when tall enough, else colour-only bar
- [x] 5.3 Click a day header → open Day view for that date

## 6. UI: month view
- [x] 6.1 Monday-first grid via `monthGridFor`; up to 3 chips/cell + `+N` overflow
- [x] 6.2 Highlight today number, fill selected day, distinguish weekends, dim out-of-month
- [x] 6.3 Click a day → open Day view for that date

## 7. Review
- [x] 7.1 Engineer review (typescript-reviewer); fixed HIGH (week-chip clamp for pre-window appts) + MEDIUMs (moved `shiftMonthISO` to `calendar.ts`, immutable `byDay`, dedupe + cross-year `weekRangeLabel`, formatted `dayLabel`); +4 tests
- [x] 7.2 Web QA (preview-driven): switch views, week chip positions/colours, month overflow, day navigation, Today reset — verified, no console errors

## 8. Verify + ship
- [ ] 8.1 `npm test` green; `npm run build` clean; `npm run lint` clean
- [ ] 8.2 Update `web-port-roadmap` memory (week/month shipped; note PR #24 closed the Strict-Mode follow-up)
- [ ] 8.3 `/create-pr`

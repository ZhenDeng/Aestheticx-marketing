# Calendar Drag-to-Resize + Tap-Empty-Slot — Plan

Design: `docs/superpowers/specs/2026-06-30-calendar-resize-tapslot-design.md`

## 1. Domain (TDD)
- [ ] 1.1 Failing tests then green: `dragEndMinute` — lengthen/shorten snapped, clamp to winEnd, clamp to startMin+minDuration, zero-delta identity, pxPerMin scale (extend `calendar-layout.test.ts`)
- [ ] 1.2 Failing tests then green: `slotStartMinute` — snap, clamp top/bottom, pxPerMin scale
- [ ] 1.3 Implement `dragEndMinute` + `slotStartMinute` in `src/lib/demo/calendar.ts`

## 2. UI: drag-to-resize
- [ ] 2.1 Add a bottom-edge resize handle to draggable blocks (cursor ns-resize); pointer handlers stopPropagation so it's distinct from body-move
- [ ] 2.2 Live-preview the new height; commit `rescheduleAppointment(start unchanged, new duration)` on pointerup; handle pointercancel
- [ ] 2.3 Resize does not open detail and does not change the start; min duration 15, snap 5, clamp to window

## 3. UI: tap-empty-slot
- [ ] 3.1 `NewAppointmentForm` accepts `initialStart?`/`initialBlock?` (defaults unchanged)
- [ ] 3.2 Clicking empty timeline space opens a chooser popover at the tapped time (New appointment / Block time) via `slotStartMinute`
- [ ] 3.3 Choosing opens the form prefilled to that start (Block pre-sets block-time mode); tapping a block still selects it (never the chooser)

## 4. Review
- [ ] 4.1 Engineer review (typescript-reviewer); address CRITICAL/HIGH
- [ ] 4.2 Web QA (preview): resize changes end+persists, no detail/move; tap empty → chooser → prefilled form; tap block still selects

## 5. Verify + ship
- [ ] 5.1 `npm test` green; `npm run build` + `eslint` + `tsc` clean
- [ ] 5.2 Update `web-port-roadmap` memory (resize + tap-slot shipped; cross-day/week-drag/detail-view still deferred)
- [ ] 5.3 `/create-pr`

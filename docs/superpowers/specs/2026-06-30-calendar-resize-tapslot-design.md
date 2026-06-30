# Calendar Drag-to-Resize + Tap-Empty-Slot — Design

**Goal:** On the day timeline (`/app/calendar`), (1) **drag the bottom edge** of an
appointment to change its end time / duration, and (2) **tap an empty time slot** to choose
"New appointment" or "Block time", opening the booking form prefilled to the tapped time.
Builds on the day timeline + drag-to-move shipped in PR #27.

**Source of truth:**
- `~/Documents/AestheticX/openspec/specs/appointments/spec.md` — *Drag to resize an
  appointment on the day calendar* (bottom-edge handle, snap 5 min, min length, distinct
  from move + tap) and *Tap empty time to add an appointment or block time* (compute start
  from tap position, choose New/Block, prefill the sheet; tapping an existing item opens its
  detail, not the chooser).
- Existing web: `src/app/app/calendar/page.tsx` (`DayTimeline`, `TimelineBlock` with
  body-drag move + tap-select; `NewAppointmentForm`; `WIN_START/WIN_END/PX_PER_MIN/DRAG_STEP`),
  `src/lib/demo/calendar.ts` (`dragStartMinute`), `store.rescheduleAppointment`.

## Model

No model changes. Resize reuses `rescheduleAppointment` (same start, new
`durationMinutes = newEnd - startMinute`). Create reuses `bookTreatmentAppointment`.

## Layers

### Domain (pure — `calendar.ts`, TDD)
- `dragEndMinute(origEnd, deltaPx, pxPerMin, step, startMin, minDuration, winEnd): number`
  — snap `origEnd + deltaPx/pxPerMin` to `step`, then clamp to
  `[startMin + minDuration, winEnd]`. (Resize never moves the start.)
- `slotStartMinute(offsetPx, pxPerMin, step, winStart, winEnd): number` — snap
  `winStart + offsetPx/pxPerMin` to `step`, clamp to `[winStart, winEnd - step]`. Turns a
  tap's y-offset into a start minute.

### UI — `DayTimeline` / `TimelineBlock`
- **Resize handle:** each draggable block (awaiting/confirmed) gets a thin bottom-edge
  handle (`cursor: ns-resize`). Its `pointerdown` **stops propagation** (so it is distinct
  from the body's move-drag) and captures the pointer; `pointermove` previews the new height;
  `pointerup` commits `rescheduleAppointment(id, dateISO, startMinute, dragEndMinute(...) -
  startMinute, me)`. `pointercancel` resets. Snap `DRAG_STEP` (5 min), `MIN_DURATION` 15 min.
  Terminal/awaiting-only rules unchanged (no handle when not reschedulable).
- **Tap empty slot:** clicking empty timeline space (the column itself — grid lines are
  `pointer-events-none`) computes `slotStartMinute(e.nativeEvent.offsetY, …, SLOT_STEP=15)`
  and opens a small **chooser popover** at that y with **New appointment** / **Block time**.
  Choosing opens `NewAppointmentForm` prefilled to that start (Block also pre-sets
  block-time mode, no patient). Clicking a block still opens its detail/selection — never the
  chooser (blocks stop propagation / are separate targets).
- **`NewAppointmentForm`** gains optional `initialStart?: number` and `initialBlock?: boolean`
  (default to the current `10:00` / unchecked when omitted, so the header "New appointment"
  button is unchanged).
- `DayView` owns `chooser` + `slotForm` state; the form is shown when `showNew` (header
  button) **or** `slotForm` (a slot pick) is active; `onDone` clears both.

## Data flow
Demo + live unchanged — resize and create already mirror (reschedule / bookTreatment).

## Error handling
Resize only enabled for awaiting/confirmed (reschedule guard); live failures surface via
`lastSyncError`.

## Testing (TDD)
- **`calendar-layout.test.ts`** (extend) — `dragEndMinute`: lengthen/shorten snapped; clamp
  to `winEnd`; clamp to `startMin + minDuration` (can't invert/zero); zero-delta identity;
  pxPerMin scale. `slotStartMinute`: snap to step; clamp top (`winStart`) and bottom
  (`winEnd - step`); pxPerMin scale.
- **Preview (demo):** drag a block's bottom handle → end time/duration changes & persists;
  resize does not open detail and does not move the start; tap empty space → chooser at that
  time → New/Block opens the form prefilled; tapping a block still selects it.

## Out of scope (deferred)
Cross-day dragging; dragging/resizing in the week view; top-edge resize (move-start);
appointment detail view + new-patient-lead linking; availability windows; auth-slot
publish/book; calendar sync; notifications.

# Calendar Week-View Drag + Resize — Design

**Goal:** Bring the day-timeline interactions to the **week view**: drag a chip to
reschedule it (vertically = new time, **horizontally = new day**) and drag its bottom edge
to resize (end time / duration). Completes the appointments drag story across day + week.

**Source of truth:**
- `~/Documents/AestheticX/openspec/specs/appointments/spec.md` — *Overlapping appointments
  laid out side-by-side* ("Drag-to-reschedule SHALL continue to work for appointments
  rendered in a column") + *Drag to resize* (bottom-edge handle).
- Existing web: `src/app/app/calendar/page.tsx` (`WeekView` chips + `layoutDay` overlap;
  `TimelineBlock` day-drag model; `WIN_START/WIN_END/PX_PER_MIN/DRAG_STEP/MIN_DURATION`),
  `src/lib/demo/calendar.ts` (`dragStartMinute`, `dragEndMinute`),
  `store.rescheduleAppointment(id, dateISO, startMinute, durationMinutes, identity)`.

## Bug fix prerequisite

`backend.rescheduleAppointment` currently **ignores the day** — it keeps `appt.dateISO`,
even though the store already forwards `dateISO` to the live mirror. This is a latent
demo/live parity gap (never surfaced because day-view reschedule stays on the same day).
**Fix:** add `dateISO` to `backend.rescheduleAppointment` and set it on the moved
appointment, so both demo and live can move an appointment to another day.

## Layers

### Domain (pure — TDD)
- `backend.rescheduleAppointment(state, id, dateISO, startMinute, durationMinutes, identity)`
  — now sets `dateISO` too (signature gains `dateISO` after `id`, matching the store order).
- `calendar.ts` `dayDelta(dx, dayWidth): number` — `dayWidth > 0 ? Math.round(dx / dayWidth) : 0`
  (columns of equal width → how many day-columns a horizontal drag crossed). Reuses
  `dragStartMinute` (vertical → start) and `dragEndMinute` (resize).

### Store (`store.tsx`)
- Thread `dateISO` into the reducer call: `backend.rescheduleAppointment(s, id, dateISO, …)`
  (the mirror call already passes `dateISO`).

### UI — `WeekView` chips → `WeekBlock`
Each reschedulable chip (awaiting/confirmed) becomes a `WeekBlock` with pointer gestures
mirroring the day timeline, adapted for the grid:
- **Move:** track `(dx, dy)`; live-translate the chip. On `pointerup`,
  `targetIndex = clamp(dayIndex + dayDelta(dx, columnWidth), 0, 6)` (column width measured
  from the chip's own day-column element — all 7 are equal), `newStart =
  dragStartMinute(start, dy, …)`; commit `rescheduleAppointment(id, days[targetIndex],
  newStart, duration, me)` (preserves duration; may change the day).
- **Resize:** bottom-edge handle (`stopPropagation`, distinct from move/tap) → `dragEndMinute`
  → new duration on the same day. Min 15, snap 5, clamp to window.
- **Tap** (movement < threshold) → `openDay(iso)` (unchanged week behaviour).
- `pointercancel` resets. Only awaiting/confirmed are draggable; others keep the plain
  click-to-open chip. Day column headers still click → `openDay`.

## Data flow
Demo + live both move day + time via `rescheduleAppointment` (reducer now honours `dateISO`;
mirror already did).

## Error handling
Reschedule guard unchanged (terminal appts not draggable → no handlers attached). Live
failures surface via `lastSyncError` + rehydrate.

## Testing (TDD)
- **`appointments-ops.test.ts`** — update the 3 `rescheduleAppointment` calls to the new
  signature; add a case asserting the **day changes** (`dateISO` updated) and start/end move.
- **`calendar-layout.test.ts`** — `dayDelta`: 0 for sub-column dx, ±1/±n at column multiples,
  rounds at half-column, `dayWidth <= 0 → 0`.
- **Preview (demo):** drag a week chip down → time changes same day; drag sideways → moves to
  the adjacent day's column; bottom-handle resize changes duration; a plain click still opens
  the day; columns re-lay-out after a move.

## Out of scope (deferred)
Top-edge resize (move-start); auto-scroll while dragging near the week edges; month-view
drag; availability windows; calendar sync.

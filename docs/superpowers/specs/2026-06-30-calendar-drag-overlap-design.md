# Calendar Drag-to-Reschedule + Side-by-Side Overlap — Design

**Goal:** On `/app/calendar`, (1) lay out overlapping appointments **side-by-side in
columns** so none is obscured, and (2) let a clinician **drag an appointment to a new
time** to reschedule it. Builds on the week/month views shipped in PR #26.

**Source of truth:**
- `~/Documents/AestheticX/openspec/specs/appointments/spec.md` — *Overlapping
  appointments laid out side-by-side* and *Drag to resize an appointment on the day
  calendar* (the **move/reschedule** half of it).
- Existing web: `src/app/app/calendar/page.tsx` (day list + week timeline, `apptColor`/
  `apptTypeAccent`, `WIN_START/WIN_END/PX_PER_MIN`), `src/lib/demo/calendar.ts`,
  `store.rescheduleAppointment(id, dateISO, startMinute, durationMinutes, identity)`
  (already wired demo + live).

## Surface change

The **day view's appointment area becomes a full-width day timeline** (hour rail +
time-positioned blocks), the natural drag surface (matches the iOS day timeline). Tapping
a block selects it and reveals the existing quick-actions (confirm/reschedule/complete/
no-show/cancel) below the timeline. Follow-ups + reminder settings stay unchanged. The
month view is untouched.

## Model

No model changes. Reschedule reuses the existing `rescheduleAppointment` (preserves
duration; moves `startMinute`/`endMinute`).

## Layers

### Domain (pure — `calendar.ts`, TDD)
- `layoutDay(appts): { id: string; col: number; cols: number }[]` — interval-graph column
  assignment. Appointments that overlap in time are grouped into a connected **cluster**;
  within a cluster each gets the first free column (greedy by start time), and every
  appointment in the cluster reports `cols` = the cluster's column count, so siblings share
  equal width. Non-overlapping appointments get `{ col: 0, cols: 1 }`. Input order
  independent (sorts by start, then end).
- `dragStartMinute(origStart, deltaPx, pxPerMin, step, durationMin, winStart, winEnd): number`
  — `round((origStart*pxPerMin + deltaPx) / pxPerMin)` snapped to `step` minutes, then
  clamped so the block stays within `[winStart, winEnd]` (start ≥ winStart, start+duration
  ≤ winEnd). Pure, so the drag math is unit-tested independently of pointer events.

### UI — `/app/calendar`
- **`DayTimeline`** (new): hour rail (`07:00–19:00`, reuses `WIN_START/WIN_END/PX_PER_MIN`)
  + each appointment as an absolutely-positioned block. `layoutDay` gives `left = col/cols`
  and `width = 1/cols` (with a small gutter) so overlapping blocks sit side-by-side.
  - **Drag-to-reschedule:** `onPointerDown` on a block captures the pointer; `pointermove`
    translates the block by the cursor delta (live preview); `pointerup` commits
    `store.rescheduleAppointment(id, dateISO, dragStartMinute(...), duration, me)`. Movement
    under a small threshold (≈4px) counts as a **tap** → select the block (show actions),
    not a drag. Blocked-time and terminal (completed/no-show) appointments are draggable
    too (reschedule guard already allows only awaiting/confirmed — terminal stays put and
    the move is a no-op/blocked; we only enable drag when the status permits reschedule).
  - **Tap** → set `selectedId`; render the existing `AppointmentActions` for it below the
    timeline. Tapping empty space clears selection.
- **`WeekView`** (extend): apply `layoutDay` per day column so overlapping chips render
  side-by-side instead of stacking (fixes the current overlap). No dragging in week this
  increment.
- Shared `apptColor`/`apptTypeAccent` unchanged.

## Data flow
- **Demo & Live:** reschedule already mirrors (`rescheduleAppointment` callable for live;
  pure reducer for demo). Layout is a pure view concern over the hydrated cache.

## Error handling
Reschedule of a terminal appointment throws `BackendError("notActive")` (existing) — so
drag is only enabled for awaiting/confirmed; surfaced via `lastSyncError` if a live mirror
fails.

## Testing (TDD)
- **`calendar-layout.test.ts`** — `layoutDay`: no overlap → all `{0,1}`; two overlapping →
  `{0,2}`+`{1,2}`; three mutually overlapping → `cols:3`; chain A∩B, B∩C, A⊄C → cluster of
  3 but `cols:2` with C reusing column 0; order-independent; adjacent (end == next start)
  treated as non-overlapping.
- **`calendar-layout.test.ts`** — `dragStartMinute`: snaps to step; clamps to window top and
  bottom (start+duration ≤ winEnd); zero delta is identity; negative delta moves earlier.
- **Preview (demo):** book two overlapping treatment appts → both render side-by-side and
  legible; drag one to a new time → it lands snapped and persists; a small click selects and
  shows actions (no accidental move); week view shows overlaps side-by-side.

## Out of scope (deferred — future increments)
Drag-to-**resize** (bottom-edge end-time handle); cross-day dragging; dragging in the week
view; tap-empty-slot to add/block; appointment detail view + new-patient-lead linking;
availability windows; auth-slot publish/book; calendar sync; notifications.

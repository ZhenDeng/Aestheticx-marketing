# Calendar Week & Month Views — Design

**Goal:** Add **week** and **month** calendar views to `/app/calendar`, alongside the
existing today/day list, with date navigation. Read/navigate only — no new drag or
booking interactions. Type/status colours stay consistent with the day view. Demo +
live parity (read-only; appointments already hydrate, so no new callables).

**Source of truth:**
- `~/Documents/AestheticX/openspec/specs/appointments/spec.md` — *Readable week and
  month calendar density*; *Calendar reachable as a main navigation tab* (web already
  has `/app/calendar` as a nav route — satisfied).
- Existing web: `src/app/app/calendar/page.tsx` (day list, colours, `NewAppointmentForm`,
  `AppointmentActions`), `backend.ts` `appointmentsForOwnerOnDay` + `isoDay`.

## Model

No model changes. `Appointment` already carries `dateISO`, `startMinute`, `endMinute`,
`type` (`authSlot | treatment`), `status`, `patientName`.

## Layers

### Domain (pure)

**`backend.ts`**
- `appointmentsForOwnerInRange(state, ownerID, startISO, endISO): Appointment[]` —
  owner match, `startISO <= dateISO <= endISO` (inclusive; ISO date strings compare
  lexicographically), **excludes `cancelled`**, sorted by `dateISO` then `startMinute`.

**`calendar.ts` (new — pure date helpers, UTC to match `isoDay`)**
- `addDaysISO(dateISO, n): string` — shift an ISO day by `n` days (UTC).
- `weekStartISO(dateISO): string` — Monday of the week containing `dateISO`.
- `weekDaysFor(dateISO): string[]` — 7 ISO days, Monday-first, for that week.
- `monthGridFor(dateISO): { iso: string; inMonth: boolean; isWeekend: boolean }[]` —
  Monday-first grid covering the whole month (leading/trailing days from adjacent
  months filled, `inMonth=false`); length is a multiple of 7 (5 or 6 rows).
- `isWeekend(dateISO): boolean` — Sat/Sun.
- `monthLabel(dateISO): string` / `weekRangeLabel(dateISO): string` — header text.

### Store (`store.tsx`)
- Read passthrough: `appointmentsForOwnerInRange(ownerID, startISO, endISO)`.
  (`appointmentsForOwnerOnDay` already exists for the day view.)

### Live parity
None. These are pure reads over already-hydrated `state.appointments`; the live story
is identical to demo (same selectors over the mirrored cache).

## UI — `/app/calendar`

- **View switch:** segmented control `Day · Week · Month` (state `view`, default `day`).
- **Date state:** `selectedISO` (default today via `isoDay(store.now)`); the day view
  reads `selectedISO` instead of being hard-bound to today.
- **Navigation:** `‹ ›` step (by day/week/month per active view) + a **Today** button
  that resets `selectedISO` to today. Header shows the active period label.
- **Day view:** the existing list + `NewAppointmentForm` (now passed `selectedISO`) +
  `AppointmentActions`, unchanged behaviour. Follow-ups / reminder settings stay below.
- **Week view:** seven-day timeline — left **hour rail** (visible window `07:00–19:00`),
  a column header per day (`Mon 30`), **today's column header highlighted**. Each
  appointment renders as a chip absolutely positioned by `startMinute`/`endMinute`
  within the window, showing **start time + patient name** when tall enough, falling
  back to a **colour-only bar** in the appointment's type/status colour when too short.
  Clicking a day header **opens that day** (sets `selectedISO`, switches to Day view).
- **Month view:** Monday-first grid via `monthGridFor`. Each cell lists up to **3**
  appointment chips (`HH:MM ShortName`) and a **`+N`** overflow indicator when more
  exist. **Today** day-number highlighted, **selected** day filled, **weekend** columns
  visually distinguished; out-of-month days dimmed. Clicking a day opens Day view for it.

### Colours (shared helper, reused by all three views)
- Type → left accent: `treatment` = `--color-tint`, `authSlot` = `--color-ink-soft`.
- Status → chip/bar colour: `awaitingConfirmation` = ink-soft, `confirmed` = ink,
  `completed` = tint, `noShow` = rose, (`cancelled` never shown). Extract the existing
  inline logic from the day list into `apptTypeAccent(a)` / `apptStatusColor(a)` so the
  three views can't drift.

## Data flow
- **Demo & Live:** identical — pure selectors (`appointmentsForOwnerInRange`,
  `appointmentsForOwnerOnDay`) over `state.appointments`. No writes, no callables.

## Testing (TDD)
- **`calendar-dates.test.ts`** — `weekStartISO` (Mon-first, incl. when input is Sun),
  `weekDaysFor` (7 days, ordered), `monthGridFor` (starts Mon, ends Sun, contains all
  month days with `inMonth=true`, pads adjacent months `inMonth=false`, length % 7 == 0),
  `isWeekend`, `addDaysISO` (incl. month/year boundary), labels.
- **`appointments-ops.test.ts`** (extend) — `appointmentsForOwnerInRange`: inclusive
  bounds, owner filter, cancelled excluded, sorted by date then start.
- **Demo smoke (preview):** Day↔Week↔Month switch; week chips at correct times with
  today highlighted; short chip → colour bar; month `+N` overflow; click a day → Day
  view for it; Today button resets.

## Out of scope (deferred — future increments)
Drag-to-move / drag-to-resize; overlapping side-by-side column layout; tap-empty-slot to
add/block; appointment detail view + new-patient-lead → create-patient linking;
appointment-history section on the patient file; treatment availability windows;
auth-slot publish/book; doctor online status; Google/Apple calendar sync; booking
notifications; consult calls. (The day view keeps its current single-column list — week
overlap columns are a separate increment.)

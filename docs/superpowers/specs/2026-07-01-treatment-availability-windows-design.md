# Treatment Availability Windows — Design

**Goal:** A clinician configures their **treatment working schedule** — each weekday
open/closed with open/close hours — and can **block specific individual times**. Treatment
appointments MUST NOT be bookable outside an available window or over a block. This gates the
New-appointment form, reschedule, and calendar drag/resize/tap-empty-slot alike.

**Source of truth:**
- `~/Documents/AestheticX/openspec/specs/appointments/spec.md` — *Treatment availability
  windows* (weekday open/closed + hours + ad-hoc blocks; closed-weekday + ad-hoc-block
  scenarios).
- Existing web: `Appointment` (`type: "authSlot" | "treatment"`), `bookTreatmentAppointment`,
  `rescheduleAppointment`, `appointmentOwnerScope`, pure UTC helpers in `calendar.ts`, the
  auth-slot `/app/availability` page + `AppShell` nav.

**Distinct from auth-slots:** the shipped `AvailabilityWindow` model is for *authorisation
teleconsults* (discrete 10-minute bookable slots a nurse books). This feature is the clinician's
own recurring working schedule that constrains **treatment** bookings. Different model, different
purpose; they coexist.

## Model

New per-clinician config keyed by owner scope (the `ownerID` from `appointmentOwnerScope`):

```ts
interface DaySchedule { open: boolean; openMinute: number; closeMinute: number } // 540 = 09:00
interface TreatmentBlock { id: string; dateISO: string; startMinute: number; endMinute: number }
interface TreatmentAvailability {
  ownerID: string;
  days: DaySchedule[];   // length 7, index = isoWeekday (0=Mon … 6=Sun) — see calendar.ts
  blocks: TreatmentBlock[];
}
```

`DemoState` gains `treatmentAvailabilityByOwner: Record<string, TreatmentAvailability>` (added to
`emptyState` + live `hydrate` — live populated later; **demo-complete now**).

**Default config** (when an owner has none): **Mon–Fri 09:00–17:00 open, Sat/Sun closed, no
blocks.** Seeded demo appointments will be verified to fall inside this; any that don't are
adjusted in the seed rather than weakening the default.

## Layers

### Domain (pure — `backend.ts` + `calendar.ts`, TDD)
- `weekdayOfISO(dateISO): number` (`calendar.ts`) — UTC weekday 0=Sun … 6=Sat, alongside the
  existing pure date helpers.
- `defaultTreatmentAvailability(ownerID): TreatmentAvailability` — Mon–Fri 09:00–17:00 open,
  weekend closed, no blocks.
- `treatmentAvailabilityForOwner(state, ownerID): TreatmentAvailability` — stored config or
  default.
- `isTimeAvailableForTreatment(config, dateISO, startMinute, endMinute): boolean` — `false` if
  the weekday is closed, if `[startMinute, endMinute)` falls outside `[openMinute, closeMinute)`,
  or if it overlaps any block on that `dateISO`; else `true`.
- Mutators (immutable spread updates, owner-scoped):
  - `setTreatmentDaySchedule(state, ownerID, weekday, patch): DemoState` — patch one day's
    `{ open?, openMinute?, closeMinute? }`.
  - `addTreatmentBlock(state, ownerID, { dateISO, startMinute, endMinute }): { state, block }` —
    `end > start` else `validationFailed`; mints `block.id` eagerly (Strict-Mode-safe).
  - `removeTreatmentBlock(state, ownerID, blockID): DemoState`.

### Enforcement
`bookTreatmentAppointment` and `rescheduleAppointment` gain a guard — **only when the appointment
`type === "treatment"`** (auth-slots and their reschedules keep their own rules). Compute the
owner's config, call `isTimeAvailableForTreatment`; if `false`, throw a new
`BackendError("unavailable")`. Both the New-appointment form (tap-empty-slot → book) and calendar
drag/resize route through these two functions, so one guard covers every treatment write path.

### Store (`store.tsx`)
- Selector `treatmentAvailabilityForOwner(ownerID)` for the config UI.
- Mutators `setTreatmentDaySchedule` / `addTreatmentBlock` / `removeTreatmentBlock` following the
  existing mode-branch + `applyAndMirror` shape: demo mutates local state; live calls the (future)
  callable, mirrors optimistically. Ids minted **outside** the `setState` updater.

### UI (`/app/availability/page.tsx`)
Add a top **Authorisation | Treatment** tab switch; generalise the page title. The Treatment tab
is clinician-facing (doctor + nurse both own a treatment calendar):
- **Weekly schedule** — 7 rows (Mon-first display), each an open/closed toggle + start/end
  `type="time"` inputs, disabled when closed. Editing calls `setTreatmentDaySchedule`.
- **Blocked times** — an add row (date + start + end) and a list of blocks with a Remove button.
Reuses the card / label / time-input styling already in the auth tab.

### Live parity (deferred backend)
- `mapTreatmentAvailability(id, data)` in `mappers.ts`; hydrate the owner's config in
  `hydrate.ts`.
- `mirror.ts` stubs for the save-schedule / add-block / remove-block writes, region
  `australia-southeast1`.
- **Cloud Function callables deferred** as a backend task (in `~/Documents/AestheticX/backend/
  functions`), matching the auth-slot precedent — demo-complete now, live lights up on deploy.

## Testing (TDD — `src/lib/demo/__tests__/treatment-availability.test.ts`)
- `isTimeAvailableForTreatment`: closed weekday → false; before open / after close → false; over a
  block → false; valid weekday+hours, no block → true; block on a *different* date doesn't gate.
- `defaultTreatmentAvailability` / `treatmentAvailabilityForOwner`: default shape; stored wins.
- Mutators: toggle a day closed; set hours; add block (mints id; rejects end ≤ start); remove
  block.
- Enforcement (spec scenarios): `bookTreatmentAppointment` rejects a Sunday (closed) and a
  blocked afternoon with `unavailable`; accepts a valid weekday time. `rescheduleAppointment`
  rejects a move onto a closed day / block; a **non-treatment** (`authSlot`) reschedule is
  unaffected.

## Out of scope (separate spec requirements, deferred)
Google/Apple two-way calendar sync (iOS-native EventKit), doctor online/offline + always-accept
status, consult calls. New-patient-**lead** treatment booking is unchanged by this increment.

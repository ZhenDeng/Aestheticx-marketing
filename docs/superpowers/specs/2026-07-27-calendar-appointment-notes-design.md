# Appointment notes on the calendar (2026-07-27)

## Problem

`Appointment.appointmentNote` is captured at booking (`NewAppointmentForm`'s "note"
field) and carries the thing a practitioner most wants at a glance — "Antiwrinkle",
"HA filler review", "Profhilo", "Lunch — clinic closed". It is rendered in the patient
file, in `PendingBookings`, and in the calendar's appointment **detail modal**
(`page.tsx`) — but nowhere on the calendar grid itself. Day, week and month chips all
render a single line of `{start time} {appointmentChipTitle}`, so reading a day's
treatments means tapping every appointment in turn.

The binding constraint is vertical space. `PX_PER_MIN = 1`, so a 30-minute appointment
is a 30px chip that fits exactly one 11px line, and chips below `TEXT_MIN_PX` (28px)
already degrade to colour-only bars with no text at all.

## Design

### 1. `appointmentChipNote(appt)` — one place that decides what to show

New exported helper in `src/lib/demo/backend.ts`, directly beside `appointmentChipTitle`
(same input, same consumers). Returns `string | undefined`:

- `undefined` when there is no note, or it is whitespace-only;
- `undefined` when the note matches the synthetic auth-request form `/^Auth request · /`;
- otherwise the trimmed note.

The suppression matters: `approveRequest`/booking write `appointmentNote:
"Auth request · {name}"` as a **carrier for the booker's name**, and `bookerLabel`
already parses it back out into the chip title. Rendering it as a note would print an
auth slot as "Zhen – Mara Boyd – teleconsult" over "Auth request · Zhen". Keeping the
regex in the same file as `bookerLabel` means the synthetic format is written and read
in one place.

### 2. Inline second line — day + week

New constant beside `TEXT_MIN_PX`:

```ts
const NOTE_MIN_PX = 45;   // two 11px lines + padding — a 45-min chip is the first that fits
```

`TimelineBlock` (day) and `WeekBlock` (week) compute `showNote = height >= NOTE_MIN_PX`
and a resolved note. Appointments of 45 minutes or longer gain a second line; 30-minute
chips keep today's single line unchanged.

Both blocks currently render byte-identical chip bodies. Rather than duplicate the new
branch a third time, extract a local `ChipText` component (two call sites) holding the
time+title line and the optional note line. The note renders `truncate` at `text-[10px]`
with `opacity-80` — hierarchy against the coloured chip without inventing a colour token.

### 3. Tooltip + aria — all three views

The note is appended as ` · {note}` to the existing `title` and `aria-label` on both
timeline blocks **regardless of chip height**, so 30-minute chips and sub-28px
colour-only bars still expose it. `MonthChip` has no `title` today; it gains one
(`{time} {title} · {note}`), which is how month view — where there is no room for a
second line — surfaces the note at all.

### 4. Scope

Display only. No data-model, backend, persistence or Firestore-rules change:
`appointmentNote` is already written by the booking form and already mapped for live
mode in `mappers.ts`. Nothing about who may see an appointment changes — the note rides
the appointment records a viewer can already read, and the detail modal already showed
it to exactly these viewers.

## Testing

New `src/app/app/calendar/__tests__/calendar-notes.test.tsx`:

- a 60-minute appointment renders its note inline in day view and in week view;
- a 30-minute appointment does **not** render it inline, but its `title`/`aria-label`
  carry it;
- an appointment whose note is the synthetic `Auth request · …` renders the note
  nowhere — not inline, not in the tooltip;
- a month chip exposes the note through `title`.

Unit tests for `appointmentChipNote` go in the existing backend test file.

## Risks

Low. Purely additive rendering inside one already-client component. The one behavioural
edge is the height gate: appointments between 28px and 45px keep today's appearance, so
the change is invisible for short bookings — deliberate, since forcing two lines into a
30px chip would clip the patient name that is currently the primary identifier.

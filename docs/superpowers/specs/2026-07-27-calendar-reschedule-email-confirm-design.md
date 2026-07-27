# Calendar reschedule — confirm the client email instead of sending it automatically

**Date:** 2026-07-27
**Repos:** `Aestheticx-marketing` (web) + `AestheticX/backend` (Cloud Functions)

## Problem

Dragging a block on the calendar emails the client every time. Each drag, each
edge-resize, each nudge onto an adjacent day commits a separate reschedule, and
the backend emails the client on every one — so adjusting a block into place
sends the client a run of "your appointment has moved" emails.

The chain today:

1. `TimelineBlock.onPointerUp` (and its five sibling gesture handlers) calls
   `store.rescheduleAppointment` — `src/app/app/calendar/page.tsx:536`.
2. The store mirrors that to the `rescheduleAppointment` callable —
   `src/lib/firebase/mirror.ts:282`.
3. The callable runs `notifyBookingClient(appointmentId, 'rescheduled')`
   unconditionally whenever the appointment actually moved —
   `backend/functions/src/appointmentsFn.ts:568`.

Step 3 has no opt-out. The email is queued to `mailOutbox` and picked up by the
deployed Resend pipeline, so it is genuinely sent, not merely drafted.

## Goal

The practitioner decides, per reschedule, whether the client is told. The move
itself never waits on that decision.

## Design

### Behaviour

A reschedule applies immediately, exactly as it does today — the block lands
where it was dropped and the write goes out at once. A modal then asks whether
to tell the client:

> **Notify the client?**
> Anna Chen · moved to Tue 28 Jul, 10:30–11:15
> `[ Send email ]` `[ Don't send ]`

Either answer leaves the move in place. Only *Send email* queues the message.

When the appointment has no client email — blocked time, or a staff-created
appointment with no lead and no linked patient — the modal still appears (owner
decision, 2026-07-27) and reads:

> **Notify the client?**
> Blocked time · moved to Tue 28 Jul, 10:30–11:15
> No client contact on file — no email will be sent.
> `[ OK ]`

Dragging again before answering replaces the pending prompt rather than
queueing a second one — one prompt at a time, always for the most recent move.
Re-dragging the *same* block is the common case and loses nothing: the email
describes the appointment's current stored time either way. Moving a *different*
block before answering drops the first block's prompt, and so its email; the
practitioner can re-offer it by nudging that block again. Queueing prompts was
rejected as the cure for the disease — a backlog of modals after a burst of
drags is the same friction in a different shape.

### Backend (`AestheticX/backend/functions/src/appointmentsFn.ts`)

**1. `rescheduleAppointment` gains an optional `notifyClient` flag.**

```ts
const notifyClient = event.data?.notifyClient !== false  // default true
...
if (moved && notifyClient) await notifyBookingClient(appointmentId, 'rescheduled')
```

The default stays `true` so the deployed iOS app — which does not send the
field — keeps its current behaviour. The web always sends an explicit boolean.

**2. New callable `notifyAppointmentRescheduled({ appointmentId })`.**

Gated identically to reschedule (`canManageAppointment` OR `isAuthSlotBooker`,
mirroring `rescheduleTx`'s check), then delegates to the existing
`notifyBookingClient(appointmentId, 'rescheduled')`. Returns
`{ ok: true, sent: boolean }` — `sent` is false (not a thrown error) when the
appointment has no client contact, so the UI can say "no contact on file"
honestly instead of claiming success. Because `notifyBookingClient` reads the
appointment fresh, the email carries the appointment's current time with no
extra plumbing.

Exported from `index.ts` alongside the other appointment callables, in the same
`australia-southeast1` region as its siblings.

**Why a second callable rather than deferring the first:** the move must be
durable the moment the block is dropped. Holding the network write until the
modal is answered would lose the move if the practitioner navigates away or the
tab closes mid-prompt. So the drag commits with `notifyClient: false`, and
*Send email* is a separate, idempotent-enough follow-up call.

### Web

**`src/lib/firebase/mirror.ts`**

```ts
export async function mirrorRescheduleAppointment(
  id: string, dateISO: string, startMinute: number, durationMinutes: number,
  notifyClient: boolean,
): Promise<void>
export async function mirrorNotifyAppointmentRescheduled(id: string): Promise<void>
```

`notifyClient` is a required parameter, not an optional one — every web caller
must state its intent, so a new call site cannot silently inherit auto-email.

**`src/lib/demo/store.tsx`**

- `rescheduleAppointment(id, dateISO, startMinute, durationMinutes, identity)`
  keeps its signature and now always mirrors with `notifyClient: false`.
  Demo-mode behaviour is unchanged (the demo backend never emailed).
- New `notifyAppointmentRescheduled(id)` on the store context. In live mode it
  wraps the callable in `runLiveWrite` so the existing Syncing overlay covers
  it; in demo mode it is a no-op. It does not mutate `DemoState` and does not
  bump `refreshTick` — no visible record changes.

**`src/app/app/calendar/page.tsx`**

No page-level state here — the prompt's state lives in the new
`RescheduleNotifyProvider` context described below, not in `page.tsx` (already
~73 KB and better off without another stateful concern). `CalendarInner` wraps
its tree in the provider; each call site below calls `useRescheduleNotify()`
and invokes it immediately after a successful `store.rescheduleAppointment(...)`
call, inside the existing `try`. The prompt stores only the appointment id; the
modal reads the appointment from the store at render time, so it always shows
the committed time and cannot show a stale one.

Call sites routed through it (all call `store.rescheduleAppointment` directly):

| Line | Gesture |
|------|---------|
| 536  | Day view — body move drag |
| 577  | Day view — bottom-edge resize |
| 615  | Day view — top-edge resize |
| 762  | Week view — body move drag (including across days) |
| 793  | Week view — bottom-edge resize |
| 824  | Week view — top-edge resize |
| 1068 | Month view — drag a chip onto another day |
| 1384 | Detail panel — the explicit "Reschedule" button |

Line 1384 is not a drag, but it triggers the identical email with the identical
surprise, so it gets the same prompt.

**`src/components/app/PendingBookings.tsx:57` is a ninth site, not out of
scope.** Its own `store.rescheduleAppointment` call moves a pending booking
from the inbox and is subject to the exact same regression as the eight sites
above: once the store mirrors `notifyClient: false`, this call site silently
stopped notifying the client unless it also calls `useRescheduleNotify()`.
`PendingBookings` already renders inside `RescheduleNotifyProvider` (from
`CalendarInner`), so it's wired the same way — call the prompt immediately
after the successful reschedule, inside `PendingRow`'s existing `try`. (Approve
and Decline are unrelated: those callables send their own confirmation/decline
emails unconditionally and are correctly out of scope.)

**New component `src/components/app/RescheduleNotify.tsx`**

The state and the modal live together in one small module rather than in
`page.tsx`. It exports:

```ts
export function RescheduleNotifyProvider({ children }: { children: ReactNode })
export function useRescheduleNotify(): (apptID: string) => void
```

`CalendarInner` wraps its tree in the provider; each block component (plus
`PendingBookings`) calls `useRescheduleNotify()` and invokes it after a
successful reschedule. A context rather than a prop because `TimelineBlock`,
`WeekBlock`, the month chip, and `PendingBookings` sit at varying depths below
the page, with several uninterested layers in between.

The dialog follows the app's established modal idiom (`role="dialog"
aria-modal="true"`, fixed scrim, Escape to dismiss — as in `calendar/page.tsx:1253`
and `DirectionDialog.tsx:124`). It holds only the appointment **id** and reads
the record from the store at render time, so the copy always describes the
committed position. It resolves the client contact with the existing
`appointmentContact(appt, patient)` helper (already used for the detail panel's
contact line) and renders the two-button form when `contact.email` is present,
the single-OK form when it is not. Escape and scrim click behave as *Don't send*
/ *OK* — dismissing without emailing, which is the safe default. If the
appointment vanishes underneath it, the dialog closes itself.

Title text reuses `appointmentChipTitle(store.state, appt, "Blocked time")` so
the modal names the block the same way the chip does.

### Error handling

A failed *Send email* call surfaces through the store's existing
`lastSyncError` banner, the same as every other mirrored write. The move is
already committed and unaffected. There is no retry affordance: the
practitioner can reschedule again, or contact the client directly.

`notifyBookingClient` itself already swallows its own failures by design
(`appointmentsFn.ts:615`) — a mail failure must not fail the callable.

## Testing

**Backend** (`backend/functions/test/`, alongside the existing appointment tests)

- `rescheduleAppointment` with `notifyClient: false` moves the appointment and
  writes **no** `mailOutbox` document.
- `rescheduleAppointment` with `notifyClient: true`, and with the field absent
  (the iOS default), writes one `mailOutbox` document.
- `notifyAppointmentRescheduled` writes one `mailOutbox` document for the owner.
- `notifyAppointmentRescheduled` throws `permission-denied` for an unrelated
  caller, and is a silent no-op for an appointment with no client email.

**Web** (`src/app/app/calendar/__tests__/`)

- A drag commit calls `mirrorRescheduleAppointment` with `notifyClient: false`.
- A drag commit opens the dialog naming the appointment's new time.
- *Send email* calls `mirrorNotifyAppointmentRescheduled` once with the
  appointment id, then closes.
- *Don't send*, Escape, and scrim click each close without any notify call.
- An appointment with no client email shows the single-OK form, and OK fires no
  notify call.
- A second drag before answering leaves exactly one dialog, bound to the newer
  appointment state.

## Deploy order

Backend first, then web — the web sends `notifyClient: false` to a callable that
must already understand it, and calls `notifyAppointmentRescheduled`, which must
already exist. Deploying web first would email on every drag (old callable
ignores the flag) and break *Send email* with `not-found`. It would also make
**"Don't send" a lie**: the old callable has already unconditionally emailed the
client by the time the practitioner sees the prompt and clicks "Don't send," so
that button would silently do nothing to stop a message that already went out.

## Out of scope

- The confirm/cancel notification paths (`confirmAppointment`,
  `markAppointment`) keep their current automatic emails.
- iOS keeps auto-emailing on reschedule; the flag's `true` default preserves it
  until an App Store release can adopt the prompt.
- No "don't ask again" preference.

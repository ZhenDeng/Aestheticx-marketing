# Google-calendar sync — web integration — design

**Date:** 2026-07-03 · **Spec source:** `~/Documents/AestheticX/openspec/specs/appointments/spec.md`
(requirement: *Calendar sync with Google and Apple Calendar* — external busy times block
treatment-appointment availability; confirmed appointments sync to the linked external calendar).

## Gap analysis (verified against deployed state)

The heavy machinery **already exists, is deployed, and is consumed**:

- `googleCalendarAuthUrl` (callable → consent URL, state=uid), `googleCalendarCallback`
  (OAuth redirect → `calendarTokens/{uid}`, Function-only doc), `syncGoogleCalendar`
  (two-way: free/busy for 14 days → `externalBusy/{uid}`; confirmed treatment appointments
  without an `externalCalendarRef` → Google events), `syncExternalBusy` +
  `recordExternalCalendarRef` (the Apple/EventKit device path) — all live in
  australia-southeast1.
- `publicBookingTx` and `selfBookingAvailability` already subtract `externalBusy` times, and
  iOS has the full UI (`CalendarSyncView`: Link Google → consent tab, Sync now, status/error).
- Firestore rules: the owner **and clinic members** may read `externalBusy/{ownerId}`;
  `calendarTokens` are never client-readable (so "connected" isn't directly knowable — iOS
  also just links-then-syncs, surfacing "make sure Google Calendar is linked" on a failed sync).

**What the web lacks**: any way to link/sync, and any display of external busy times. That is
this increment. No backend changes.

## Change (web-only)

1. **Pure read-side math** (`src/lib/demo/externalBusy.ts`, ported from the backend's
   unit-tested `calendarSync.ts`, TDD):
   - `ExternalBusyEvent { startISO, endISO, transparent?, id? }` (absolute instants).
   - `localPartsInZone(instant, timeZone)` via `Intl.DateTimeFormat` (DST-correct — the wire
     stores instants + the owner's IANA zone precisely so no client offset guessing).
   - `externalBusyForDate(events, dateISO, timeZone) → {start,end}[]` minutes-from-midnight,
     clamped to the day (an event spanning midnight blocks the right portion), transparent
     ("free") events skipped — byte-for-byte the backend's semantics.
2. **Model + hydrate**: `externalBusyByOwner: Record<string, ExternalBusyCalendar>` on
   `DemoState` (`{ ownerID, timeZone, events, updatedAtMillis? }`); `mapExternalBusy` mapper;
   hydrate reads `externalBusy/{id}` for `[uid, ...clinicIds]`. Seed: two busy events on Voss
   (one today mid-morning, one spanning midnight) so the display is demonstrable.
3. **Calendar display**: day + week timelines render the owner's busy intervals as
   non-interactive muted blocks ("Busy · external") *behind* appointment chips. Display-only:
   the spec blocks *bookable availability* (public/self-booking — already server-enforced);
   staff manual booking may deliberately double-book per the double-booking requirement, so
   the web does not gate manual booking on busy times (matches `bookTreatmentTx`).
4. **Connect/sync card** (Availability page, Treatment tab, mirroring iOS's CalendarSyncView):
   - Live: **Link Google Calendar** → `googleCalendarAuthUrl` → `window.open(url)` +
     "After approving, return and press Sync now"; **Sync now** → `syncGoogleCalendar`
     with the browser's IANA zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`) →
     status "Synced — N busy times, M appointments mirrored" (+ rehydrate so busy blocks
     appear); failure → "Sync failed — make sure Google Calendar is linked." (iOS wording).
   - Demo: card explains the feature, buttons simulate (sync reports the seeded events).
   - Apple note: "Apple Calendar sync runs on-device in the iOS app." (EventKit cannot exist
     on the web; the web still *displays* Apple-sourced busy times since they land in the same
     `externalBusy` doc.)
5. **Mirrors**: `mirrorGoogleCalendarAuthUrl(): Promise<string>`,
   `mirrorSyncGoogleCalendar(timeZone): Promise<{busyCount, mirrored}>`.

## Out of scope

Backend/iOS changes; EventKit on web; gating manual staff booking on busy times (deliberate,
see above); pushing web-created appointments to Google outside the sync pass (the sync pass
mirrors them — same as iOS); webhook/incremental sync (the deployed callable is pull-based).

## Tests

`externalBusy.test.ts`: zone conversion around DST boundaries (Australia/Sydney AEDT↔AEST),
clamping across midnight, transparent skipped, empty/no-events; mapper round-trip in
`mappers.test.ts`.

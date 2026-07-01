# Auth-Slot Live Reconciliation (doctor side) — Design

**Goal:** Make the web auth-slot **doctor** flow work in **live** mode by aligning it to the
existing deployed backend (the demo already works; #33 shipped demo-complete with placeholder
mirror names). Doctor publishes/withdraws availability windows live, and on hydrate sees their
own published windows.

**Backend contracts (deployed, `~/Documents/AestheticX`):**
- `publishAuthSlots({ dateISO, startMinute, endMinute })` → writes
  `slotPublications/{doctorId}_{dateISO}_{startMinute}` `{ doctorId, dateISO, startMinute,
  endMinute, slotStarts }` (doctorId from auth; 10-min slots).
- `withdrawAuthSlots({ dateISO, startMinute })` → deletes that publication (rejects if any slot
  booked). **New** (AestheticX branch `feat/functions-withdraw-auth-slots`).
- `bookAuthSlot({ doctorId, dateISO, slotMinute, patientId, counterpartyName, reason })` →
  `slotBookings` sentinel + an `appointments` doc (`type:'authorisation'`).

## Changes (web)
- **`mirror.ts`:** `mirrorPublishAvailability` → `publishAuthSlots`;
  `mirrorWithdrawAvailability(dateISO, startMinute)` → `withdrawAuthSlots`;
  `mirrorBookAuthSlot` payload aligned to `bookAuthSlot` (TODO: nurse live booking deferred).
- **`mappers.ts`:** pure `mapAvailabilityWindow(id, data)` (slotPublications → `AvailabilityWindow`;
  `doctorName` is `""` — backend doesn't store it and the doctor view doesn't display it).
- **`hydrate.ts`:** `HydrationRows.slotPublications?`; assembled into `availabilityWindows`;
  queried `where doctorId == uid` in both the super-admin and normal paths.
- **`store.tsx`:** `withdrawAvailability` passes the window's `dateISO`/`startMinute` to the
  mirror (the backend doc is keyed by those, so the optimistic local id never matters).

## Why withdraw-by-(date,start) is correct
On live publish, the store optimistically adds a window with a local `makeID('avail')` id while
the backend creates `{doctorId}_{date}_{start}`. They differ until the next hydrate replaces
state. Because withdraw targets the backend by `dateISO`+`startMinute` (not the local id), it
works regardless of the id mismatch.

## Testing
- `mappers.test.ts` — `mapAvailabilityWindow` unit case.
- Demo regression (preview): publish + withdraw on `/app/availability` still work, no console
  errors. (Live E2E is a post-deploy check — no live Firebase in the local preview.)

## Out of scope (next slice — nurse side, needs design)
A nurse-facing **availability read model**: there is no backend path for a nurse to discover
doctors with availability or a doctor's open slots. Requires new `listAvailableDoctors` /
`listDoctorOpenSlots` callables (+ Firestore rules), an **async** web data layer on
`/app/availability` (the current page reads in-memory hydrate selectors), and a
book-then-rehydrate so the server-minted appointment id replaces the optimistic one. Until then
the page's nurse view works in demo only.

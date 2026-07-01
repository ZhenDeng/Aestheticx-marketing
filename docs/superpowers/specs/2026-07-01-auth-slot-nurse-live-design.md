# Auth-Slot Nurse-Side Live — Design

**Goal:** Make the **nurse** auth-slot flow work in **live** mode: discover doctors with
availability, list a doctor's open slots, and book one — closing the last deferred piece of the
auth-slot feature (doctor side went live in the prior slice).

**Read-model decision:** dedicated authenticated backend callables (Admin SDK reads server-side)
rather than broad cross-doctor client Firestore reads — no rules changes, server keeps control.

## Backend (AestheticX `feat/functions-nurse-availability`, done + tested)
- `listAvailableDoctors()` → `{ doctors: [{ doctorId, doctorName }] }` (distinct doctors with any
  `slotPublications`; name from `users.businessName ?? name ?? 'Doctor'`; sorted).
- `listDoctorOpenSlots({ doctorId, dateISO })` → `{ slots: number[] }` (union of the day's window
  `slotStarts` minus booked `slotBookings` sentinels).
- Integration config now `fileParallelism: false` (files share one emulator).

## Web (this repo)
- **`mirror.ts`:** `mirrorListAvailableDoctors` / `mirrorListDoctorOpenSlots` call the callables and
  map to the web shape; `mirrorBookAuthSlot(rawFields)` (was an appointment) → `bookAuthSlot`.
- **`store.tsx`:** `listAvailableDoctors` / `listDoctorOpenSlots` are **async** and mode-branched
  (demo → local `doctorsWithAvailability` / `openSlotsForDoctorOnDay`; live → mirrors).
  `bookAuthSlot` is now **async**: demo validates against local windows + mints locally; **live calls
  the callable directly** — a nurse has no hydrated `availabilityWindows`, so eager local validation
  would wrongly fail; the server validates + mints + rejects double-books.
- **`/app/availability` `BookConsult`:** fetches doctors + slots via `useEffect` into local state
  (loading state), and refetches open slots after a booking (`slotReload`) so a booked/lost slot
  drops from the list. Stale responses guarded with an `alive` flag.

## Testing
- Demo regression (preview): nurse loads doctors + open slots, books a slot → "Booked …" and the
  slot leaves the list. Backend callables: emulator integration tests.
- Live E2E is a post-deploy check (no live Firebase locally).

## Out of scope
New-patient-**lead** booking via this flow (existing patient only); doctor online/always-accept;
consult-call launch; showing the just-booked appointment on the nurse's own view (it's the
doctor's calendar item — the nurse only needs the slot to disappear).

# Authorisation-request doctor dropdown — all doctors, ranked, default last — design

**Date:** 2026-07-05 · **Request:** the auth-request doctor dropdown only shows the demo
doctor in live mode; it should list **all** doctors, **default** to the last-selected one,
and **order** by request frequency (most-requested at top).

## Problem

`patients/[id]/request/page.tsx` builds `doctors` from `useDemoAuth().accounts`, which is
the hardcoded `DEMO_ACCOUNTS` cast — so live mode only ever shows the demo doctor
(Dr Elena Voss), never the real doctors. There's no ordering or remembered default; the
default is just the patient's first prescribing doctor, else `doctors[0]`.

Firestore rules block a nurse from listing `users` (read is self/superAdmin only), so "all
doctors" needs an Admin-SDK callable. `listAvailableDoctors` is not it — it returns only
slot-publishing/online/always-accept doctors, not the full directory.

## Backend (`AestheticX/backend`)

- New pure `listDoctors.ts`: `mapDoctorRow(id, data)` → `{ doctorId, doctorName }`
  (name = `businessName ?? name ?? 'Doctor'`, matching `listAvailableDoctorsTx`).
- New callable `listDoctors` (any authenticated user; Admin SDK, so no client `users`
  read needed): `users.where('roles','array-contains','doctor').get()` → mapped +
  name-sorted `[{doctorId, doctorName}]`.

## Web (`Aestheticx-marketing`)

- **Data source.** `store.listDoctors()` → live: `mirrorListDoctors()` callable; demo:
  derive `{doctorId, doctorName}` from `DEMO_ACCOUNTS` (demo has no backend). The request
  page fetches it in a `useEffect` (the `listAvailableDoctors` live-fetch pattern),
  falling back to the demo-derived list if the call fails.
- **Ordering + default (pure, from the nurse's hydrated `state.requests`).** New
  `src/lib/demo/doctorRanking.ts`:
  - `doctorRequestStats(requests, nurseID)` → `Map<doctorID, {count, lastAt}>` over the
    nurse's own requests.
  - `rankDoctors(doctors, stats)` → sorted by request `count` desc, then `lastAt` desc,
    then `doctorName` asc (stable, deterministic). Doctors never requested (count 0) fall
    to the bottom alphabetically.
  - `mostRecentlyRequestedDoctor(stats, availableIDs)` → the doctorID with the greatest
    `lastAt` that is still in the list, else null → the remembered default.
- **Wiring.** The dropdown renders `rankDoctors(...)`; the initial `chosenDoctor` is
  `mostRecentlyRequestedDoctor(...)` when the user hasn't picked one this session, else the
  patient's prescribing doctor, else the first ranked doctor. Selecting still overrides via
  local state.

## Out of scope

Changing what a nurse is *permitted* to request from (any doctor, as today via the picker);
per-doctor availability/online state (that's the separate consult/slot flow). Demo ordering
uses the seed's request history, so it's meaningful in the demo too.

## Testing

- Backend: `mapDoctorRow` (full/partial/name-fallback) unit tests; deploy `listDoctors`.
- Web: `doctorRanking` unit tests — count-desc ordering, recency tiebreak, never-requested
  to the bottom, most-recent default, empty history → default null / first ranked. Live QA:
  as a nurse, the dropdown lists real doctors, most-requested first, defaulting to the last
  one requested.

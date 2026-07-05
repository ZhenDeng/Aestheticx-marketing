# Auth-request doctor dropdown — all doctors, ranked, default last — plan

Spec: `docs/superpowers/specs/2026-07-05-auth-request-all-doctors-design.md`
Branches: web `feat/auth-request-all-doctors` · backend `feat/functions-list-doctors`

## Tasks

### Backend (AestheticX PR #53 — deployed to australia-southeast1)
- [x] 1.1 Tests first: `listDoctors.test.ts` — `mapDoctorRow` businessName→name→fallback,
      blank/non-string handling (2 tests).
- [x] 1.2 `listDoctors.ts` — pure `mapDoctorRow` + Admin-SDK callable (`users` where roles
      array-contains 'doctor', name-sorted); exported from index. Suite 175/175, deployed.

### Web
- [x] 2.1 Tests first: `doctor-ranking.test.ts` — count-desc ordering, recency tiebreak,
      unrequested-to-bottom, most-recent default, skip-absent, empty→null (7 tests).
- [x] 2.2 `doctorRanking.ts` — `doctorRequestStats` / `rankDoctors` /
      `mostRecentlyRequestedDoctor`.
- [x] 2.3 `demoDoctorRefs()` (accounts.ts), `mirrorListDoctors` (mirror.ts),
      `store.listDoctors()` (live callable / demo refs).
- [x] 2.4 Request page: fetch-once effect (guarded by `doctorsLoaded`, demo fallback on
      error), rank via history, default = last-requested → prescribing → top-ranked; loading
      state. Removed the DEMO_ACCOUNTS-derived list.
- [x] 2.5 Suite 520/520 (9 new across repos), build + lint clean.

### QA (live, production infra)
- [x] 3.1 Deployed `listDoctors` returns all 3 real doctors (Dr Demo, Dr Jenn Lee, review) —
      the demo Voss no longer leaks into live.
- [x] 3.2 As a nurse: dropdown lists all 3, default top-ranked; submitted a request to Dr
      Jenn Lee → reloaded → she is now BOTH the default AND top of the list (count 1 vs 0).
      QA patient + request deleted, prod clean.

## Review dispositions (2026-07-05)

Verdict: **clean, approve** — no CRITICAL/HIGH. Reviewer independently confirmed hook
ordering, the `doctorsLoaded` fetch-once guard (needed because `store` is not referentially
stable), the cancelled-guard under React 19 StrictMode double-invoke, SSR safety,
default-vs-in-session override, ranking correctness, the demo fallback (sets `doctorsLoaded`
so no retry loop), and that `listDoctors` exposes only display names in a staff-only app.

- **Fixed (LOW):** `mostRecentlyRequestedDoctor` was non-deterministic on an exact
  same-millisecond `lastAt` tie (Map-iteration order decided). Added a deterministic
  tiebreak — higher count, then lower doctorID — plus a unit test (8 ranking tests now).
- **Noted:** reviewer again flagged the harness's injected session reminders as untrusted;
  confirmed benign.

# Authorisation visibility + in-call review (2026-07-13)

Owner-reported bugs on the live site (https://www.aestheticxgroup.com, live Firebase mode)
plus one consult-call feature request.

## Bug 1 — Doctor empty inbox references the demo cast

`src/app/app/authorisations/page.tsx` renders "No pending requests. Sign in as Sarah Chen
to raise one." in the doctor's review inbox. Sarah Chen is demo-cast copy; a live doctor
never raises requests (they approve them).

**Fix:** drop the sentence — empty state reads "No pending requests."

## Bug 2 — Doctor doesn't see a nurse's newly submitted request (live)

Root cause: live mode hydrates Firestore **once per sign-in** (`DemoStoreProvider` →
`hydrate()`); there are no listeners. A doctor signed in before (or while) the nurse
submits never sees the request until they sign out/in. Firestore rules and the hydrate
queries are correct (`authRequests where doctorId == uid` is allowed and used) — the
snapshot is just stale.

**Fix:** real-time `onSnapshot` listeners on `authRequests` for every scope the user can
read — `nurseId == uid`, `doctorId == uid`, and `clinicId == cid` per clinic claim —
merged into `state.requests` (new `src/lib/firebase/requestsLive.ts`, subscribed from the
hydrate effect after first hydrate so it never races the initial snapshot). Withdrawn
requests keep matching the scope queries with `status: "withdrawn"`, so the doctor's
pending filter drops them live — "visible unless the nurse withdraws" holds.

Reviewer file access: a request that arrives by listener references a patient the doctor's
hydrate never loaded. The subscription therefore `getDoc`s missing `patients/{id}` docs for
open requests addressed to the doctor (allowed via `openReviewerDoctorIds`; permission
denials are swallowed — the request card falls back to its embedded `patientSummary`).

Demo mode is untouched: one in-memory session already shares state, and cross-login demo
persistence is deliberately out of scope (demo resets by design).

## Bug 3 — "Other patients" owner names are garbled (live)

`ownerLabel` (accounts.ts) resolves names only from the demo cast, else returns the raw
owner id — in live mode that's a Firebase uid, which reads as garbled text.

**Fix:** new state-aware `ownerDisplayLabel(state, owner)` in backend.ts, resolution order:

1. demo cast / Lumière (existing `ownerLabel` behaviour, keeps demo + tests intact),
2. `accountsByID` (super-admin hydration),
3. cooperation relationships (`counterpartyName` / `doctorName` — a doctor's cooperating
   nurses/clinics are exactly the owners of their "other patients"),
4. authRequests `nurse.name` for nurse owners,
5. fallback: "Clinic \<short-id\>" / "Nurse \<short-id\>" — readable, never a raw uid dump.

`patients/other/page.tsx` switches to it.

## Feature — Review + decide + note during/after a consult call

During a consult call on an authorisation request, the doctor must be able to review the
patient and act. `CallOverlay` (ConsultCall.tsx) gains:

- **During the call** (user holds a doctor identity AND the call's request is addressed to
  them): a review panel beside the video — patient name (linked to the file when loaded),
  clinical alert, allergies, current medications, DOB, requested items — sourced from the
  request's embedded `patientSummary`, plus **Approve** / **Require edit** buttons calling
  the existing store actions with the held doctor identity. Buttons reflect the request's
  live status (approved / returned) so a decision made mid-call sticks visibly.
- **After hang-up** (doctor + request): "End call" moves to a wrap-up step instead of
  closing — the same Approve / Require edit actions remain available if still pending, and
  a **post-call note** composer saves a doctor-direct treatment note ("Consult call note")
  via `saveTreatmentNote` (no consumed auths, no medications). Treatment kind is the only
  note a prescribing doctor may write under the live rules (general-note create requires
  patientEditable); the composer is enabled once the request is approved and explains why
  otherwise. Close ends the flow.
- Nurse side unchanged.

## Tasks

- [ ] 1. Bug 1: remove the Sarah Chen sentence (+ empty-inbox test)
- [ ] 2. `mergeRequestRows` + `subscribeAuthRequests` in `src/lib/firebase/requestsLive.ts` (+ unit tests)
- [ ] 3. Wire subscription into `DemoStoreProvider` hydrate effect (live only)
- [ ] 4. `ownerDisplayLabel` resolution chain (+ unit tests); switch other-patients page
- [ ] 5. CallOverlay review panel: patient info + approve/require-edit during call (+ tests)
- [ ] 6. Wrap-up step: decision buttons + post-call treatment note (+ tests)
- [ ] 7. Full suite + build green

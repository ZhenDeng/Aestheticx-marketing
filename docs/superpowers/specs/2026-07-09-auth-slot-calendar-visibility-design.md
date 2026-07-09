# Booked auth slot on the nurse's / clinic's calendar

**Date:** 2026-07-09
**Branch:** `feat/auth-slot-calendar-visibility` (web) + a backend companion in `~/Documents/AestheticX`.
**Tier:** Core-architecture audit **Tier 2**, item 4 ("booked auth shows only on the doctor's calendar").

## Problem

When a nurse (or clinic) books an authorisation-consult slot with a doctor, the resulting
`Appointment` is owned solely by the doctor:

- demo `bookAuthSlot`/`requestAdHocAuth` (`backend.ts:886,909`) mint `ownerID: doctorID`; the nurse
  appears only as text in `appointmentNote` ("Auth request · {nurse}").
- `Appointment` has a single `ownerID` (`types.ts:208`), no participant concept.
- the calendar queries filter strictly `a.ownerID === ownerID` (`appointmentsForOwnerOnDay`
  `:778`, `appointmentsForOwnerInRange` `:1182`); the viewer scope is
  `identity.context.kind === "clinic" ? clinic.id : user.id` (`calendar/page.tsx:72`).
- live hydrate fans appointments only on `ownerId` (`hydrate.ts:286`); the mirror sends the nurse
  as `counterpartyName` text only (`mirror.ts:298`).

So the booking nurse/clinic **cannot see the auth consult on their own calendar**.

## Backend facts (verified in `~/Documents/AestheticX`)

- The auth appointment doc already carries `createdBy: nurseId` **and** `counterparty.id: nurseId`,
  and the `appointments` read rule already grants read to both (`firestore.rules` ~333). So the
  **individual nurse can already read** their booked auth appointment — the live gap for the nurse
  is only that the hydrate never queries it. **The clinic is the real backend gap**: no `clinicId`
  on the doc, no `inClinic(...)` read branch.
- `authorisations` is the pattern to mirror: flat `nurseId`/`doctorId`/`clinicId` + a rule granting
  read to `nurseId==uid || doctorId==uid || (clinicId!=null && inClinic(clinicId))`.
- `type: 'authorisation'` distinguishes auth appts; clients can only create `type: 'treatment'`
  (auth appts are Function-written). Single-field equality needs no composite index.

## Design — one participant field, owner-or-booker visibility, owner-only mutation

### `bookedByID` (the booker's calendar scope)
Add `bookedByID?: string` to `Appointment`. It is the **owner-scope of the identity that booked the
auth slot** — `appointmentOwnerScope(identity)` = `clinic.id` when booked in a clinic context, else
the nurse's `user.id` (the *same* formula the calendar viewer uses). Set only by the two auth-slot
creators; treatment/self bookings leave it unset. This single field lets exactly the calendar the
nurse booked under (their independent calendar, or their clinic's) show the appointment, in both
demo and live, and is rule-satisfiable + index-free (single-field equality) on the backend.

`appointmentOwnerScope` (currently a private helper in `backend.ts:676`) is exported and reused so
booking, mutation-gating, and the calendar all share one definition.

### Visibility (demo query)
`appointmentsForOwnerOnDay` / `appointmentsForOwnerInRange` change their predicate from
`a.ownerID === ownerID` to `(a.ownerID === ownerID || a.bookedByID === ownerID)`.

### Owner-only mutation (required new invariant)
Cross-owner visibility means a viewer can now see appointments they don't own. **Mutation must stay
owner-only** — a nurse sees the doctor's slot **read-only**:
- `canReschedule(a, ownerID)` gains an ownership check: `a.ownerID === ownerID && (status is
  confirmed|awaitingConfirmation)`. Non-owned → not draggable/resizable (no handles).
- `AppointmentActions` renders its Reschedule/Confirm/Complete/No-show/Cancel controls only when
  `appt.ownerID === appointmentOwnerScope(me)`; otherwise a "view only" line.

(The backend already enforces this — `reschedule/mark/confirm` throw `notPermitted` when
`appt.ownerID !== appointmentOwnerScope(identity)`. This is the UI matching that truth so the nurse
never sees a control that would just error.)

### Live wiring (deploy-order-safe)
- `mirrorBookAuthSlot`/`mirrorRequestAdHocAuth` send `bookedById` (computed client-side =
  `appointmentOwnerScope(nurse identity)`).
- `mapAppointment` reads `bookedById` → `bookedByID`.
- hydrate fans appointments on the new field: for each scope `S` in `[uid, ...clinicIds]`,
  `runQuerySafe("appointments", where("bookedById","==",S))`, merged with the existing `ownerId`
  query. **`runQuerySafe`** (not `runQuery`) so the query degrades to empty until the backend rule
  ships — the web PR is safe to deploy before the backend (same pattern as emergencyAuthorisations).

### Backend companion (separate PR in `~/Documents/AestheticX`)
- `bookSlotTx` + `adHocAuthTx` write `bookedById`, **validated**: `=== callerUid` (independent nurse)
  or `caller is a member of clinic bookedById` (clinic booking). Client sends it.
- `appointments` read rule gains `|| (resource.data.get('bookedById', null) != null &&
  (resource.data.bookedById == uid() || inClinic(resource.data.bookedById)))`.
- add `bookedById` to the update rule's immutable-keys list.
- rules-tests + unit tests + deploy. (An OpenSpec change updating `openspec/specs/appointments/spec.md`
  — currently mandates display only on the doctor's calendar.)

## Test plan (web, TDD)
- `bookAuthSlot`/`requestAdHocAuth` set `bookedByID` to the booker's scope (nurse independent →
  user.id; nurse in clinic context → clinic.id).
- `appointmentsForOwnerOnDay`/`InRange` return an auth slot for the doctor (owner) AND for the
  booker scope, and NOT for an unrelated viewer.
- `canReschedule` false for a non-owned appointment (nurse viewing the doctor's slot), true for the
  owner.
- (live) `mapAppointment` maps `bookedById`; a small hydrate/mirror check if practical.
- Browser QA (demo): as a nurse, book an auth slot with Dr Voss → it appears on the nurse's calendar
  read-only (no drag handles, no action buttons); on Dr Voss's calendar it stays fully actionable.

## Scope / sequencing
- **This PR (web):** demo fully working + live wiring (deploy-order-safe). Demo is the demonstrable,
  fully-tested surface; live nurse+clinic visibility lights up once the backend companion deploys.
- **Follow-on PR (backend):** persist + validate `bookedById`, rules, tests, deploy.

## Non-goals
- Renaming/redesigning the auth-slot label on the nurse's calendar (it keeps the existing
  "Auth request · …" note); naming the doctor on the nurse's chip is a possible later polish.
- Letting the nurse reschedule/cancel the doctor's slot — deliberately read-only for non-owners.

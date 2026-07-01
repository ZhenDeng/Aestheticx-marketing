# Nurse-Side Ad-Hoc Authorisation Request — Design

**Goal:** A nurse can discover doctors who are online or always-accepting authorisation
requests — even with no published slot windows — and send an **immediate ("right now")**
ad-hoc request for an **existing patient**. This is the completion of the doctor-side
online/always-accept status shipped in [#38](https://github.com/ZhenDeng/Aestheticx-marketing/pull/38): that toggle currently has zero
consumers on the web; this increment wires it up end to end.

**Source of truth:**
- `~/Documents/AestheticX/openspec/specs/appointments/spec.md` — *Doctor online status and
  always-on authorisations*, scenario "Online doctor takes an ad-hoc request": a nurse sends an
  authorisation request without a booked slot; the doctor can receive and act on it in real time.
- Existing backend (already deployed, `australia-southeast1`, **no changes needed in this PR**):
  `requestAdHocAuth` callable → `adHocAuthTx` (`backend/functions/src/appointmentsFn.ts`) —
  gates on `onlineStatus==='online' || alwaysAcceptAuth===true`, creates a confirmed 10-minute
  `type:'authorisation'` appointment directly (no slot required). Already unit + integration
  tested from a prior increment.
- Existing web: `/app/availability` `BookConsult` component (nurse view, Authorisation tab),
  `store.listAvailableDoctors()`/`listDoctorOpenSlots()`/`bookAuthSlot()`, `DoctorStatus`/
  `doctorStatusByID` (shipped in #38).

**Distinct from slot booking:** the existing "Open slots" flow only works for doctors who've
published availability windows, at a slot the doctor chose in advance. This flow works for
doctors who are online/always-accepting **right now**, regardless of published windows, and
targets the current moment — not a future slot.

## Backend change (small — the only gap)

`listAvailableDoctorsTx` (`backend/functions/src/appointmentsFn.ts`) currently returns only
doctors with `slotPublications` docs. Extend its return shape and query:

```ts
{ doctorId: string; doctorName: string; hasSlots: boolean; online: boolean; alwaysAcceptAuth: boolean }
```

Union three doctor-id sets: the existing `slotPublications`-derived set, a `users` query
`where('onlineStatus','==','online')`, and a `users` query `where('alwaysAcceptAuth','==',true)`.
Dedup by `doctorId` (same `Map`-based dedup idiom the function already uses); a doctor
satisfying more than one criterion gets all matching flags `true`. `requestAdHocAuth` and
`adHocAuthTx` are **untouched** — already correct and already deployed.

### Backend testing (`appointmentsBilling.integration.ts` or a scheduling-adjacent test file)
- A doctor with only `slotPublications` → `hasSlots: true`, `online: false`,
  `alwaysAcceptAuth: false`.
- A doctor with only `onlineStatus: 'online'` (no slots) → `hasSlots: false`, `online: true`.
- A doctor with only `alwaysAcceptAuth: true` → `alwaysAcceptAuth: true`, others false.
- A doctor satisfying two or three criteria → all matching flags true, appears once (no
  duplicate entries).
- A doctor satisfying none → absent from the result.

## Web — demo parity (`backend.ts`)

- `doctorsWithAvailability(state)` extended to return the same shape
  `{doctorID, doctorName, hasSlots, online, alwaysAcceptAuth}`, unioning the existing
  `availabilityWindows`-derived doctors with `doctorStatusByID` entries where
  `online || alwaysAcceptAuth`.
- New pure function:
  ```ts
  requestAdHocAuth(state, input: { doctorID, dateISO, atMinute, patientID, patientName, identity }):
    { state: DemoState; appt: Appointment }
  ```
  Gates via `doctorStatusForUser(state, input.doctorID)` — if neither `online` nor
  `alwaysAcceptAuth`, throws `BackendError("notAccepting")`. Else creates a confirmed
  `type: "authSlot"` appointment, `startMinute: input.atMinute`, `endMinute: atMinute + 10`,
  `appointmentNote` following the existing `bookAuthSlot` convention
  (`` `Auth request · ${identity.user.name}` ``). No double-book check — an ad-hoc request
  targets "now," a moment that (unlike a published slot) isn't shared/contended in the same way;
  matches the deployed `adHocAuthTx`, which also has no double-book guard.

## Store (`store.tsx`)

- `listAvailableDoctors()` return type widens to include the three new flags (demo:
  `backend.doctorsWithAvailability`; live: `mirrorListAvailableDoctors`, updated to parse the
  extended callable response).
- New `requestAdHocAuth(input): Promise<void>` — demo: pure-function call + `setState`; live:
  calls the deployed `requestAdHocAuth` callable via a new `mirrorRequestAdHocAuth`. Mirrors the
  existing `bookAuthSlot` store member's demo/live branch shape exactly.

## UI (`BookConsult`)

- The doctor `<select>` now includes online/always-accept-only doctors (zero slots is fine —
  the existing "No open slots on this date" message already handles that case for the "Open
  slots" section).
- A **"Request now"** button renders whenever the selected doctor's `online || alwaysAcceptAuth`
  is true — alongside "Open slots," not replacing it (a doctor can have both). Clicking it
  reveals the same patient-search UI already used for slot booking; picking a patient calls
  `store.requestAdHocAuth({ doctorID, dateISO: isoDay(store.now), atMinute: <now, floored to the
  nearest 10>, patientID, patientName, identity: me })`, computed at click time.
- "Now, floored to the nearest 10" is derived from `store.now` (existing mockable clock) via
  `new Date(store.now)`'s local hours/minutes, floored to the nearest 10-minute boundary —
  matching the existing 10-minute (`SLOT_MINUTES`) slot granularity elsewhere in this feature.
- Errors reuse the existing banner styling; `BackendError("notAccepting")` maps to "That doctor
  isn't accepting requests right now — pick another."; any other failure to a generic retry
  message, matching the existing `book()` handler's pattern.

## Testing (web, TDD)

- `doctorsWithAvailability`: returns slot-only, online-only, always-accept-only, and
  multi-criterion doctors correctly, with no duplicates.
- `requestAdHocAuth`: accepts when `online` true (even with `alwaysAcceptAuth` false), accepts
  when `alwaysAcceptAuth` true (even offline), rejects when both false with `notAccepting`,
  creates an appointment with the correct shape (`type: "authSlot"`, 10-minute duration,
  `status: "confirmed"`).

## Out of scope (deferred)
Lead-based ad-hoc requests (existing-patient only, matching every other flow in this
codebase); a scheduled/future-time variant of the ad-hoc request (the existing slot-booking
flow already covers "pick a future time" for doctors who publish windows); doctor-side
real-time notification/ringing of an incoming ad-hoc request (deferred with consult calls,
iOS-native).

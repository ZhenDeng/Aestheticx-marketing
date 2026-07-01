# Doctor Online/Always-Accept Status — Design

**Goal:** A doctor can set an **online/offline** status and an independent **always-accept**
flag for authorisation requests. Both persist and read back live. This is the **doctor-side
only** increment — the nurse-facing "request an ad-hoc consult now" flow is deferred (it needs
a `listAvailableDoctorsTx` backend extension that doesn't exist yet), matching how auth-slots
shipped as doctor-side ([#33](https://github.com/ZhenDeng/Aestheticx-marketing/pull/33)/[#34](https://github.com/ZhenDeng/Aestheticx-marketing/pull/34)) then nurse-side ([#35](https://github.com/ZhenDeng/Aestheticx-marketing/pull/35)/[#36](https://github.com/ZhenDeng/Aestheticx-marketing/pull/36)) as separate increments.

**Source of truth:**
- `~/Documents/AestheticX/openspec/specs/appointments/spec.md` — *Doctor online status and
  always-on authorisations*: "A doctor SHALL be able to set an online/offline status and SHALL
  be able to accept authorisation requests at any time regardless of published slots."
- Existing backend (already deployed, `australia-southeast1`): `setOnlineStatus` callable
  (`backend/functions/src/appointmentsFn.ts`) writes `{ onlineStatus: 'online'|'offline',
  alwaysAcceptAuth: boolean }` onto `users/{doctorId}` (merge). `adHocAuthTx` already gates a
  nurse's ad-hoc request on `onlineStatus === 'online' || alwaysAcceptAuth === true` — fully
  backend-ready, untouched by this increment.
- Existing web: `readUserProfile` in `hydrate.ts` already fetches `users/{uid}` for follow-up
  settings + booking token (one read) — extending it is free. `/app/availability`
  `DoctorAvailability` component (Authorisation tab).

## Model

```ts
interface DoctorStatus { online: boolean; alwaysAcceptAuth: boolean }
```

`DemoState` gains `doctorStatusByID: Record<string, DoctorStatus>`, following the same
per-owner-`Record<string, X>` convention already used for `followUpSettingsByUser` and
`bookingTokensByUser`. Absent entry → default `{ online: false, alwaysAcceptAuth: false }`
(matches the backend's default when the fields have never been written).

## Layers

### Domain (pure — `backend.ts`, TDD)
- `doctorStatusForUser(state, doctorID): DoctorStatus` — stored status or the default.
- `setDoctorStatus(state, doctorID, patch: Partial<DoctorStatus>): DemoState` — immutable
  merge onto the existing (or default) status. No validation is possible (plain independent
  booleans), so there is no `BackendError` path here — simpler than the treatment-availability
  mutators.

### Store (`store.tsx`)
- Selector `doctorStatusForUser(doctorID)`.
- Mutator `setDoctorStatus(doctorID, patch)` following the existing mode-branch +
  `applyAndMirror` shape: demo mutates local state; live calls `setOnlineStatus` with the
  merged `{online, alwaysAcceptAuth}` (the callable takes the full pair, not a patch, so the
  mirror sends the post-merge values).

### Live parity
- `hydrate.ts`: extend `readUserProfile`'s existing `users/{uid}` read to also pull
  `onlineStatus`/`alwaysAcceptAuth` (`'online'` string → `online: true`; `alwaysAcceptAuth`
  boolean, default `false`) and return them alongside `followUpSettings`/`bookingToken`;
  `hydrate()` populates `doctorStatusByID[uid]` from it. Zero extra Firestore reads.
- `mirror.ts`: new `mirrorSetOnlineStatus({online, alwaysAcceptAuth})` calling the existing,
  already-deployed `setOnlineStatus` callable — no backend change needed.

### UI (`/app/availability/page.tsx`, `DoctorAvailability`)
A small status card above "Publish a window" on the Authorisation tab: two independent
checkboxes — "I'm online now" and "Always accept authorisation requests" — each calling
`setDoctorStatus` with the single changed field (store merges). Reuses existing card/label
styling. Shown only for the doctor role (nurses don't have this control).

## Testing (TDD — `src/lib/demo/__tests__/doctor-status.test.ts`)
- `doctorStatusForUser`: default shape when absent; stored value wins.
- `setDoctorStatus`: merges a single-field patch without disturbing the other field; merges
  onto the default when no prior status exists; immutability (spread, no mutation).

## Out of scope (deferred, needs a backend PR first)
Nurse-facing discovery of online/always-accept doctors (`listAvailableDoctorsTx` extension)
and the ad-hoc-request UI that consumes it. Consult calls (iOS-native, real-time ringing) —
separate spec requirement, not part of "online status" itself.

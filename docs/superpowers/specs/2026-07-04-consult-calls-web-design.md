# Consult calls (web slice) — design

**Date:** 2026-07-04 · **Spec source:** `~/Documents/AestheticX/openspec/specs/appointments/spec.md`
(requirement: *Consult call launch and incoming-call ringing*; roadmap gap: "consult calls
(iOS-native)").

## Problem

The web app has no consult-call surface at all. The spec requires launching the video consult
"from the authorisation appointment and from the patient-file authorisation request", and the
iOS app implements it fully (CallKit/PushKit ringing + LiveKit video). Gap analysis
(2026-07-04) shows the backend is **already fully deployed and web-usable**:

- `startConsultCall({requestId})` — access-gated to the request's nurse/doctor; writes a
  60-second `consultSignals/{calleeId}` doc (rules: callee may read + delete) and enqueues a
  VoIP push (rings the callee's iPhone); returns `{room, delivered}`.
- `mintCallToken({requestId})` — same access gate; returns a LiveKit HS256 JWT + room
  `req-{requestId}` (2h TTL, publish+subscribe).
- Video is LiveKit Cloud (`wss://aestheticx-5jlv6pgk.livekit.cloud`, hardcoded in iOS
  `LiveCallConfig.url`; the URL is not a secret — tokens gate access). The `livekit-client`
  JS SDK can join the same rooms, so **a real browser↔iPhone video call works today**.
- iOS records the request's doctor to `users/{uid}.lastCalledDoctorId` (client-side Firestore
  update; rules allow own-profile edits) when starting a call — the source for the
  "doctor defaults to most-recently-called" requirement (next increment).

What is genuinely iOS-native and **stays out of scope**: background/lock-screen ringing
(PushKit + CallKit). A web callee only hears a call while the app is open — the in-app
`consultSignals` path, which iOS also uses as its baseline ("clients poll consultSignals
without push; VoIP push layers background ringing on top").

## Change

### Model + pure helpers (`types.ts`, `backend.ts`)

- `lastCalledDoctorByUser: Record<string, string>` on `DemoState` (+ `emptyState`).
- `recordCalledDoctor(state, userID, doctorID)` — immutable set; latest call wins.
- `mostRecentlyCalledDoctor(state, userID): string | null`.
- `src/lib/demo/calls.ts`: `IncomingCall {requestID, room, callerName, patientName?}` +
  `incomingCallFromSignal(data, nowMs): IncomingCall | null` — pure port of iOS
  `IncomingCall.from(payload:)`: requires `kind === "call"` and a `requestId`, falls back to
  room `req-{requestId}`, drops expired signals (`expiresAtMillis <= nowMs`) and malformed
  payloads. Also `callDisplayName(callerName, patientName)` → `"Caller · Patient"` (iOS
  CallKit display parity).

### Store (`store.tsx`)

- `startConsult(requestID, me)` — async. Records the request's doctor as most-recently-called
  (iOS parity: recorded for the *active user* whenever a consult starts, demo + live), then:
  demo → returns a simulated session; live → calls `startConsultCall` then `mintCallToken`,
  returns `{room, token, delivered}`.
- `mostRecentlyCalledDoctor(userID)` selector (used next increment).
- Mirrors (`mirror.ts`): `mirrorRecordCalledDoctor` (merge-write `users/{uid}.lastCalledDoctorId`
  — setDoc merge like `mirrorSetBookingToken`), `mirrorStartConsultCall`, `mirrorMintCallToken`
  (callables).
- Hydrate: `readUserProfile` also reads `lastCalledDoctorId` → `lastCalledDoctorByUser`.

### Call UI (`src/components/app/ConsultCall.tsx`)

- `ConsultCallProvider` (mounted inside the `/app` layout's providers) + `useConsultCall()`:
  `{start(request, counterpartyName, patientName), active}`. Renders:
  - **`CallOverlay`** — fixed full-viewport overlay (Porcelain & Ink: `bg-card`, `border-line`,
    `rounded-card`; ink-on-porcelain header with `callDisplayName`). Live mode: dynamic
    `import("livekit-client")`, `room.connect(LIVEKIT_URL, token)`, enable camera+mic, remote
    track(s) fill the panel, local video as a corner PiP, remote audio auto-attached. Demo
    mode: the same chrome with placeholder tiles, a "Demo mode — video connects on the live
    backend" note, ringing→in-call transition and a call timer. Both: red "End call" button
    (disconnect + teardown on unmount).
  - **`IncomingCallBanner`** (live only) — `onSnapshot(consultSignals/{uid})`; a valid,
    unexpired signal shows a fixed banner: "{caller} · {patient} — incoming consult" with
    **Accept** (delete signal → `mintCallToken(requestId)` → open the overlay) and **Decline**
    (delete signal). The signal doc is deleted on action (callee-consume, per rules comment).
- `delivered === 0` from `startConsultCall` shows a soft in-overlay hint: "Couldn't ring the
  other party — they may be offline." (iOS copy) — the call room stays open (the callee can
  still join from the in-app signal).

### Launch surfaces

- `/app/authorisations`: a "Start consult" button on each row — doctor's pending-request
  cards and the nurse's open-request rows (`counterpartyName` = the other party's name from
  the request; patient name from `patientSummary`/patient row).
- Patient file (`/app/patients/[id]`): the nurse's open requests for that patient listed in
  the Active-authorisations aside with a "Start consult" action (spec: "from the patient-file
  authorisation request").

### Dependency

`livekit-client` (dynamic import — loaded only when a call actually starts/answers, keeping
marketing + app bundles unchanged).

## Demo/live parity

Demo simulates the transport (no LiveKit, no signals — cross-identity ringing can't be
demoed in a single-tab in-memory store anyway) but exercises the same state path
(`recordCalledDoctor`, overlay lifecycle). Live uses only already-deployed backend pieces —
no backend PR.

## Tests

- `calls.test.ts`: `incomingCallFromSignal` — valid payload; room fallback `req-{id}`;
  expired → null; wrong kind / missing requestId → null; `callDisplayName` with/without
  patient.
- `adhoc-auth.test.ts` or new `calls.test.ts` section: `recordCalledDoctor` /
  `mostRecentlyCalledDoctor` — empty → null, set, latest-wins, per-user isolation.

## Out of scope

Background ringing (PushKit/CallKit — iOS-native by definition); doctor-default-to-
most-recently-called picker behaviour (next increment, consumes `mostRecentlyCalledDoctor`);
call quality controls (mute/camera toggles beyond end-call — can follow if wanted).

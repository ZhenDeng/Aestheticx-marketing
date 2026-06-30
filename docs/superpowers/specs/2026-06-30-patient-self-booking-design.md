# Patient Self-Booking — Design (clinician-facing increment)

**Goal:** Give each clinician a personal, shareable booking link + QR code, and a
requests inbox that lists every awaiting-confirmation booking (across all dates) with a
one-tap Confirm. Demo + live parity.

**Scope boundary:** the patient-facing public booking surface is `backend/web/book.html`
(Firebase Hosting) — out of scope here. This increment is the two clinician-facing halves;
the inbox consumes the bookings that surface produces.

**Source of truth (read directly):**
- `/Users/zhendeng/Documents/AestheticX/openspec/specs/patient-self-booking/spec.md`
- `/Users/zhendeng/Documents/AestheticX/AestheticXKit/Sources/AXDomain/BookingLink.swift`
- `/Users/zhendeng/Documents/AestheticX/AestheticXKit/Sources/AXData/InMemoryBackend+SelfBooking.swift`
- `/Users/zhendeng/Documents/AestheticX/AestheticXKit/Sources/AXData/LiveBackend.swift` (`bookingLink` → `users/{uid}.bookingToken`; `confirmAppointment` → `confirmAppointment` callable)
- `/Users/zhendeng/Documents/AestheticX/backend/firestore.rules:224` (appointments read), the deployed `confirmAppointment` Function.
- Existing web pattern: `src/app/app/patients/[id]/consent/remote/page.tsx` (URL + copy + `qrcode` QR).

## Model

```ts
interface BookingLink { userID: string; token: string }
const BOOKING_HOST = "https://aestheticx-91e6b.web.app/u/";
function bookingLinkUrl(token: string): string;   // BOOKING_HOST + token
```

`DemoState` gains `bookingTokensByUser: Record<string, string>` (+ `emptyState()`).

## Layers

### Domain (pure, `backend.ts`)
- `bookingTokenForUser(state, userID): string | undefined`.
- `mintBookingToken(state, identity): { state, token }` — if a token already exists, return it
  unchanged (stable); else `makeID("bk")`, store under `identity.user.id`.
- `pendingBookings(state, ownerID): Appointment[]` — `status === "awaitingConfirmation"` and
  `ownerID` match, sorted by `dateISO` then `startMinute` (all dates, earliest first).
- `confirmAppointment(state, id, identity): DemoState` — the appointment must exist
  (`BackendError("notFound")`) and the caller must own its calendar
  (`appointmentOwnerScope(identity)` = clinic id in a clinic context, else user id; else
  `BackendError("notPermitted")`); set `status: "confirmed"`.

### Live parity
- **Mirror** (`mirror.ts`): `mirrorSetBookingToken(uid, token)` → `updateDoc users/{uid} {bookingToken}`;
  `mirrorConfirmAppointment(id)` → `httpsCallable("confirmAppointment")({ appointmentId: id })`.
- **Hydrate** (`hydrate.ts`): read `bookingToken` off the `users/{uid}` doc (extend the existing
  `readUser…` single-doc read) into `bookingTokensByUser[uid]`.

### Store (`store.tsx`)
- Reads: `bookingTokenForUser(userID)`, `pendingBookings(ownerID)`.
- Actions: `ensureBookingToken(identity)` (mint+persist if absent, via `applyAndMirror`);
  `confirmAppointment(id, identity)` (via `applyAndMirror` + `mirrorConfirmAppointment`).

### UI — `/app/bookings` (new nav tab)
- **Your booking link**: on mount, if no token, call `ensureBookingToken`. Show the URL +
  Copy + a QR (`qrcode` dynamic import, same as the remote-signing page). In demo, a small
  "demo link" note (the live surface resolves the token server-side).
- **Pending booking requests**: `pendingBookings(ownerScope)` listed (name + date + time) each
  with a **Confirm** button; confirming flips status and drops it from the list. Owner scope =
  clinic id in a clinic context, else the user id (matches the calendar).

### Seed (`seed.ts`)
- Seed a `bookingToken` for `u-voss` and one `awaitingConfirmation` booking on a **future**
  date for `u-voss`, so the link and the inbox are both demonstrable.

## Data flow
- **Demo:** pure reducers; seeded token + pending booking.
- **Live:** token on `users/{uid}` (mirror update, hydrate read); confirm via the deployed
  `confirmAppointment` callable; appointments already hydrate so pending ones appear.

## Error handling
Own-only/`notFound` throw `BackendError`; live failures surface via `lastSyncError` → `AppShell`.

## Testing (TDD)
- `self-booking.test.ts` — `bookingLinkUrl`; `mintBookingToken` (stable per user, distinct
  across users, idempotent); `pendingBookings` (status+owner filter, all-dates ordering);
  `confirmAppointment` (owner-only reject, status flip, not-found).
- hydrate of `bookingToken` (extend the hydrate fixture/assertions).
- Demo smoke: `/app/bookings` shows link + QR; the seeded pending booking confirms and leaves
  the inbox.

## Out of scope (deferred)
- The public booking surface (`book.html`), self-booking availability computation, and
  Google/external-calendar reconciliation (the spec marks these incremental / server-side).
- Reschedule and decline from the inbox (the spec's "MAY"); confirm is the SHALL.

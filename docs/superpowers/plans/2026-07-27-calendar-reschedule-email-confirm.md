# Calendar Reschedule Email Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the calendar from emailing the client on every drag; instead apply the move immediately and ask the practitioner, once per move, whether to send the "your appointment moved" email.

**Architecture:** The backend callable `rescheduleAppointment` gains a `notifyClient` flag (defaulting to `true` so the deployed iOS app is unaffected); the web always sends `false`. A new callable `notifyAppointmentRescheduled` sends the email on demand. On the web, a small provider component owns a single "pending prompt" and renders the modal; every reschedule call site in the calendar page tells it which appointment just moved.

**Tech Stack:** TypeScript. Backend: Firebase Cloud Functions v2 (`firebase-functions/v2/https`), firebase-admin Firestore, Vitest (unit + emulator integration). Web: Next.js 16 App Router, React 19, Vitest + @testing-library/react.

## Global Constraints

- **Two repos.** Backend work happens in `/Users/zhendeng/Documents/AestheticX/backend/functions`. Web work happens in this worktree (`/Users/zhendeng/Documents/Aestheticx-marketing/.claude/worktrees/platform-admin-permission-denied-ac5727`). Commit separately in each — they are independent git repositories.
- **Deploy order is backend first, then web.** The web sends `notifyClient: false` to a callable that must already understand it, and calls `notifyAppointmentRescheduled`, which must already exist. Shipping web first would email on every drag *and* break the Send button with `not-found` — and it would make **"Don't send" a lie**, since the old callable has already emailed the client unconditionally by the time the practitioner sees the prompt.
- **`notifyClient` defaults to `true`** on the backend. iOS does not send the field and must keep its current auto-email behaviour.
- **Region is automatic.** `index.ts` imports `./globalOptions` before every function module, which pins `australia-southeast1`. A new `onCall` in `appointmentsFn.ts` inherits it — do not add a per-function region.
- **No `console.log`** in production code. `console.error` in a swallowing catch is the established idiom and is fine.
- **Immutability:** use spread for updates; never mutate a parameter.
- **Backend unit tests are emulator-free** (`src/*.test.ts`, run by `npm test`). Tests that need Firestore go in `src/*.integration.ts` and run under `npm run test:integration`. Anything touching `mailOutbox` or `appointments` documents is an integration test.
- **Commit message format:** `<type>: <description>` — `feat`, `fix`, `refactor`, `docs`, `test`, `chore`.

---

## File Structure

**Backend** (`/Users/zhendeng/Documents/AestheticX/backend/functions`)

| File | Responsibility |
|------|----------------|
| `src/appointmentsFn.ts` (modify) | `notifyBookingClient` becomes exported and database-injectable; new `rescheduleAndNotify` and `notifyRescheduledTx` testable cores; `rescheduleAppointment` gains the flag; new `notifyAppointmentRescheduled` callable |
| `src/index.ts` (modify) | Export the new callable |
| `src/rescheduleNotify.integration.ts` (create) | Emulator tests for the notify gating and the new callable's core |

**Web** (this worktree)

| File | Responsibility |
|------|----------------|
| `src/lib/firebase/mirror.ts` (modify) | `mirrorRescheduleAppointment` gains a required `notifyClient` param; new `mirrorNotifyAppointmentRescheduled` |
| `src/lib/demo/store.tsx` (modify) | Reschedule always mirrors `notifyClient: false`; new `notifyAppointmentRescheduled` store action |
| `src/components/app/RescheduleNotify.tsx` (create) | Provider owning the pending prompt + the modal itself. Self-contained: nothing else needs to know the prompt exists |
| `src/app/app/calendar/page.tsx` (modify) | Wrap the page in the provider; every reschedule call site raises the prompt |
| `src/components/app/__tests__/reschedule-notify.test.tsx` (create) | Dialog behaviour in isolation |
| `src/lib/demo/__tests__/reschedule-notify-store.test.tsx` (create) | Live-mode mirror wiring |
| `src/app/app/calendar/__tests__/calendar-reschedule-notify.test.tsx` (create) | End-to-end: real CalendarPage, real store, demo seed |

The provider/context shape exists so `page.tsx` (already ~73 KB) does not grow another stateful concern, and so the block components — `TimelineBlock`, `WeekBlock`, `MonthChip` — can raise the prompt without `DayView`/`WeekView`/`MonthView` threading a prop they have no interest in.

---

# Phase A — Backend

Work in `/Users/zhendeng/Documents/AestheticX/backend/functions`. All backend paths below are relative to that directory.

### Task 1: Gate the reschedule email behind a `notifyClient` flag

**Files:**
- Modify: `src/appointmentsFn.ts` (`notifyBookingClient` at ~588, its three call sites at ~568/717/741, `rescheduleAppointment` at ~550)
- Test: `src/rescheduleNotify.integration.ts` (create)

**Interfaces:**
- Consumes: existing `rescheduleTx(database, {appointmentId, caller, clinics, dateISO, startMinute, durationMinutes?}) => Promise<boolean>`, `BookingError`, `clientEmailFor`, `bookingEmail`, `calendarName`.
- Produces:
  - `notifyBookingClient(database: Firestore, appointmentId: string, action: BookingAction): Promise<boolean>` — exported; returns whether a `mailOutbox` doc was written.
  - `rescheduleAndNotify(database: Firestore, p: { appointmentId: string; caller: string; clinics: Record<string, string>; dateISO: string; startMinute: number; durationMinutes?: number; notifyClient: boolean }): Promise<{ moved: boolean; notified: boolean }>` — exported.

- [ ] **Step 1: Write the failing test**

Create `src/rescheduleNotify.integration.ts`:

```ts
/**
 * Emulator integration tests (2026-07-27): the reschedule email is opt-in.
 * Dragging a calendar block used to email the client on every commit; the web now
 * reschedules with notifyClient:false and sends the email through a separate call.
 * Run under the emulator:
 *   firebase emulators:exec --only firestore \
 *     'vitest run --config vitest.integration.config.ts src/rescheduleNotify.integration.ts'
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { deleteApp, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { rescheduleAndNotify } from './appointmentsFn'

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-aestheticx'

const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT }, 'reschedule-notify')
const db = getFirestore(app)

const OWNER = 'u-voss'
const APPT = 'appt-reschedule-notify'

async function clear(collection: string): Promise<void> {
  const snap = await db.collection(collection).get()
  await Promise.all(snap.docs.map((d) => d.ref.delete()))
}

/** A treatment appointment with a lead email, owned by OWNER. No availability doc is
 *  seeded: violatesAvailability treats an empty window list as "no restriction". */
async function seedAppointment(): Promise<void> {
  await db.collection('appointments').doc(APPT).set({
    ownerType: 'user', ownerId: OWNER, type: 'treatment', status: 'confirmed',
    dateISO: '2026-08-03', startMinute: 540, endMinute: 600,
    patientId: null, patientName: null,
    lead: { givenName: 'Anna', lastName: 'Chen', email: 'anna@example.com' },
  })
}

async function outboxCount(): Promise<number> {
  return (await db.collection('mailOutbox').get()).size
}

beforeEach(async () => {
  await Promise.all(['appointments', 'mailOutbox', 'availability', 'patients'].map(clear))
  await seedAppointment()
})
afterAll(async () => { await deleteApp(app) })

describe('rescheduleAndNotify', () => {
  const base = {
    appointmentId: APPT, caller: OWNER, clinics: {},
    dateISO: '2026-08-03', startMinute: 600,
  }

  it('moves without emailing when notifyClient is false', async () => {
    const r = await rescheduleAndNotify(db, { ...base, notifyClient: false })
    expect(r).toEqual({ moved: true, notified: false })
    const appt = await db.collection('appointments').doc(APPT).get()
    expect(appt.get('startMinute')).toBe(600)
    expect(await outboxCount()).toBe(0)
  })

  it('moves and emails when notifyClient is true', async () => {
    const r = await rescheduleAndNotify(db, { ...base, notifyClient: true })
    expect(r).toEqual({ moved: true, notified: true })
    expect(await outboxCount()).toBe(1)
    const mail = (await db.collection('mailOutbox').get()).docs[0]
    expect(mail.get('to')).toBe('anna@example.com')
    expect(mail.get('status')).toBe('queued')
  })

  it('does not email when the move is a no-op, even with notifyClient true', async () => {
    const r = await rescheduleAndNotify(db, { ...base, startMinute: 540, notifyClient: true })
    expect(r).toEqual({ moved: false, notified: false })
    expect(await outboxCount()).toBe(0)
  })

  it('reports notified:false when there is no client email to send to', async () => {
    await db.collection('appointments').doc(APPT).update({ lead: null })
    const r = await rescheduleAndNotify(db, { ...base, notifyClient: true })
    expect(r).toEqual({ moved: true, notified: false })
    expect(await outboxCount()).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/zhendeng/Documents/AestheticX/backend/functions && npx firebase emulators:exec --only firestore 'npx vitest run --config vitest.integration.config.ts src/rescheduleNotify.integration.ts'
```

Expected: FAIL — `rescheduleAndNotify` is not exported from `./appointmentsFn`.

- [ ] **Step 3: Make `notifyBookingClient` exported, database-injectable, and reporting**

In `src/appointmentsFn.ts`, replace the private `notifyBookingClient` (around line 588) with:

```ts
/**
 * Best-effort client notification after a booking action (calendar approve /
 * reschedule / decline). Email only — the mailOutbox → Resend pipeline is already
 * deployed and free per message (see bookingNotify.ts). Recipient: the lead's email,
 * else the linked patient's. Never throws: a notification failure must not fail the
 * booking action that already committed. Returns whether a message was queued —
 * callers surface that so the UI can say "no contact on file" honestly.
 */
export async function notifyBookingClient(
  database: Firestore, appointmentId: string, action: BookingAction,
): Promise<boolean> {
  try {
    const snap = await database.collection('appointments').doc(appointmentId).get()
    if (!snap.exists) return false
    const d = snap.data() as {
      lead?: { givenName?: string; lastName?: string; email?: string } | null
      patientId?: string | null; patientName?: string | null
      dateISO?: string; startMinute?: number; endMinute?: number
    }
    let patientEmail: string | null = null
    let patientName = ''
    if (d.patientId) {
      const patient = await database.collection('patients').doc(d.patientId).get()
      if (patient.exists) {
        patientEmail = typeof patient.get('email') === 'string' ? patient.get('email') : null
        patientName = calendarName(patient.data() as { preferredName?: string; givenName?: string; lastName?: string })
      }
    }
    const to = clientEmailFor(d, patientEmail)
    if (!to) return false // nothing to send to — e.g. staff-created appointment with no contact
    const name = [d.lead?.givenName, d.lead?.lastName].filter(Boolean).join(' ') || d.patientName || patientName
    const { subject, body } = bookingEmail(action, {
      name, dateISO: d.dateISO ?? '', startMinute: d.startMinute ?? 0, endMinute: d.endMinute ?? 0,
    })
    await database.collection('mailOutbox').add({
      to, subject, body, senderUid: null, status: 'queued', createdAt: FieldValue.serverTimestamp(),
    })
    return true
  } catch (error) {
    console.error('booking notification failed (action continues):', error)
    return false
  }
}
```

Then update its three existing call sites to pass `db()`:

- ~line 568 (inside `rescheduleAppointment`) — this line is replaced wholesale in Step 4, skip it here.
- ~line 717: `if (changed) await notifyBookingClient(db(), appointmentId, 'confirmed')`
- ~line 741: `if (changed && status === 'cancelled') await notifyBookingClient(db(), appointmentId, 'cancelled')`

- [ ] **Step 4: Add the `rescheduleAndNotify` core and rewire the callable**

Immediately after `rescheduleTx` in `src/appointmentsFn.ts`, add:

```ts
/**
 * Reschedule + the client email as one testable unit. The email is OPT-IN
 * (2026-07-27): dragging a calendar block used to email on every commit, so the
 * web now passes notifyClient:false and offers the practitioner a Send button
 * that calls notifyAppointmentRescheduled instead. A no-op move never emails,
 * regardless of the flag.
 */
export async function rescheduleAndNotify(database: Firestore, p: {
  appointmentId: string
  caller: string
  clinics: Record<string, string>
  dateISO: string
  startMinute: number
  durationMinutes?: number
  notifyClient: boolean
}): Promise<{ moved: boolean; notified: boolean }> {
  const moved = await rescheduleTx(database, p)
  const notified = moved && p.notifyClient
    ? await notifyBookingClient(database, p.appointmentId, 'rescheduled')
    : false
  return { moved, notified }
}
```

Replace the body of the `rescheduleAppointment` callable (around line 550) with:

```ts
/**
 * Clinician drags an appointment to a new slot; duration preserved unless durationMinutes
 * is given. `notifyClient` defaults to TRUE so the deployed iOS app — which does not send
 * the field — keeps emailing on reschedule. The web always sends it explicitly.
 */
export const rescheduleAppointment = onCall(async (event) => {
  const caller = uid(event.auth)
  const startMinute = Number(event.data?.startMinute)
  const dateISO = String(event.data?.dateISO ?? '')
  const rawDuration = Number(event.data?.durationMinutes)
  const durationMinutes = Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : undefined
  const notifyClient = event.data?.notifyClient !== false
  if (!dateISO || !Number.isFinite(startMinute)) {
    throw new HttpsError('invalid-argument', 'dateISO and startMinute required.')
  }
  const appointmentId = String(event.data?.appointmentId ?? '')
  let result = { moved: false, notified: false }
  try {
    result = await rescheduleAndNotify(db(), {
      appointmentId,
      caller, clinics: clinicsOf(event.auth), dateISO, startMinute, durationMinutes, notifyClient,
    })
  } catch (error) { mapStatusError(error) }
  return { ok: true, ...result }
})
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd /Users/zhendeng/Documents/AestheticX/backend/functions && npx firebase emulators:exec --only firestore 'npx vitest run --config vitest.integration.config.ts src/rescheduleNotify.integration.ts'
```

Expected: PASS — 4 tests.

- [ ] **Step 6: Verify nothing else regressed**

```bash
cd /Users/zhendeng/Documents/AestheticX/backend/functions && npm test && npm run build
```

Expected: the full unit suite passes and `tsc` reports no errors. If `tsc` complains about the `notifyBookingClient` call sites, one of the three was missed in Step 3 — it now needs a `db()` first argument.

- [ ] **Step 7: Commit**

```bash
cd /Users/zhendeng/Documents/AestheticX/backend && git add functions/src/appointmentsFn.ts functions/src/rescheduleNotify.integration.ts && git commit -m "feat(appointments): notifyClient flag — reschedule no longer always emails the client"
```

---

### Task 2: `notifyAppointmentRescheduled` callable

**Files:**
- Modify: `src/appointmentsFn.ts` (add after `rescheduleAppointment`)
- Modify: `src/index.ts:63-65` (the `./appointmentsFn` export block)
- Test: `src/rescheduleNotify.integration.ts` (extend)

**Interfaces:**
- Consumes: `notifyBookingClient(database, appointmentId, action)` and `rescheduleAndNotify` from Task 1; existing `canManageAppointment(snap, caller, clinics)`, `isAuthSlotBooker(snap, caller, clinics)`, `BookingError`, `mapStatusError`, `clinicsOf`, `uid`.
- Produces:
  - `notifyRescheduledTx(database: Firestore, p: { appointmentId: string; caller: string; clinics: Record<string, string> }): Promise<boolean>` — exported.
  - Callable `notifyAppointmentRescheduled({ appointmentId })` returning `{ ok: true, sent: boolean }`. The web calls this as `mirrorNotifyAppointmentRescheduled` in Task 3.

- [ ] **Step 1: Write the failing test**

Append to `src/rescheduleNotify.integration.ts`, and add `notifyRescheduledTx` and `BookingError` to the import from `./appointmentsFn` at the top of the file:

```ts
describe('notifyRescheduledTx', () => {
  const base = { appointmentId: APPT, caller: OWNER, clinics: {} }

  it('queues one email describing the appointment as currently stored', async () => {
    await db.collection('appointments').doc(APPT).update({ startMinute: 600, endMinute: 660 })
    expect(await notifyRescheduledTx(db, base)).toBe(true)
    const mail = (await db.collection('mailOutbox').get()).docs[0]
    expect(mail.get('to')).toBe('anna@example.com')
    expect(mail.get('body')).toContain('10:00')
  })

  it('rejects a caller who does not own the appointment', async () => {
    await expect(notifyRescheduledTx(db, { ...base, caller: 'someone-else' }))
      .rejects.toBeInstanceOf(BookingError)
    expect(await outboxCount()).toBe(0)
  })

  it('rejects an appointment that does not exist', async () => {
    await expect(notifyRescheduledTx(db, { ...base, appointmentId: 'no-such-appt' }))
      .rejects.toBeInstanceOf(BookingError)
  })

  it('reports false without throwing when there is no client email', async () => {
    await db.collection('appointments').doc(APPT).update({ lead: null })
    expect(await notifyRescheduledTx(db, base)).toBe(false)
    expect(await outboxCount()).toBe(0)
  })
})
```

Note on the `'10:00'` assertion: `bookingEmail` formats `startMinute` 600 as a wall-clock time. Run the test and read the actual body if the format differs from `HH:MM` — adjust the expected substring to whatever `bookingEmail` in `src/bookingNotify.ts` actually produces rather than changing the production code.

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/zhendeng/Documents/AestheticX/backend/functions && npx firebase emulators:exec --only firestore 'npx vitest run --config vitest.integration.config.ts src/rescheduleNotify.integration.ts'
```

Expected: FAIL — `notifyRescheduledTx` is not exported.

- [ ] **Step 3: Implement the core and the callable**

In `src/appointmentsFn.ts`, immediately after the `rescheduleAppointment` callable:

```ts
/**
 * Send the "your appointment moved" email on demand (2026-07-27). The web reschedules
 * with notifyClient:false and calls this only when the practitioner taps Send, so the
 * permission gate here must match rescheduleTx's exactly. Returns whether a message was
 * queued — false means the appointment has no client email on file, which is not an error.
 * Throws BookingError('not-found' | 'forbidden').
 */
export async function notifyRescheduledTx(database: Firestore, p: {
  appointmentId: string
  caller: string
  clinics: Record<string, string>
}): Promise<boolean> {
  const snap = await database.collection('appointments').doc(p.appointmentId).get()
  if (!snap.exists) throw new BookingError('not-found')
  if (!canManageAppointment(snap, p.caller, p.clinics) && !isAuthSlotBooker(snap, p.caller, p.clinics)) {
    throw new BookingError('forbidden')
  }
  return notifyBookingClient(database, p.appointmentId, 'rescheduled')
}

/** The practitioner confirmed the reschedule email from the calendar's Notify dialog. */
export const notifyAppointmentRescheduled = onCall(async (event) => {
  const caller = uid(event.auth)
  const appointmentId = String(event.data?.appointmentId ?? '')
  if (!appointmentId) throw new HttpsError('invalid-argument', 'appointmentId required.')
  let sent = false
  try {
    sent = await notifyRescheduledTx(db(), { appointmentId, caller, clinics: clinicsOf(event.auth) })
  } catch (error) { mapStatusError(error) }
  return { ok: true, sent }
})
```

- [ ] **Step 4: Export it from `index.ts`**

In `src/index.ts`, extend the `./appointmentsFn` export block (line ~64):

```ts
  rescheduleAppointment, notifyAppointmentRescheduled, syncExternalBusy, recordExternalCalendarRef,
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd /Users/zhendeng/Documents/AestheticX/backend/functions && npx firebase emulators:exec --only firestore 'npx vitest run --config vitest.integration.config.ts src/rescheduleNotify.integration.ts' && npm test && npm run build
```

Expected: 8 integration tests pass, the unit suite passes, `tsc` clean.

- [ ] **Step 6: Commit**

```bash
cd /Users/zhendeng/Documents/AestheticX/backend && git add functions/src/appointmentsFn.ts functions/src/index.ts functions/src/rescheduleNotify.integration.ts && git commit -m "feat(appointments): notifyAppointmentRescheduled callable — send the move email on demand"
```

---

# Phase B — Web

Work in this worktree. All web paths are relative to it.

### Task 3: Mirror and store plumbing

**Files:**
- Modify: `src/lib/firebase/mirror.ts:281-283`
- Modify: `src/lib/demo/store.tsx` (context type ~117, `rescheduleAppointment` ~739)
- Test: `src/lib/demo/__tests__/reschedule-notify-store.test.tsx` (create)

**Interfaces:**
- Consumes: the Task 2 callable `notifyAppointmentRescheduled({ appointmentId })`; existing `runLiveWrite`, `applyAndMirror`, `syncErrorMessage`.
- Produces:
  - `mirrorRescheduleAppointment(id: string, dateISO: string, startMinute: number, durationMinutes: number, notifyClient: boolean): Promise<void>`
  - `mirrorNotifyAppointmentRescheduled(id: string): Promise<void>`
  - Store action `notifyAppointmentRescheduled(id: string): void` on the `useDemoStore()` context. Task 4's dialog calls it.

- [ ] **Step 1: Write the failing test**

Create `src/lib/demo/__tests__/reschedule-notify-store.test.tsx`:

```tsx
// The calendar's reschedule email is opt-in (2026-07-27): a drag mirrors with
// notifyClient:false, and the Notify dialog's Send button is a separate callable.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { emptyState } from "@/lib/demo/backend";
import { DEMO_ACCOUNTS } from "@/lib/demo/accounts";
import type { Appointment } from "@/lib/demo/types";

const VOSS = DEMO_ACCOUNTS[2].identities[0]; // Dr Elena Voss — owner id u-voss

const APPT: Appointment = {
  id: "a-live-1", ownerID: VOSS.user.id, type: "treatment", status: "confirmed",
  dateISO: "2026-08-03", startMinute: 540, endMinute: 600,
  patientName: "Anna Chen",
};

vi.mock("@/lib/firebase/client", () => ({ isFirebaseConfigured: () => true }));
vi.mock("@/lib/firebase/auth", () => ({
  watchUser: (cb: (u: unknown) => void) => { cb({ uid: VOSS.user.id }); return () => {}; },
  identitiesForUser: async () => [VOSS],
  mustChangePasswordForUser: async () => false,
  currentUserUid: () => VOSS.user.id,
  watchClaimsRevision: () => () => {},
}));
vi.mock("@/lib/firebase/hydrate", () => ({
  hydrate: vi.fn(async () => ({ ...emptyState(), appointments: { [APPT.id]: APPT } })),
}));

const mirrorRescheduleAppointment = vi.hoisted(() => vi.fn(async () => {}));
const mirrorNotifyAppointmentRescheduled = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/firebase/mirror", () => ({ mirrorRescheduleAppointment, mirrorNotifyAppointmentRescheduled }));

import { DemoStoreProvider, useDemoStore } from "@/lib/demo/store";
import { DemoAuthProvider } from "@/lib/demo/auth";

function wrapper({ children }: { children: ReactNode }) {
  return <DemoAuthProvider><DemoStoreProvider>{children}</DemoStoreProvider></DemoAuthProvider>;
}

describe("reschedule notification wiring (live)", () => {
  beforeEach(() => {
    mirrorRescheduleAppointment.mockClear();
    mirrorNotifyAppointmentRescheduled.mockClear();
  });

  it("reschedule mirrors with notifyClient:false and sends no email", async () => {
    const { result } = renderHook(() => useDemoStore(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => { result.current.rescheduleAppointment(APPT.id, "2026-08-03", 600, 60, VOSS); });
    await waitFor(() => expect(mirrorRescheduleAppointment).toHaveBeenCalledWith(APPT.id, "2026-08-03", 600, 60, false));
    expect(mirrorNotifyAppointmentRescheduled).not.toHaveBeenCalled();
  });

  it("notifyAppointmentRescheduled calls its own callable with the appointment id", async () => {
    const { result } = renderHook(() => useDemoStore(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => { result.current.notifyAppointmentRescheduled(APPT.id); });
    await waitFor(() => expect(mirrorNotifyAppointmentRescheduled).toHaveBeenCalledWith(APPT.id));
    expect(mirrorRescheduleAppointment).not.toHaveBeenCalled();
  });
});
```

If `Appointment` requires fields beyond those in `APPT`, read `src/lib/demo/types.ts` and add the required ones — do not loosen the type with `as unknown as Appointment`.

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/lib/demo/__tests__/reschedule-notify-store.test.tsx
```

Expected: FAIL — `result.current.notifyAppointmentRescheduled is not a function`, and the reschedule assertion fails on arity (4 args, not 5).

- [ ] **Step 3: Update the mirror**

In `src/lib/firebase/mirror.ts`, replace `mirrorRescheduleAppointment` (line ~281) and add the new mirror below it:

```ts
// `notifyClient` is REQUIRED, not optional: the calendar reschedules silently and offers a
// separate Send button (2026-07-27), so a new call site must state its intent rather than
// silently inherit the backend's iOS-preserving `true` default.
export async function mirrorRescheduleAppointment(
  id: string, dateISO: string, startMinute: number, durationMinutes: number, notifyClient: boolean,
): Promise<void> {
  await httpsCallable(functions(), "rescheduleAppointment")({
    appointmentId: id, dateISO, startMinute, durationMinutes, notifyClient,
  });
}
export async function mirrorNotifyAppointmentRescheduled(id: string): Promise<void> {
  await httpsCallable(functions(), "notifyAppointmentRescheduled")({ appointmentId: id });
}
```

- [ ] **Step 4: Update the store**

In `src/lib/demo/store.tsx`, add to the context interface, directly under the `rescheduleAppointment` line (~117):

```ts
  /** Send the "your appointment moved" email for an already-committed reschedule. No-op in demo. */
  notifyAppointmentRescheduled: (id: string) => void;
```

Change the `rescheduleAppointment` implementation (~739) so the mirror passes the flag:

```ts
      rescheduleAppointment: (id, dateISO, startMinute, durationMinutes, identity) => {
        backend.rescheduleAppointment(state, id, dateISO, startMinute, durationMinutes, identity); // eager validate — throws
        applyAndMirror(
          (s) => backend.rescheduleAppointment(s, id, dateISO, startMinute, durationMinutes, identity),
          // notifyClient:false — the calendar asks the practitioner and sends separately.
          (m) => m.mirrorRescheduleAppointment(id, dateISO, startMinute, durationMinutes, false),
        );
      },
      notifyAppointmentRescheduled: (id) => {
        if (!live) return; // demo has no mail pipeline — the dialog still opens and closes
        runLiveWrite(async () => {
          try { const m = await import("@/lib/firebase/mirror"); await m.mirrorNotifyAppointmentRescheduled(id); }
          catch (e) { setLastSyncError(syncErrorMessage(e)); }
        });
      },
```

No `setRefreshTick` — sending an email changes no record the UI displays.

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx vitest run src/lib/demo/__tests__/reschedule-notify-store.test.tsx
```

Expected: PASS — 2 tests.

- [ ] **Step 6: Check nothing else called the old mirror signature**

```bash
grep -rn "mirrorRescheduleAppointment" src && npx tsc --noEmit
```

Expected: only the definition in `mirror.ts` and the one call in `store.tsx`; `tsc` clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/firebase/mirror.ts src/lib/demo/store.tsx src/lib/demo/__tests__/reschedule-notify-store.test.tsx
git commit -m "feat(calendar): reschedule stops auto-emailing; add an on-demand notify action"
```

---

### Task 4: The Notify dialog

**Files:**
- Create: `src/components/app/RescheduleNotify.tsx`
- Test: `src/components/app/__tests__/reschedule-notify.test.tsx`

**Interfaces:**
- Consumes: `useDemoStore()` (for `state.appointments`, `state.patients`, and `notifyAppointmentRescheduled` from Task 3); `appointmentContact(appt, patient)` and `appointmentChipTitle(state, appt, fallback)` from `@/lib/demo/backend`.
- Produces:
  - `<RescheduleNotifyProvider>{children}</RescheduleNotifyProvider>` — renders children plus, when a prompt is pending, the modal.
  - `useRescheduleNotify(): (apptID: string) => void` — Task 5's call sites invoke this after every successful reschedule.

- [ ] **Step 1: Write the failing test**

Create `src/components/app/__tests__/reschedule-notify.test.tsx`:

```tsx
// The calendar no longer emails on every drag (2026-07-27). A move commits immediately and
// this dialog asks whether to tell the client. Driven through the real demo store so the
// dialog's contact resolution and copy are exercised, not stubbed.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { emptyState } from "@/lib/demo/backend";
import { DEMO_ACCOUNTS } from "@/lib/demo/accounts";
import type { Appointment } from "@/lib/demo/types";

const VOSS = DEMO_ACCOUNTS[2].identities[0];

const WITH_EMAIL: Appointment = {
  id: "a-email", ownerID: VOSS.user.id, type: "treatment", status: "confirmed",
  dateISO: "2026-08-03", startMinute: 600, endMinute: 660,
  lead: { givenName: "Anna", lastName: "Chen", email: "anna@example.com" },
};
const NO_EMAIL: Appointment = {
  id: "a-blocked", ownerID: VOSS.user.id, type: "treatment", status: "confirmed",
  dateISO: "2026-08-03", startMinute: 540, endMinute: 600,
};

vi.mock("@/lib/firebase/client", () => ({ isFirebaseConfigured: () => false }));

const notifySpy = vi.hoisted(() => vi.fn());
vi.mock("@/lib/demo/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/demo/store")>();
  return {
    ...actual,
    useDemoStore: () => ({
      ...actual.useDemoStore(),
      state: { ...emptyState(), appointments: { [WITH_EMAIL.id]: WITH_EMAIL, [NO_EMAIL.id]: NO_EMAIL } },
      notifyAppointmentRescheduled: notifySpy,
    }),
  };
});

import { DemoStoreProvider } from "@/lib/demo/store";
import { RescheduleNotifyProvider, useRescheduleNotify } from "@/components/app/RescheduleNotify";

// A button that raises the prompt for a given appointment, standing in for a drag commit.
function Trigger({ apptID }: { apptID: string }) {
  const prompt = useRescheduleNotify();
  return <button onClick={() => prompt(apptID)}>__moved_{apptID}__</button>;
}

function Harness({ children }: { children: ReactNode }) {
  return <DemoStoreProvider><RescheduleNotifyProvider>{children}</RescheduleNotifyProvider></DemoStoreProvider>;
}

describe("RescheduleNotify dialog", () => {
  beforeEach(() => { notifySpy.mockClear(); });

  it("does not render until a move raises it", () => {
    render(<Harness><Trigger apptID={WITH_EMAIL.id} /></Harness>);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("names the client and the new time, and sends on Send email", async () => {
    const user = userEvent.setup();
    render(<Harness><Trigger apptID={WITH_EMAIL.id} /></Harness>);
    await user.click(screen.getByRole("button", { name: "__moved_a-email__" }));
    const dialog = await screen.findByRole("dialog", { name: /notify the client/i });
    expect(dialog).toHaveTextContent("Anna Chen");
    expect(dialog).toHaveTextContent("10:00");
    await user.click(screen.getByRole("button", { name: /send email/i }));
    expect(notifySpy).toHaveBeenCalledWith(WITH_EMAIL.id);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes without sending on Don't send", async () => {
    const user = userEvent.setup();
    render(<Harness><Trigger apptID={WITH_EMAIL.id} /></Harness>);
    await user.click(screen.getByRole("button", { name: "__moved_a-email__" }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: /don't send/i }));
    expect(notifySpy).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes without sending on Escape", async () => {
    const user = userEvent.setup();
    render(<Harness><Trigger apptID={WITH_EMAIL.id} /></Harness>);
    await user.click(screen.getByRole("button", { name: "__moved_a-email__" }));
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    expect(notifySpy).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("offers only OK, and sends nothing, when there is no client contact", async () => {
    const user = userEvent.setup();
    render(<Harness><Trigger apptID={NO_EMAIL.id} /></Harness>);
    await user.click(screen.getByRole("button", { name: "__moved_a-blocked__" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/no client contact on file/i);
    expect(screen.queryByRole("button", { name: /send email/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^ok$/i }));
    expect(notifySpy).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps a single dialog when a second move arrives first", async () => {
    const user = userEvent.setup();
    render(<Harness><Trigger apptID={WITH_EMAIL.id} /><Trigger apptID={NO_EMAIL.id} /></Harness>);
    await user.click(screen.getByRole("button", { name: "__moved_a-email__" }));
    await user.click(screen.getByRole("button", { name: "__moved_a-blocked__" }));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog")).toHaveTextContent(/no client contact on file/i);
  });

  it("closes itself if the appointment disappears", async () => {
    const user = userEvent.setup();
    render(<Harness><Trigger apptID="a-deleted" /></Harness>);
    await user.click(screen.getByRole("button", { name: "__moved_a-deleted__" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/components/app/__tests__/reschedule-notify.test.tsx
```

Expected: FAIL — cannot resolve `@/components/app/RescheduleNotify`.

- [ ] **Step 3: Implement the component**

Create `src/components/app/RescheduleNotify.tsx`:

```tsx
"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useDemoStore } from "@/lib/demo/store";
import { appointmentChipTitle, appointmentContact } from "@/lib/demo/backend";
import type { Appointment } from "@/lib/demo/types";

// 27/07 feedback: dragging a block used to email the client on EVERY commit — nudging a
// block into place sent the client a run of "your appointment moved" emails. The move now
// commits silently (store.rescheduleAppointment mirrors notifyClient:false) and this asks,
// once, whether to tell them. One prompt at a time: a second move replaces the first rather
// than queueing a backlog of modals, which would be the same friction in a different shape.

const RescheduleNotifyContext = createContext<(apptID: string) => void>(() => {});

/** Raise the "notify the client?" prompt for an appointment that just moved. */
export function useRescheduleNotify(): (apptID: string) => void {
  return useContext(RescheduleNotifyContext);
}

export function RescheduleNotifyProvider({ children }: { children: ReactNode }) {
  const [apptID, setApptID] = useState<string | null>(null);
  // Stable across renders so call sites can hold it in a dependency array.
  const prompt = useCallback((id: string) => setApptID(id), []);
  return (
    <RescheduleNotifyContext.Provider value={prompt}>
      {children}
      {apptID && <RescheduleNotifyDialog apptID={apptID} onClose={() => setApptID(null)} />}
    </RescheduleNotifyContext.Provider>
  );
}

function timeLabel(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

function movedLine(state: ReturnType<typeof useDemoStore>["state"], appt: Appointment): string {
  const title = appointmentChipTitle(state, appt, "Blocked time");
  const day = new Date(`${appt.dateISO}T00:00:00`).toLocaleDateString("en-AU", {
    weekday: "short", day: "numeric", month: "short",
  });
  return `${title} · moved to ${day}, ${timeLabel(appt.startMinute)}–${timeLabel(appt.endMinute)}`;
}

// Reads the appointment from the store at RENDER time, not at prompt time, so the copy and
// the email always describe the committed position — never a stale mid-drag one.
function RescheduleNotifyDialog({ apptID, onClose }: { apptID: string; onClose: () => void }) {
  const store = useDemoStore();
  const appt = store.state.appointments[apptID];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The appointment was deleted or reconciled away under us — nothing left to email about.
  if (!appt) return null;

  const contact = appointmentContact(appt, appt.patientID ? store.state.patients[appt.patientID] : undefined);

  return (
    <div role="dialog" aria-modal="true" aria-label="Notify the client"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "color-mix(in srgb, var(--color-ink) 45%, transparent)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-card border border-line bg-card p-5">
        <h2 className="font-display text-xl text-ink">Notify the client?</h2>
        <p className="mt-2 text-sm text-ink-soft">{movedLine(store.state, appt)}</p>
        {contact.email ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button"
              onClick={() => { store.notifyAppointmentRescheduled(apptID); onClose(); }}
              className="rounded-btn px-3 py-1.5 text-sm font-medium text-card"
              style={{ background: "var(--color-tint)" }}>
              Send email
            </button>
            <button type="button" onClick={onClose}
              className="rounded-btn border border-line px-3 py-1.5 text-sm text-ink-soft">
              Don&apos;t send
            </button>
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm text-ink-soft">No client contact on file — no email will be sent.</p>
            <div className="mt-4">
              <button type="button" onClick={onClose}
                className="rounded-btn px-3 py-1.5 text-sm font-medium text-card"
                style={{ background: "var(--color-tint)" }}>
                OK
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

Check `rounded-card` and `bg-card` against the existing modal at `src/app/app/calendar/page.tsx:1253` and match whatever classes that panel uses — the dialog must look like the app's other modals, not merely work.

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/components/app/__tests__/reschedule-notify.test.tsx
```

Expected: PASS — 7 tests. If the "10:00" assertion fails, read the rendered text and align the assertion with what `movedLine` produces; do not weaken it to a substring that would pass for any time.

- [ ] **Step 5: Commit**

```bash
git add src/components/app/RescheduleNotify.tsx src/components/app/__tests__/reschedule-notify.test.tsx
git commit -m "feat(calendar): Notify-the-client dialog for a committed reschedule"
```

---

### Task 5: Raise the prompt from every reschedule in the calendar

**Files:**
- Modify: `src/app/app/calendar/page.tsx` — `CalendarInner` (~120), `TimelineBlock` (~452, three handlers), `WeekBlock` (~671, three handlers), the month chip's `onPointerUp` (~1060), `AppointmentDetail`'s Reschedule button (~1382)
- Test: `src/app/app/calendar/__tests__/calendar-reschedule-notify.test.tsx` (create)

**Interfaces:**
- Consumes: `useRescheduleNotify()` and `RescheduleNotifyProvider` from Task 4; the existing `store.rescheduleAppointment`.
- Produces: no new exports — this task wires existing pieces together.

- [ ] **Step 1: Write the failing test**

Create `src/app/app/calendar/__tests__/calendar-reschedule-notify.test.tsx`:

```tsx
// End-to-end over the REAL CalendarPage and demo seed (2026-07-27): a reschedule commits
// and then asks whether to email the client, instead of the backend emailing automatically.
// Pointer-drag simulation is unreliable in jsdom (no layout, no pointer capture), so this
// drives the detail panel's Reschedule button — the same store call and the same prompt.
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, type ReactNode } from "react";
import { DEMO_ACCOUNTS } from "@/lib/demo/accounts";
import { isoDay } from "@/lib/demo/backend";
import { SEED_NOW } from "@/lib/demo/seed";

vi.mock("@/lib/firebase/client", () => ({ isFirebaseConfigured: () => false }));
vi.mock("next/navigation", () => ({ usePathname: () => "/app", useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }));

import { DemoAuthProvider, useDemoAuth } from "@/lib/demo/auth";
import { DemoStoreProvider, useDemoStore } from "@/lib/demo/store";
import CalendarPage from "@/app/app/calendar/page";

const voss = DEMO_ACCOUNTS[2].identities[0]; // Dr Elena Voss — owner id u-voss
const TODAY_ISO = isoDay(SEED_NOW);

function Providers({ children }: { children: ReactNode }) {
  return <DemoAuthProvider><DemoStoreProvider>{children}</DemoStoreProvider></DemoAuthProvider>;
}

// Signs in, then seeds one treatment appointment with a client email on today's date.
// Idempotent so StrictMode's double-invoked effect books only one.
function Harness() {
  const { signIn, identity } = useDemoAuth();
  const store = useDemoStore();
  useEffect(() => {
    if (!identity) return;
    const mine = store.appointmentsForOwnerOnDay(identity.user.id, TODAY_ISO);
    if (mine.some((a) => a.lead?.email === "anna@example.com")) return;
    // BookTreatmentInput carries no ownerID — the owner is derived from `identity`.
    store.bookTreatmentAppointment({
      dateISO: TODAY_ISO, startMinute: 540, durationMinutes: 60,
      lead: { givenName: "Anna", lastName: "Chen", email: "anna@example.com" },
      identity,
    });
  }, [identity, store]);
  if (!identity) return <button onClick={() => signIn(voss)}>__signin__</button>;
  return <CalendarPage />;
}

async function openSeededAppointment(user: ReturnType<typeof userEvent.setup>) {
  render(<Providers><Harness /></Providers>);
  await user.click(screen.getByRole("button", { name: "__signin__" }));
  await screen.findByRole("heading", { name: /^calendar$/i });
  await user.click(screen.getByRole("button", { name: /^day$/i }));
  await user.click(await screen.findByRole("button", { name: /09:00.*Anna Chen/i }));
  return screen.findByRole("dialog", { name: /appointment details/i });
}

describe("calendar reschedule asks before emailing the client", () => {
  it("moving an appointment raises the Notify dialog naming the new time", async () => {
    const user = userEvent.setup();
    const detail = await openSeededAppointment(user);
    await user.clear(within(detail).getByDisplayValue("09:00"));
    await user.type(within(detail).getByLabelText(/time|^$/i, { selector: "input[type=time]" }), "10:30");
    await user.click(within(detail).getByRole("button", { name: /^reschedule$/i }));

    const notify = await screen.findByRole("dialog", { name: /notify the client/i });
    expect(notify).toHaveTextContent("Anna Chen");
    expect(notify).toHaveTextContent("10:30");
    expect(within(notify).getByRole("button", { name: /send email/i })).toBeInTheDocument();
  });

  it("Don't send closes the dialog and leaves the move in place", async () => {
    const user = userEvent.setup();
    const detail = await openSeededAppointment(user);
    await user.clear(within(detail).getByDisplayValue("09:00"));
    await user.type(within(detail).getByLabelText(/time|^$/i, { selector: "input[type=time]" }), "10:30");
    await user.click(within(detail).getByRole("button", { name: /^reschedule$/i }));

    await user.click(await screen.findByRole("button", { name: /don't send/i }));
    expect(screen.queryByRole("dialog", { name: /notify the client/i })).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /10:30.*Anna Chen/i })).toBeInTheDocument();
  });
});
```

The `getByLabelText(..., { selector: "input[type=time]" })` query is a guess at how the unlabelled time input is reachable. Run the test, and if it cannot find the input, replace both queries with `within(detail).getByDisplayValue("09:00")` held in a variable before clearing — do not add an `aria-label` to production code purely to satisfy a test unless the input genuinely lacks an accessible name, in which case adding one is a real accessibility fix and welcome.

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/app/app/calendar/__tests__/calendar-reschedule-notify.test.tsx
```

Expected: FAIL — no dialog named "Notify the client" appears.

- [ ] **Step 3: Wrap the calendar in the provider**

In `src/app/app/calendar/page.tsx`, add the import alongside the other component imports:

```tsx
import { RescheduleNotifyProvider, useRescheduleNotify } from "@/components/app/RescheduleNotify";
```

In `CalendarInner`, wrap the returned tree. Change `return (\n    <div>` to:

```tsx
  return (
    <RescheduleNotifyProvider>
    <div>
```

and close it at the end of that JSX (after the `MonthView` line and the closing `</div>`):

```tsx
    </div>
    </RescheduleNotifyProvider>
  );
```

- [ ] **Step 4: Raise the prompt from the three day-view gestures**

In `TimelineBlock` (~452), add near the other hooks at the top of the component:

```tsx
  const promptNotify = useRescheduleNotify();
```

Then in each of its three commit handlers, add the call immediately after the successful `store.rescheduleAppointment(...)`:

`onPointerUp` (~536):

```tsx
        store.rescheduleAppointment(appt.id, appt.dateISO, newStart, duration, me);
        promptNotify(appt.id);
        setScheduleError(null);
```

`onResizeUp` (~577):

```tsx
        store.rescheduleAppointment(appt.id, appt.dateISO, appt.startMinute, duration, me);
        promptNotify(appt.id);
        setScheduleError(null);
```

`onTopUp` (~615):

```tsx
        store.rescheduleAppointment(appt.id, appt.dateISO, newStart, appt.endMinute - newStart, me);
        promptNotify(appt.id);
        setScheduleError(null);
```

The call goes inside the existing `try`, after the store call — so a rejected move (out of hours) shows its error and raises no prompt.

- [ ] **Step 5: Raise the prompt from the three week-view gestures and the month drag**

In `WeekBlock` (~671), add `const promptNotify = useRescheduleNotify();` with the other hooks, then add `promptNotify(appt.id);` immediately after `store.rescheduleAppointment(...)` in each of its three handlers (~762 `onPointerUp`, ~793 `onResizeUp`, ~824 `onTopUp`), inside the existing `try`.

In the month-view chip component that owns the `onPointerUp` at ~1060, add `const promptNotify = useRescheduleNotify();` with its other hooks and:

```tsx
      store.rescheduleAppointment(appt.id, iso, appt.startMinute, appt.endMinute - appt.startMinute, me);
      promptNotify(appt.id);
      onError(null);
```

- [ ] **Step 6: Raise the prompt from the detail panel's Reschedule button**

In `AppointmentDetail`, add `const promptNotify = useRescheduleNotify();` with its other hooks, and in the Reschedule button's handler (~1382):

```tsx
            <button onClick={() => {
              try {
                store.rescheduleAppointment(appt.id, appt.dateISO, minutesFromTime(time), duration, me);
                setScheduleError(null);
                promptNotify(appt.id);
                onDone();
              } catch (e) {
```

`promptNotify` must come before `onDone()` — `onDone` closes the detail panel, and the prompt has to survive that.

- [ ] **Step 7: Run the test to verify it passes**

```bash
npx vitest run src/app/app/calendar/__tests__/calendar-reschedule-notify.test.tsx
```

Expected: PASS — 2 tests.

- [ ] **Step 8: Verify every reschedule site was covered**

```bash
grep -n "rescheduleAppointment\|promptNotify" src/app/app/calendar/page.tsx
```

Expected: 8 `store.rescheduleAppointment(` calls, each followed within two lines by a `promptNotify(appt.id);`. Anything unpaired is a missed site — fix it.

- [ ] **Step 9: Run the whole suite and the linters**

```bash
npx vitest run && npx tsc --noEmit && npm run lint
```

Expected: all green. `src/app/app/calendar/__tests__/calendar-page.test.tsx` and `calendar-checkout.test.tsx` exercise the same page; if either now fails because a Notify dialog covers the screen after a reschedule, that is a real behaviour change — update those tests to dismiss the dialog rather than removing the prompt.

- [ ] **Step 10: Commit**

```bash
git add src/app/app/calendar/page.tsx src/app/app/calendar/__tests__/calendar-reschedule-notify.test.tsx
git commit -m "feat(calendar): every reschedule asks before emailing the client"
```

---

### Task 6: Verify in the browser

**Files:** none — this is a manual verification pass over the running app.

- [ ] **Step 1: Start the dev server**

Use the `preview_start` tool with the dev-server config (do NOT run `next dev` through Bash). If `.claude/launch.json` has no entry, create one:

```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "web", "runtimeExecutable": "npm", "runtimeArgs": ["run", "dev"], "port": 3000 }
  ]
}
```

- [ ] **Step 2: Sign in to the demo and open the calendar**

Navigate to `/login`, sign in as Dr Elena Voss, go to `/app/calendar`, day view.

- [ ] **Step 3: Drag a block and confirm the dialog**

Drag an appointment chip to a new time. Expected: the chip lands at the new time immediately, and the "Notify the client?" dialog appears naming that time. Take a screenshot for the user.

- [ ] **Step 4: Check the console and the no-contact case**

Read console messages — expect no errors. Then drag a block with no client (one titled "Blocked time") and confirm the single-OK form appears reading "No client contact on file".

- [ ] **Step 5: Stop the server**

Use `preview_stop`. No commit — nothing changed.

---

## Deploy (after both PRs merge)

Not part of the TDD loop; run in this order or the calendar breaks.

1. **Backend first:**
   ```bash
   cd /Users/zhendeng/Documents/AestheticX/backend && npx firebase deploy --only functions:rescheduleAppointment,functions:notifyAppointmentRescheduled
   ```
2. **Then web** — merge the web PR and let Vercel deploy it.

Deploying web first would leave the old callable ignoring `notifyClient` (so every drag still emails) and `notifyAppointmentRescheduled` returning `not-found` when the practitioner taps Send. Worse than either failure mode: it would make **"Don't send" a lie** — the client has already been emailed unconditionally by the old callable before the practitioner ever sees the prompt, so clicking "Don't send" silently does nothing to stop a message that already went out.

Live smoke check after both: drag a real appointment with a client email, choose **Don't send**, and confirm no `mailOutbox` document was created. Then repeat choosing **Send email** and confirm exactly one was.

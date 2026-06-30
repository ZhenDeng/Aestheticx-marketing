# Patient Self-Booking Implementation Plan (clinician-facing)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A per-clinician booking link + QR and a pending-bookings requests inbox (confirm) on a new `/app/bookings` page — demo + live parity.

**Architecture:** A `bookingTokensByUser` slice + pure ops in `backend.ts`; a tiny `booking.ts` for the host/URL; direct-Firestore mirror (`users/{uid}.bookingToken`) + the deployed `confirmAppointment` callable; the user-doc hydrate read extended to return the token too; a `/app/bookings` page reusing the remote-signing QR pattern.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest; Firebase v11; `qrcode` (already a dep).

**Source of truth:** iOS `AXDomain/BookingLink.swift`, `AXData/InMemoryBackend+SelfBooking.swift`, `AXData/LiveBackend.swift`. Design: `docs/superpowers/specs/2026-06-30-patient-self-booking-design.md`.

**Key facts:**
- Booking token is stored on the `users/{uid}` doc as `bookingToken`; confirm goes through the `confirmAppointment` callable (`{appointmentId}`).
- Appointments already hydrate (the calendar reads them) — pending ones need only a status filter.
- Owner scope = clinic id in a clinic context, else the user id (matches the calendar's `ownerID`).
- `makeID`, `BackendError`, `appendNote` are private/exported in `backend.ts`; `qrcode` dynamic-import pattern is in `src/app/app/patients/[id]/consent/remote/page.tsx`.

---

## File Structure
- Create `src/lib/demo/booking.ts` — `BOOKING_HOST`, `bookingLinkUrl(token)`.
- Modify `src/lib/demo/types.ts` — `DemoState.bookingTokensByUser`.
- Modify `src/lib/demo/backend.ts` — `emptyState` slice + `bookingTokenForUser`, `mintBookingToken`, `pendingBookings`, `confirmAppointment` (+ owner-scope helper).
- Modify `src/lib/firebase/mirror.ts` — `mirrorSetBookingToken`, `mirrorConfirmAppointment`.
- Modify `src/lib/firebase/hydrate.ts` — refactor the user-doc read to also return `bookingToken`; decode into `bookingTokensByUser`.
- Modify `src/lib/firebase/__tests__/hydrate.test.ts` — fixture + assertion.
- Modify `src/lib/demo/store.tsx` — reads + actions + `StoreValue`.
- Modify `src/lib/demo/seed.ts` — seed a token + a pending booking.
- Create `src/app/app/bookings/page.tsx`; modify `src/components/app/AppShell.tsx` (nav).
- Tests: `src/lib/demo/__tests__/self-booking.test.ts`.

---

## Task 1: `booking.ts` + model/state + ops (TDD)

**Files:** Create `src/lib/demo/booking.ts`; Modify `src/lib/demo/types.ts`, `src/lib/demo/backend.ts`; Test `src/lib/demo/__tests__/self-booking.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { BOOKING_HOST, bookingLinkUrl } from "@/lib/demo/booking";
import {
  emptyState, bookingTokenForUser, mintBookingToken, pendingBookings, confirmAppointment, BackendError,
} from "@/lib/demo/backend";
import type { Appointment, DemoState, Identity } from "@/lib/demo/types";

const voss: Identity = { user: { id: "u-voss", name: "Voss" }, role: "doctor", context: { kind: "independent" } };
const sarah: Identity = { user: { id: "u-sarah", name: "Sarah" }, role: "nurse", context: { kind: "independent" } };

const appt = (id: string, ownerID: string, dateISO: string, startMinute: number, status: Appointment["status"]): Appointment =>
  ({ id, type: "treatment", ownerID, dateISO, startMinute, endMinute: startMinute + 30, status, patientName: "Lead" });

function withAppts(...a: Appointment[]): DemoState {
  return { ...emptyState(), appointments: Object.fromEntries(a.map((x) => [x.id, x])) };
}

describe("booking link", () => {
  it("builds a url from the host + token", () => {
    expect(bookingLinkUrl("bk-1")).toBe(BOOKING_HOST + "bk-1");
  });
});

describe("mintBookingToken", () => {
  it("mints a stable token per user and is idempotent", () => {
    const r1 = mintBookingToken(emptyState(), voss);
    expect(r1.token).toBeTruthy();
    expect(bookingTokenForUser(r1.state, "u-voss")).toBe(r1.token);
    const r2 = mintBookingToken(r1.state, voss); // already minted
    expect(r2.token).toBe(r1.token);
    expect(r2.state).toBe(r1.state); // unchanged reference
  });
  it("gives different users different tokens", () => {
    const a = mintBookingToken(emptyState(), voss);
    const b = mintBookingToken(a.state, sarah);
    expect(b.token).not.toBe(a.token);
  });
});

describe("pendingBookings", () => {
  it("lists the owner's awaiting-confirmation bookings across dates, earliest first", () => {
    const s = withAppts(
      appt("a1", "u-voss", "2026-07-10", 600, "awaitingConfirmation"),
      appt("a2", "u-voss", "2026-07-03", 540, "awaitingConfirmation"),
      appt("a3", "u-voss", "2026-07-03", 600, "confirmed"),          // confirmed — excluded
      appt("a4", "u-sarah", "2026-07-01", 540, "awaitingConfirmation"), // other owner — excluded
    );
    expect(pendingBookings(s, "u-voss").map((a) => a.id)).toEqual(["a2", "a1"]);
  });
});

describe("confirmAppointment", () => {
  it("confirms the owner's booking", () => {
    const s = confirmAppointment(withAppts(appt("a1", "u-voss", "2026-07-03", 600, "awaitingConfirmation")), "a1", voss);
    expect(s.appointments.a1.status).toBe("confirmed");
  });
  it("rejects another owner's booking", () => {
    expect(() => confirmAppointment(withAppts(appt("a1", "u-voss", "2026-07-03", 600, "awaitingConfirmation")), "a1", sarah)).toThrow(BackendError);
  });
  it("throws on a missing appointment", () => {
    expect(() => confirmAppointment(emptyState(), "nope", voss)).toThrow(BackendError);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/lib/demo/__tests__/self-booking.test.ts` → FAIL.

- [ ] **Step 3a: Create `src/lib/demo/booking.ts`**

```ts
// Public self-booking link host. The patient-facing surface (backend/web/book.html,
// Firebase Hosting) resolves the token to the owner + their availability.
export const BOOKING_HOST = "https://aestheticx-91e6b.web.app/u/";

export function bookingLinkUrl(token: string): string {
  return BOOKING_HOST + token;
}
```

- [ ] **Step 3b: State in `src/lib/demo/types.ts`**

Add to `DemoState`:

```ts
  bookingTokensByUser: Record<string, string>;
```

- [ ] **Step 3c: Ops in `src/lib/demo/backend.ts`**

Add `bookingTokensByUser: {},` to `emptyState()`. Then (near the follow-up ops):

```ts
// Owner of a calendar/appointment scope: the active clinic in a clinic context, else the user.
function appointmentOwnerScope(identity: Identity): string {
  return identity.context.kind === "clinic" ? identity.context.clinic.id : identity.user.id;
}

export function bookingTokenForUser(state: DemoState, userID: string): string | undefined {
  return state.bookingTokensByUser[userID];
}

// Stable per-user token, minted once (matches iOS bookingLink(forUser:)).
export function mintBookingToken(state: DemoState, identity: Identity): { state: DemoState; token: string } {
  const existing = state.bookingTokensByUser[identity.user.id];
  if (existing) return { state, token: existing };
  const token = makeID("bk");
  return { state: { ...state, bookingTokensByUser: { ...state.bookingTokensByUser, [identity.user.id]: token } }, token };
}

// Awaiting-confirmation bookings on the owner's calendar, all dates, earliest first.
export function pendingBookings(state: DemoState, ownerID: string): Appointment[] {
  return Object.values(state.appointments)
    .filter((a) => a.ownerID === ownerID && a.status === "awaitingConfirmation")
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO) || a.startMinute - b.startMinute);
}

export function confirmAppointment(state: DemoState, id: string, identity: Identity): DemoState {
  const appt = state.appointments[id];
  if (!appt) throw new BackendError("notFound");
  if (appt.ownerID !== appointmentOwnerScope(identity)) throw new BackendError("notPermitted");
  return { ...state, appointments: { ...state.appointments, [id]: { ...appt, status: "confirmed" } } };
}
```

If `Appointment` is not already imported at the top of `backend.ts`, add it to the `import type { … } from "./types"` block.

- [ ] **Step 4: Run to verify it passes** — `npx vitest run src/lib/demo/__tests__/self-booking.test.ts` → PASS. Then `npx tsc --noEmit` — add `bookingTokensByUser: {}` to the `assembleState` return stub (Task 3 fills it).

- [ ] **Step 5: Commit**

```bash
git add src/lib/demo/booking.ts src/lib/demo/types.ts src/lib/demo/backend.ts src/lib/firebase/hydrate.ts src/lib/demo/__tests__/self-booking.test.ts
git commit -m "feat(booking): booking token + pending-bookings ops + confirm"
```

---

## Task 2: Mirror functions

**Files:** Modify `src/lib/firebase/mirror.ts`

- [ ] **Step 1: Add functions** (the file already imports `doc, updateDoc`, `httpsCallable`, `functions`)

```ts
export async function mirrorSetBookingToken(uid: string, token: string): Promise<void> {
  await updateDoc(doc(firestore(), "users", uid), { bookingToken: token });
}
export async function mirrorConfirmAppointment(id: string): Promise<void> {
  await httpsCallable(functions(), "confirmAppointment")({ appointmentId: id });
}
```

- [ ] **Step 2: Type-check** — `npx tsc --noEmit` → clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/firebase/mirror.ts
git commit -m "feat(booking): mirror booking token + confirmAppointment"
```

---

## Task 3: Hydrate the booking token

**Files:** Modify `src/lib/firebase/hydrate.ts`, `src/lib/firebase/__tests__/hydrate.test.ts`

- [ ] **Step 1: Refactor the user-doc read to return the token too**

Replace `readUserFollowUpSettings` with `readUserProfile` (one `getDoc`, returns both):

```ts
async function readUserProfile(uid: string): Promise<{
  followUpSettings: { enabled: boolean; intervalDays: number } | null;
  bookingToken: string | null;
}> {
  const snap = await getDoc(doc(firestore(), "users", uid));
  if (!snap.exists()) return { followUpSettings: null, bookingToken: null };
  const d = snap.data();
  const hasFU = d.followUpEnabled !== undefined || d.followUpIntervalDays !== undefined;
  const raw = d.followUpIntervalDays;
  const followUpSettings = hasFU
    ? { enabled: d.followUpEnabled === true, intervalDays: typeof raw === "number" && Number.isFinite(raw) ? Math.min(90, Math.max(1, Math.round(raw))) : 14 }
    : null;
  const bookingToken = typeof d.bookingToken === "string" ? d.bookingToken : null;
  return { followUpSettings, bookingToken };
}
```

- [ ] **Step 2: `HydrationRows` + `assembleState`**

Add to `HydrationRows`:

```ts
  bookingToken: string | null;
```

In `assembleState`, before `return`:

```ts
  const bookingTokensByUser: DemoState["bookingTokensByUser"] = {};
  if (rows.bookingToken) bookingTokensByUser[rows.currentUserID] = rows.bookingToken;
```

and add `bookingTokensByUser` to the returned object (replace the Task 1 stub).

- [ ] **Step 3: Use `readUserProfile` in both `hydrate` branches**

In the super-admin branch, replace the `followUpSettings: await readUserFollowUpSettings(uid), currentUserID: uid,` lines with:

```ts
      ...(await (async () => { const p = await readUserProfile(uid); return { followUpSettings: p.followUpSettings, bookingToken: p.bookingToken, currentUserID: uid }; })()),
```

Prefer a clearer form: declare `const profile = await readUserProfile(uid);` just before the `return assembleState({` in **each** branch, and pass:

```ts
      followUpSettings: profile.followUpSettings,
      bookingToken: profile.bookingToken,
      currentUserID: uid,
```

(Do this in both the super-admin `assembleState({…})` and the normal one. Remove the old `await readUserFollowUpSettings(uid)` calls.)

- [ ] **Step 4: Fixture + assertions** in `src/lib/firebase/__tests__/hydrate.test.ts`

Add to the `rows` object:

```ts
  bookingToken: "bk-voss",
```

and assertion in the test body:

```ts
    expect(state.bookingTokensByUser["u-voss"]).toBe("bk-voss");
```

- [ ] **Step 5: Type-check + full suite** — `npx tsc --noEmit && npx vitest run` → clean / pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/firebase/hydrate.ts src/lib/firebase/__tests__/hydrate.test.ts
git commit -m "feat(booking): hydrate booking token from the user doc"
```

---

## Task 4: Store reads + actions

**Files:** Modify `src/lib/demo/store.tsx`

- [ ] **Step 1: Extend `StoreValue`** (after the follow-up lines)

```ts
  bookingTokenForUser: (userID: string) => ReturnType<typeof backend.bookingTokenForUser>;
  pendingBookings: (ownerID: string) => ReturnType<typeof backend.pendingBookings>;
  ensureBookingToken: (identity: Identity) => void;
  confirmAppointment: (id: string, identity: Identity) => void;
```

- [ ] **Step 2: Reads + actions in the value object**

```ts
      bookingTokenForUser: (userID) => backend.bookingTokenForUser(state, userID),
      pendingBookings: (ownerID) => backend.pendingBookings(state, ownerID),
      ensureBookingToken: (identity) => {
        if (state.bookingTokensByUser[identity.user.id]) return; // already have one
        let token = "";
        applyAndMirror(
          (s) => { const r = backend.mintBookingToken(s, identity); token = r.token; return r.state; },
          (m) => token ? m.mirrorSetBookingToken(identity.user.id, token) : Promise.resolve(),
        );
      },
      confirmAppointment: (id, identity) =>
        applyAndMirror(
          (s) => backend.confirmAppointment(s, id, identity),
          (m) => m.mirrorConfirmAppointment(id),
        ),
```

- [ ] **Step 3: Type-check + store tests** — `npx tsc --noEmit && npx vitest run src/lib/demo/__tests__/store.test.tsx` → clean / pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/demo/store.tsx
git commit -m "feat(booking): store booking-token + pending-bookings reads/actions"
```

---

## Task 5: Seed a token + a pending booking

**Files:** Modify `src/lib/demo/seed.ts`

- [ ] **Step 1: Add the seed**

Just before `return state;` (the `appointments` object is already built and assigned earlier — add to it and the token map):

```ts
  // Self-booking demo data: a stable link token + one pending booking on a future date.
  const pendingBooking = {
    id: "appt-pending-1", type: "treatment" as const, ownerID: "u-voss", dateISO: "2026-07-03",
    startMinute: 600, endMinute: 630, status: "awaitingConfirmation" as const,
    patientName: "Jordan Lee (new lead)", appointmentNote: "Consultation",
  };
  state = {
    ...state,
    appointments: { ...state.appointments, [pendingBooking.id]: pendingBooking },
    bookingTokensByUser: { ...state.bookingTokensByUser, "u-voss": "bk-seed-voss" },
  };
```

- [ ] **Step 2: Type-check + seed test** — `npx tsc --noEmit && npx vitest run src/lib/demo/__tests__/seed.test.ts` → clean / pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/demo/seed.ts
git commit -m "feat(booking): seed a booking token + pending booking for the demo"
```

---

## Task 6: `/app/bookings` page + nav link

**Files:** Create `src/app/app/bookings/page.tsx`; Modify `src/components/app/AppShell.tsx`

- [ ] **Step 1: Nav link** — add to `NAV` (after Templates):

```ts
  { href: "/app/bookings", label: "Bookings" },
```

- [ ] **Step 2: Create the page**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { bookingLinkUrl } from "@/lib/demo/booking";

function timeLabel(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

export default function BookingsPage() {
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const token = identity ? store.bookingTokenForUser(identity.user.id) : undefined;
  const url = token ? bookingLinkUrl(token) : null;

  // Mint the user's link on first visit if they don't have one yet.
  useEffect(() => {
    if (identity && !store.bookingTokenForUser(identity.user.id)) store.ensureBookingToken(identity);
  }, [identity, store]);

  // Render the QR whenever the URL is known.
  useEffect(() => {
    let cancelled = false;
    if (!url) { setQr(null); return; }
    void (async () => {
      const { default: QRCode } = await import("qrcode");
      const data = await QRCode.toDataURL(url, { width: 220, margin: 1 });
      if (!cancelled) setQr(data);
    })();
    return () => { cancelled = true; };
  }, [url]);

  if (!identity) return null;
  if (store.status === "loading") return <p className="text-ink-soft">Loading…</p>;
  if (store.status === "error") return <p className="text-ink-soft">Could not load data. Open the dashboard to retry.</p>;
  const me = identity;
  const isLive = store.status !== "demo";
  const ownerScope = me.context.kind === "clinic" ? me.context.clinic.id : me.user.id;
  const pending = store.pendingBookings(ownerScope);

  async function copy() {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); setCopied(true); } catch { /* manual copy */ }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-3xl text-ink">Bookings</h1>
      <p className="mt-2 text-ink-soft">Share your personal link so patients can request a consultation.</p>

      <div className="mt-6 rounded-card border border-line bg-card p-5">
        <h2 className="font-display text-lg text-ink">Your booking link</h2>
        {!isLive && (
          <p className="mt-2 rounded-inner border-l-4 p-2 text-sm" style={{ borderColor: "var(--color-tint)", background: "var(--color-tint-soft)" }}>
            Demo link — in live mode the server resolves this token to your availability.
          </p>
        )}
        {url ? (
          <>
            <div className="mt-3 flex items-center gap-2">
              <input readOnly value={url} className="w-full rounded-field border border-line bg-card px-3 py-2 text-sm text-ink" />
              <button type="button" onClick={copy} className="whitespace-nowrap rounded-btn border border-line px-3 py-2 text-sm text-ink-soft hover:border-tint">
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            {qr && (
              <div className="mt-5">
                <span className="micro">QR code</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt="Booking link QR code" width={220} height={220} className="mt-1.5 rounded-inner border border-line bg-card" />
              </div>
            )}
          </>
        ) : (
          <p className="mt-3 text-sm text-ink-soft">Preparing your link…</p>
        )}
      </div>

      <div className="mt-8">
        <h2 className="font-display text-lg text-ink">Pending booking requests</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {pending.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 rounded-inner border border-line bg-card px-4 py-3">
              <span className="min-w-0">
                <span className="block font-medium text-ink">{a.patientName ?? "New booking"}</span>
                <span className="micro">{a.dateISO} · {timeLabel(a.startMinute)}–{timeLabel(a.endMinute)}</span>
              </span>
              <button onClick={() => store.confirmAppointment(a.id, me)}
                      className="flex-none rounded-btn px-3 py-1.5 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>
                Confirm
              </button>
            </li>
          ))}
          {pending.length === 0 && <li className="text-sm text-ink-soft">No pending requests.</li>}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check + full suite + lint + build** — `npx tsc --noEmit && npx vitest run && npx eslint src && npm run build` → all green.

- [ ] **Step 4: Commit**

```bash
git add src/app/app/bookings/page.tsx src/components/app/AppShell.tsx
git commit -m "feat(booking): bookings page — link/QR + pending-requests inbox"
```

---

## Task 7: Verification gate + demo smoke + PR

- [ ] **Step 1: Full gate** — `npx vitest run && npx tsc --noEmit && npx eslint src && npm run build` (all green).

- [ ] **Step 2: Demo smoke (preview).** `.env.local` makes `npm run dev` run live — `mv .env.local .env.local.bak`, restart preview, restore afterwards. As **Dr Voss**:
  - Open **Bookings** → "Your booking link" shows a URL ending in the seeded token + a QR; **Copy** works.
  - "Pending booking requests" lists the seeded "Jordan Lee (new lead)" booking on 2026-07-03 → **Confirm** → it leaves the list.
  - No console errors.

- [ ] **Step 3: Push + PR** — `git push -u origin feature/patient-self-booking` then `gh pr create` (body from the diff).

---

## Self-Review Notes

- **Spec coverage (clinician-facing):** per-user shareable link + QR, distinct per user (Tasks 1, 6) ✓; pending-bookings inbox across all dates, earliest-first, owner-scoped (Task 1 `pendingBookings`, Task 6) ✓; confirm from the inbox → leaves pending (Task 1 `confirmAppointment` + Task 6) ✓; persistence across sessions (token on `users/{uid}`, hydrate — Tasks 2–3) ✓.
- **Out of scope (per spec / boundary):** the public booking surface, availability computation, Google/external-calendar reconciliation, reschedule/decline.
- **Type consistency:** `bookingTokensByUser`, `bookingLinkUrl`, `mintBookingToken`, `pendingBookings`, `confirmAppointment` identical across layers. Firestore: `bookingToken` on `users/{uid}` (matches iOS); confirm via the `confirmAppointment` callable (`appointmentId`).
- **No placeholders:** every step has full code; PR body is the only deferred-to-runtime text.

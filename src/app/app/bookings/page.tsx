"use client";

import { useEffect, useState } from "react";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { bookingLinkUrl } from "@/lib/demo/booking";
import { appointmentTitle, BackendError } from "@/lib/demo/backend";
import type { Appointment, Identity } from "@/lib/demo/types";

function timeLabel(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}
function minutesFromTime(value: string): number {
  const [h, m] = value.split(":").map((x) => parseInt(x, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export default function BookingsPage() {
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const token = identity ? store.bookingTokenForUser(identity.user.id) : undefined;
  const url = token ? bookingLinkUrl(token) : null;

  // Mint the user's link on first visit if they don't have one yet. Wait for hydration
  // (status !== "loading") so we never mint against the pre-hydration empty state and
  // race the hydrated setState; `!token` keeps it idempotent across re-renders.
  useEffect(() => {
    if (identity && !token && store.status !== "loading") store.ensureBookingToken(identity);
  }, [identity, token, store]);

  // Render the QR whenever the URL is known. (The QR <img> is gated on `url`, so no
  // synchronous clear is needed when url is absent — avoids set-state-in-effect.)
  useEffect(() => {
    let cancelled = false;
    if (!url) return;
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
          {pending.map((a) => <PendingRow key={a.id} appt={a} me={me} />)}
          {pending.length === 0 && <li className="text-sm text-ink-soft">No pending requests.</li>}
        </ul>
      </div>
    </div>
  );
}

// One inbox row: confirm / reschedule / decline (spec: patient-self-booking requests inbox).
// Confirm and decline remove the row (the booking leaves pendingBookings); a reschedule keeps
// it pending at the new time. The date is editable here — unlike the calendar detail, inbox
// rows span dates.
function PendingRow({ appt, me }: { appt: Appointment; me: Identity }) {
  const store = useDemoStore();
  const [rescheduling, setRescheduling] = useState(false);
  const [date, setDate] = useState(appt.dateISO);
  const [time, setTime] = useState(timeLabel(appt.startMinute));
  const [duration, setDuration] = useState(appt.endMinute - appt.startMinute);
  const [error, setError] = useState<string | null>(null);

  function applyReschedule() {
    try {
      store.rescheduleAppointment(appt.id, date, minutesFromTime(time), duration, me);
      setError(null);
      setRescheduling(false);
    } catch (e) {
      setError(e instanceof BackendError && e.message === "unavailable"
        ? "That time is outside your treatment hours or on a blocked time."
        : "Could not move the booking. Please try again.");
    }
  }

  // Confirm/decline can race (another staff member actions the same row); the store
  // eager-validates so the BackendError lands here, not mid-render.
  function act(fn: () => void) {
    try {
      fn();
      setError(null);
    } catch {
      setError("Could not update this booking — it may have just been actioned elsewhere.");
    }
  }

  return (
    <li className="rounded-inner border border-line bg-card px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block font-medium text-ink">{appointmentTitle(appt, "New booking")}</span>
          <span className="micro">{appt.dateISO} · {timeLabel(appt.startMinute)}–{timeLabel(appt.endMinute)}</span>
        </span>
        <span className="flex flex-none gap-2">
          <button onClick={() => act(() => store.confirmAppointment(appt.id, me))}
                  className="rounded-btn px-3 py-1.5 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>
            Confirm
          </button>
          <button onClick={() => { setRescheduling((r) => !r); setError(null); }}
                  className="rounded-btn border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-tint">
            Reschedule
          </button>
          <button onClick={() => act(() => store.markAppointment(appt.id, "cancelled", me))}
                  className="rounded-btn border border-line px-3 py-1.5 text-sm" style={{ color: "var(--color-rose)" }}>
            Decline
          </button>
        </span>
      </div>
      {rescheduling && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="New date"
                 className="rounded-field border border-line px-2 py-1 text-sm text-ink" />
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="New time"
                 className="rounded-field border border-line px-2 py-1 text-sm text-ink" />
          <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} aria-label="Duration"
                  className="rounded-field border border-line px-2 py-1 text-sm text-ink">
            {[...new Set([15, 30, 45, 60, appt.endMinute - appt.startMinute])].sort((x, y) => x - y)
              .map((d) => <option key={d} value={d}>{d} min</option>)}
          </select>
          <button onClick={applyReschedule}
                  className="rounded-btn border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-tint">
            Apply
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-sm" style={{ color: "var(--color-rose)" }}>{error}</p>}
    </li>
  );
}

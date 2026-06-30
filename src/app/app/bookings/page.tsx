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

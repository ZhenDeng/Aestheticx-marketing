"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { bookingLinkUrl } from "@/lib/demo/booking";

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
  const isLive = store.status !== "demo";

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

      {/* The pending-requests inbox moved to the calendar (2026-07-05) so approval
          happens where the schedule lives; this page keeps the sharing surface. */}
      <p className="mt-8 text-sm text-ink-soft">
        Pending booking requests are approved on the{" "}
        <Link href="/app/calendar" className="underline decoration-line underline-offset-2 hover:decoration-tint">calendar</Link>.
      </p>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";

export default function DashboardPage() {
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  if (!identity) return null;
  if (store.status === "loading") return <p className="text-ink-soft">Loading your data…</p>;
  if (store.status === "error") {
    return (
      <div>
        <p className="text-ink-soft">Could not load your data.</p>
        <button onClick={store.rehydrate} className="mt-3 rounded-btn px-4 py-2 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>
          Retry
        </button>
      </div>
    );
  }

  const patients = store.searchPatients("", identity);
  const pending =
    identity.role === "doctor" ? store.pendingRequestsForDoctor(identity.user.id) : [];

  return (
    <div>
      <p className="kicker">Signed in</p>
      <h1 className="mt-2 font-display text-3xl text-ink">Welcome, {identity.user.name}</h1>
      <p className="mt-2 text-ink-soft">
        Acting as {identity.role === "clinicAdmin" ? "clinic admin" : identity.role}
        {identity.context.kind === "clinic" ? ` · ${identity.context.clinic.name}` : " · independent"}.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Link href="/app/patients" className="rounded-card border border-line bg-card p-6 shadow-card transition-colors hover:border-tint/50">
          <p className="font-display text-3xl text-ink">{patients.length}</p>
          <p className="mt-1 text-sm text-ink-soft">Patients you can see</p>
        </Link>
        {identity.role === "doctor" && (
          <Link href="/app/authorisations" className="rounded-card border border-line bg-card p-6 shadow-card transition-colors hover:border-tint/50">
            <p className="font-display text-3xl text-ink">{pending.length}</p>
            <p className="mt-1 text-sm text-ink-soft">Requests awaiting your review</p>
          </Link>
        )}
        <Link href="/app/calendar" className="rounded-card border border-line bg-card p-6 shadow-card transition-colors hover:border-tint/50">
          <p className="font-display text-3xl text-ink">Today</p>
          <p className="mt-1 text-sm text-ink-soft">Open the calendar</p>
        </Link>
      </div>
    </div>
  );
}

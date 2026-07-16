"use client";

import { useState } from "react";
import Link from "next/link";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { heldIdentities, prescriberIdentity } from "@/lib/demo/identity";
import { activePremise, appointmentTitle, bookerLabel, patientPermissions, premisesAfterSelect, upcomingAuthCalls } from "@/lib/demo/backend";
import { approvedThisMonth } from "@/lib/demo/billing";
import { dayHeaderLabel } from "@/lib/demo/calendar";
import type { Identity } from "@/lib/demo/types";

const timeLabel = (minute: number): string =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

// Round 6 booking surface, doctor side: the chronological schedule of booked
// authorisation teleconsults, so upcoming calls are visible in advance. 14/07 feedback:
// each row names the REQUESTING nurse/clinic, and an existing patient the doctor can
// already access links to the file for a pre-call review of their info + previous
// notes. Access follows patientPermissions (prescriber / open-request reviewer /
// clinic context) — a first-contact patient stays a plain row until a request opens
// (granting read access on booking alone needs a rules change, flagged backend-side).
function UpcomingAuthCalls({ asDoctor }: { asDoctor: Identity }) {
  const store = useDemoStore();
  const [error, setError] = useState<string | null>(null);
  const calls = upcomingAuthCalls(store.state, asDoctor.user.id, store.now);

  // 16/07 feedback bug 3: the doctor closes the loop here — completing flips the SAME
  // appointment record the calendar shows, so both surfaces stay in step by construction.
  function complete(id: string) {
    setError(null);
    try {
      store.markAppointment(id, "completed", asDoctor);
    } catch {
      setError("Could not mark that call completed — it may have just been actioned elsewhere.");
    }
  }
  return (
    <section className="mt-8 rounded-card border border-line bg-card p-6 shadow-card">
      <h2 className="font-display text-lg text-ink">Upcoming authorisation calls</h2>
      {calls.length === 0 ? (
        <p className="mt-2 text-sm text-ink-soft">
          No calls booked. Nurses book against your published availability — manage it under{" "}
          <Link href="/app/availability" className="underline hover:text-ink">Availability</Link>.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {calls.map((a) => {
            const patient = a.patientID ? store.state.patients[a.patientID] : undefined;
            const canReview = !!patient && patientPermissions(asDoctor, patient).canView;
            const booker = bookerLabel(store.state, a);
            const title = appointmentTitle(a, "Authorisation call");
            return (
              <li key={a.id} className="flex items-center justify-between gap-3 rounded-inner border border-line px-4 py-2.5">
                <span className="min-w-0">
                  {canReview && patient ? (
                    <Link href={`/app/patients/${patient.id}`} className="block text-sm font-medium text-ink underline-offset-2 hover:underline">
                      {title} ›
                    </Link>
                  ) : (
                    <span className="block text-sm font-medium text-ink">{title}</span>
                  )}
                  {booker && <span className="block text-sm text-ink-soft">Requested by {booker}</span>}
                  {canReview && <span className="micro block text-ink-faint">Review the file and previous notes before the call</span>}
                </span>
                <span className="flex-none text-right">
                  <span className="block text-sm text-ink">{dayHeaderLabel(a.dateISO)}</span>
                  <span className="block text-sm text-ink-soft">{timeLabel(a.startMinute)}–{timeLabel(a.endMinute)}</span>
                  <button
                    type="button"
                    onClick={() => complete(a.id)}
                    className="mt-1 rounded-btn border border-line px-3 py-1 text-xs text-ink-soft hover:border-tint"
                  >
                    Mark completed
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className="mt-2 text-sm" style={{ color: "var(--color-rose)" }}>{error}</p>}
    </section>
  );
}

// Round 6 (spec auth-pdf-feedback-round-6): an independent RN picks the premise they are
// working from here. The selection persists on the users doc — it survives sign-out and
// stays until changed — and is stamped onto every authorisation request they submit
// (that stamp is the premise printed on the generated authorisation document).
function PremiseSwitcher({ me }: { me: Identity }) {
  const store = useDemoStore();
  const [error, setError] = useState<string | null>(null);
  const profile = store.profileForUser(me.user.id);
  if (me.role !== "nurse" || me.context.kind !== "independent" || profile.premises.length === 0) return null;
  const active = activePremise(profile);

  function select(id: string) {
    setError(null);
    try {
      store.updateProfile(premisesAfterSelect(profile, id), me);
    } catch {
      setError("Could not switch premise.");
    }
  }

  return (
    <section className="mt-8 rounded-card border border-line bg-card p-6 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg text-ink">Working from</h2>
        <Link href="/app/profile" className="text-sm text-ink-soft hover:text-ink">Manage premises ›</Link>
      </div>
      <p className="mt-1 text-sm text-ink-soft">New authorisation requests are stamped with this premise.</p>
      <ul className="mt-3 flex flex-col gap-2">
        {profile.premises.map((p) => {
          const on = p.id === active?.id;
          return (
            <li key={p.id}>
              <button
                onClick={() => select(p.id)}
                aria-pressed={on}
                className="flex w-full items-center gap-3 rounded-inner border px-4 py-2.5 text-left transition-colors"
                style={on ? { borderColor: "var(--color-tint)" } : { borderColor: "var(--color-line)" }}
              >
                <span aria-hidden className="flex-none text-base" style={{ color: on ? "var(--color-tint)" : "var(--color-line)" }}>
                  {on ? "●" : "○"}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{p.name}</span>
                  <span className="block text-sm text-ink-soft">{p.address}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {error && <p className="mt-2 text-sm" style={{ color: "var(--color-rose)" }}>{error}</p>}
    </section>
  );
}

export default function DashboardPage() {
  const { identity, availableIdentities } = useDemoAuth();
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

  // Prescribing is always-on: the pending-approvals tile follows the account's held doctor identity,
  // not the selected workspace, so a doctor+clinicAdmin keeps it while acting as the clinic admin.
  const asDoctor = prescriberIdentity(heldIdentities(identity, availableIdentities));
  const pending = asDoctor ? store.pendingRequestsForDoctor(asDoctor.user.id) : [];
  // 14/07 feedback: the headline tile is the CURRENT calendar month's approved
  // authorisations (doctor: their approvals; nurse/clinic: approvals billed to them).
  const approvedCount = approvedThisMonth(Object.values(store.state.authorisations), identity, store.now);

  return (
    <div>
      <p className="kicker">Signed in</p>
      <h1 className="mt-2 font-display text-3xl text-ink">Welcome, {identity.user.name}</h1>
      <p className="mt-2 text-ink-soft">
        Acting as {identity.role === "clinicAdmin" ? "clinic admin" : identity.role}
        {identity.context.kind === "clinic" ? ` · ${identity.context.clinic.name}` : " · independent"}.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Link href="/app/billing" className="rounded-card border border-line bg-card p-6 shadow-card transition-colors hover:border-tint/50">
          <p className="font-display text-3xl text-ink">{approvedCount}</p>
          <p className="mt-1 text-sm text-ink-soft">Authorisation approved this month</p>
        </Link>
        {asDoctor && (
          <Link href="/app/authorisations" className="rounded-card border border-line bg-card p-6 shadow-card transition-colors hover:border-tint/50">
            <p className="font-display text-3xl text-ink">{pending.length}</p>
            <p className="mt-1 text-sm text-ink-soft">Requests awaiting your review</p>
          </Link>
        )}
        {/* Round 6 booking surface, nurse side: an obvious entry to book an authorisation
            teleconsult with a cooperating doctor (the existing Availability flow). */}
        {identity.role === "nurse" && (
          <Link href="/app/availability" className="rounded-card border p-6 shadow-card transition-colors hover:border-tint"
            style={{ borderColor: "var(--color-tint)", background: "var(--color-tint-soft)" }}>
            <p className="font-display text-2xl text-ink">Book an authorisation call</p>
            <p className="mt-1 text-sm text-ink-soft">Pick a doctor’s open slot, or request now</p>
          </Link>
        )}
        <Link href="/app/calendar" className="rounded-card border border-line bg-card p-6 shadow-card transition-colors hover:border-tint/50">
          <p className="font-display text-3xl text-ink">Today</p>
          <p className="mt-1 text-sm text-ink-soft">Open the calendar</p>
        </Link>
      </div>

      {asDoctor && <UpcomingAuthCalls asDoctor={asDoctor} />}

      <PremiseSwitcher me={identity} />
    </div>
  );
}

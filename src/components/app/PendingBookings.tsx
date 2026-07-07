"use client";

import { useState } from "react";
import { useDemoStore } from "@/lib/demo/store";
import { appointmentTitle, appointmentContact, BackendError } from "@/lib/demo/backend";
import type { Appointment, Identity } from "@/lib/demo/types";

// The pending booking-request inbox (spec: patient-self-booking requests inbox), moved
// from /app/bookings onto the calendar so approval happens where the schedule lives.
// Rows are cross-date: confirm and decline remove the row (the booking leaves
// pendingBookings); a reschedule keeps it pending at the new time.

function timeLabel(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}
function minutesFromTime(value: string): number {
  const [h, m] = value.split(":").map((x) => parseInt(x, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export function PendingBookings({ me }: { me: Identity }) {
  const store = useDemoStore();
  const ownerScope = me.context.kind === "clinic" ? me.context.clinic.id : me.user.id;
  const pending = store.pendingBookings(ownerScope);
  if (pending.length === 0) return null;

  return (
    <section className="mb-6">
      <h2 className="font-display text-lg text-ink">Pending booking requests</h2>
      <ul className="mt-3 flex flex-col gap-2">
        {pending.map((a) => <PendingRow key={a.id} appt={a} me={me} />)}
      </ul>
    </section>
  );
}

// One inbox row: approve / reschedule / decline. The date is editable here — unlike the
// day-view detail, pending rows span dates. Approving, moving, or declining also emails
// the client in live mode (deployed callables queue it; see the 2026-07-05 design doc).
function PendingRow({ appt, me }: { appt: Appointment; me: Identity }) {
  const store = useDemoStore();
  const [rescheduling, setRescheduling] = useState(false);
  const [date, setDate] = useState(appt.dateISO);
  const [time, setTime] = useState(timeLabel(appt.startMinute));
  const [duration, setDuration] = useState(appt.endMinute - appt.startMinute);
  const [error, setError] = useState<string | null>(null);

  const contact = appointmentContact(appt, appt.patientID ? store.state.patients[appt.patientID] : undefined);
  const contactLine = [
    contact.dobLabel && `DOB ${contact.dobLabel}`,
    contact.phone,
    contact.email,
  ].filter(Boolean).join(" · ");

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

  // Approve/decline can race (another staff member actions the same row); the store
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
          <span className="micro block">{appt.dateISO} · {timeLabel(appt.startMinute)}–{timeLabel(appt.endMinute)}</span>
          {contactLine && <span className="micro block truncate">{contactLine}</span>}
          {/* The patient's own message from the booking form (feedback 2026-07-07 item 5). */}
          {appt.appointmentNote && <span className="mt-0.5 block text-sm italic text-ink-soft">“{appt.appointmentNote}”</span>}
        </span>
        <span className="flex flex-none gap-2">
          <button onClick={() => act(() => store.confirmAppointment(appt.id, me))}
                  className="rounded-btn px-3 py-1.5 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>
            Approve
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

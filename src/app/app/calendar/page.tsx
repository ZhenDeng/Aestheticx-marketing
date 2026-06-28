"use client";

import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import type { Appointment } from "@/lib/demo/types";

function timeLabel(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export default function CalendarPage() {
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  if (!identity) return null;
  if (store.status === "loading") return <p className="text-ink-soft">Loading…</p>;
  if (store.status === "error") return <p className="text-ink-soft">Could not load data. Open the dashboard to retry.</p>;

  // Show the calendar for the identity's owner scope (clinic or self).
  const ownerID = identity.context.kind === "clinic" ? identity.context.clinic.id : identity.user.id;
  const appts = Object.values(store.state.appointments)
    .filter((a: Appointment) => a.ownerID === ownerID)
    .sort((a, b) => a.startMinute - b.startMinute);

  return (
    <div>
      <h1 className="font-display text-3xl text-ink">Calendar · Today</h1>
      <p className="mt-2 text-ink-soft">
        {identity.context.kind === "clinic" ? identity.context.clinic.name : identity.user.name}
      </p>

      <ul className="mt-6 flex flex-col gap-2">
        {appts.map((a) => (
          <li key={a.id} className="flex items-stretch gap-4 rounded-inner border border-line bg-card px-4 py-3">
            <span className="w-28 flex-none text-sm text-ink-soft">
              {timeLabel(a.startMinute)}–{timeLabel(a.endMinute)}
            </span>
            <span className="min-w-0 border-l-2 pl-4" style={{ borderColor: "var(--color-tint)" }}>
              <span className="block font-medium text-ink">{a.patientName ?? "Blocked time"}</span>
              {a.appointmentNote && <span className="block text-sm text-ink-soft">{a.appointmentNote}</span>}
            </span>
            <span className="micro ml-auto self-center">{a.status}</span>
          </li>
        ))}
        {appts.length === 0 && <li className="text-sm text-ink-soft">No appointments today.</li>}
      </ul>
    </div>
  );
}

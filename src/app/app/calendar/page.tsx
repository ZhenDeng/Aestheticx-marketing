"use client";

import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { isoDay } from "@/lib/demo/backend";
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

  // Follow-ups are owned by the user (clinician), not the clinic scope.
  const me = identity;
  const todayISO = isoDay(store.now);
  const settings = store.followUpSettingsForUser(me.user.id);
  const followUps = store.followUpTasksForOwnerOn(me.user.id, todayISO);

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

      {followUps.length > 0 && (
        <div className="mt-8">
          <h2 className="font-display text-lg text-ink">Follow-ups due</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {followUps.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 rounded-inner border border-line bg-card px-4 py-3">
                <span className="min-w-0">
                  <span className="block font-medium text-ink">{t.patientName}</span>
                  <span className="micro">due {t.dueDateISO}</span>
                </span>
                <span className="flex flex-none gap-2">
                  <button onClick={() => store.setFollowUpStatus(t.id, "done", me)}
                          className="rounded-btn px-3 py-1.5 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>Done</button>
                  <button onClick={() => store.setFollowUpStatus(t.id, "ignored", me)}
                          className="rounded-btn border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-tint">Ignore</button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-10 rounded-card border border-line bg-card p-5">
        <h2 className="font-display text-lg text-ink">Follow-up reminders</h2>
        <label className="mt-3 flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => store.setFollowUpSettings({ ...settings, enabled: e.target.checked }, me)}
          />
          Remind me to follow up after a treatment
        </label>
        {settings.enabled && (
          <label className="mt-2 flex items-center gap-2 text-sm text-ink-soft">
            Interval
            <input
              type="number" min={1} max={90} value={settings.intervalDays}
              onChange={(e) => {
                const n = Math.min(90, Math.max(1, Number(e.target.value) || 1));
                store.setFollowUpSettings({ ...settings, intervalDays: n }, me);
              }}
              className="w-20 rounded-field border border-line px-2 py-1 text-sm text-ink"
            />
            days after treatment
          </label>
        )}
      </div>
    </div>
  );
}

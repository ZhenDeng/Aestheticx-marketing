"use client";

import { useState } from "react";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { isoDay } from "@/lib/demo/backend";
import type { Appointment, AppointmentStatus, Identity } from "@/lib/demo/types";

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  awaitingConfirmation: "Awaiting", confirmed: "Confirmed", completed: "Completed", noShow: "No show", cancelled: "Cancelled",
};

function timeLabel(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function minutesFromTime(value: string): number {
  const [h, m] = value.split(":").map((x) => parseInt(x, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}
function timeValue(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

export default function CalendarPage() {
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  const [showNew, setShowNew] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  if (!identity) return null;
  if (store.status === "loading") return <p className="text-ink-soft">Loading…</p>;
  if (store.status === "error") return <p className="text-ink-soft">Could not load data. Open the dashboard to retry.</p>;

  const ownerID = identity.context.kind === "clinic" ? identity.context.clinic.id : identity.user.id;
  const me = identity;
  const todayISO = isoDay(store.now);
  const dayAppts = store.appointmentsForOwnerOnDay(ownerID, todayISO);
  const settings = store.followUpSettingsForUser(me.user.id);
  const followUps = store.followUpTasksForOwnerOn(me.user.id, todayISO);

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-3xl text-ink">Calendar · Today</h1>
        <button onClick={() => setShowNew((v) => !v)}
                className="rounded-btn px-4 py-2 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>
          New appointment
        </button>
      </div>
      <p className="mt-1 text-ink-soft">
        {identity.context.kind === "clinic" ? identity.context.clinic.name : identity.user.name}
      </p>

      {showNew && <NewAppointmentForm todayISO={todayISO} me={me} onDone={() => setShowNew(false)} />}

      <ul className="mt-6 flex flex-col gap-2">
        {dayAppts.map((a) => {
          const isOpen = expanded.has(a.id);
          const border = a.type === "treatment" ? "var(--color-tint)" : "var(--color-ink-soft)";
          const statusColor = a.status === "noShow" ? "var(--color-rose)"
            : a.status === "completed" ? "var(--color-tint)"
            : a.status === "awaitingConfirmation" ? "var(--color-ink-soft)" : "var(--color-ink)";
          return (
            <li key={a.id} className="rounded-inner border border-line bg-card px-4 py-3">
              <button onClick={() => setExpanded((p) => { const n = new Set(p); if (n.has(a.id)) n.delete(a.id); else n.add(a.id); return n; })}
                      className="flex w-full items-stretch gap-4 text-left">
                <span className="w-28 flex-none text-sm text-ink-soft">{timeLabel(a.startMinute)}–{timeLabel(a.endMinute)}</span>
                <span className="min-w-0 border-l-2 pl-4" style={{ borderColor: border }}>
                  <span className="block font-medium text-ink">{a.patientName ?? "Blocked time"}</span>
                  {a.appointmentNote && <span className="block text-sm text-ink-soft">{a.appointmentNote}</span>}
                </span>
                <span className="micro ml-auto self-center" style={{ color: statusColor }}>{STATUS_LABEL[a.status]}</span>
              </button>
              {isOpen && <AppointmentActions key={`${a.startMinute}-${a.endMinute}-${a.status}`} appt={a} me={me} onDone={() => setExpanded((p) => { const n = new Set(p); n.delete(a.id); return n; })} />}
            </li>
          );
        })}
        {dayAppts.length === 0 && <li className="text-sm text-ink-soft">No appointments today.</li>}
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

function NewAppointmentForm({ todayISO, me, onDone }: { todayISO: string; me: Identity; onDone: () => void }) {
  const store = useDemoStore();
  const [blockTime, setBlockTime] = useState(false);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState(30);
  const [note, setNote] = useState("");

  const matches = !blockTime && query.trim() && !picked ? store.searchPatients(query, me).slice(0, 5) : [];
  const canSave = blockTime || picked !== null;

  function save() {
    store.bookTreatmentAppointment({
      dateISO: todayISO, startMinute: minutesFromTime(time), durationMinutes: duration,
      patientID: blockTime ? undefined : picked?.id, patientName: blockTime ? undefined : picked?.name,
      note: note.trim() || undefined, identity: me,
    });
    onDone();
  }

  return (
    <div className="mt-4 rounded-inner border border-line bg-card p-4">
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={blockTime} onChange={(e) => { setBlockTime(e.target.checked); setPicked(null); }} />
        Block time (no patient)
      </label>

      {!blockTime && (
        <div className="mt-3">
          {picked ? (
            <p className="text-sm text-ink">{picked.name} <button onClick={() => setPicked(null)} className="ml-2 text-ink-soft underline">change</button></p>
          ) : (
            <>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search patient…"
                     className="w-full rounded-inner border border-line px-3 py-2 text-sm text-ink outline-none focus:border-tint" />
              <ul className="mt-1 flex flex-col gap-1">
                {matches.map((p) => (
                  <li key={p.id}>
                    <button onClick={() => setPicked({ id: p.id, name: `${p.givenName} ${p.lastName}` })}
                            className="w-full rounded-inner border border-line px-3 py-1.5 text-left text-sm text-ink hover:border-tint">
                      {p.givenName} {p.lastName}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="text-sm text-ink-soft">Start
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="ml-2 rounded-field border border-line px-2 py-1 text-sm text-ink" />
        </label>
        <label className="text-sm text-ink-soft">Duration
          <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="ml-2 rounded-field border border-line px-2 py-1 text-sm text-ink">
            {[15, 30, 45, 60].map((d) => <option key={d} value={d}>{d} min</option>)}
          </select>
        </label>
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Appointment note (optional)"
             className="mt-3 w-full rounded-inner border border-line px-3 py-2 text-sm text-ink outline-none focus:border-tint" />

      <div className="mt-3 flex gap-2">
        <button onClick={save} disabled={!canSave}
                className="rounded-btn px-4 py-2 text-sm font-medium text-card disabled:opacity-40" style={{ background: "var(--color-tint)" }}>
          Add appointment
        </button>
        <button onClick={onDone} className="rounded-btn border border-line px-4 py-2 text-sm text-ink-soft">Cancel</button>
      </div>
    </div>
  );
}

function AppointmentActions({ appt, me, onDone }: { appt: Appointment; me: Identity; onDone: () => void }) {
  const store = useDemoStore();
  const [time, setTime] = useState(timeValue(appt.startMinute));
  const [duration, setDuration] = useState(appt.endMinute - appt.startMinute);
  const canMark = appt.status === "awaitingConfirmation" || appt.status === "confirmed";

  return (
    <div className="mt-2 border-t border-line pt-2">
      {canMark ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="rounded-field border border-line px-2 py-1 text-sm text-ink" />
            <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="rounded-field border border-line px-2 py-1 text-sm text-ink">
              {[15, 30, 45, 60].map((d) => <option key={d} value={d}>{d} min</option>)}
            </select>
            <button onClick={() => { store.rescheduleAppointment(appt.id, appt.dateISO, minutesFromTime(time), duration, me); onDone(); }}
                    className="rounded-btn border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-tint">Reschedule</button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {appt.status === "awaitingConfirmation" && (
              <button onClick={() => { store.confirmAppointment(appt.id, me); onDone(); }}
                      className="rounded-btn px-3 py-1.5 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>Confirm</button>
            )}
            <button onClick={() => { store.markAppointment(appt.id, "completed", me); onDone(); }} className="rounded-btn border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-tint">Complete</button>
            <button onClick={() => { store.markAppointment(appt.id, "noShow", me); onDone(); }} className="rounded-btn border border-line px-3 py-1.5 text-sm" style={{ color: "var(--color-rose)" }}>No-show</button>
            <button onClick={() => { store.markAppointment(appt.id, "cancelled", me); onDone(); }} className="rounded-btn border border-line px-3 py-1.5 text-sm" style={{ color: "var(--color-rose)" }}>Cancel</button>
          </div>
        </>
      ) : (
        <p className="text-sm text-ink-soft">No actions available for a {STATUS_LABEL[appt.status].toLowerCase()} appointment.</p>
      )}
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { isoDay } from "@/lib/demo/backend";
import {
  addDaysISO, shiftMonthISO, weekDaysFor, monthGridFor,
  monthLabel, weekRangeLabel, dayHeaderLabel, dayLabel,
  layoutDay, dragStartMinute, type DayColumn,
} from "@/lib/demo/calendar";
import type { Appointment, AppointmentStatus, Identity } from "@/lib/demo/types";

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  awaitingConfirmation: "Awaiting", confirmed: "Confirmed", completed: "Completed", noShow: "No show", cancelled: "Cancelled",
};

type View = "day" | "week" | "month";

// Shared so the three views can't drift on colour.
// Type → left accent (treatment vs authorisation).
function apptTypeAccent(a: Appointment): string {
  return a.type === "treatment" ? "var(--color-tint)" : "var(--color-slate)";
}
// Semantic colour for the status label (day) and the chip fill (week/month).
// Status states override; an ordinary confirmed appointment shows its type colour.
function apptColor(a: Appointment): string {
  switch (a.status) {
    case "noShow": return "var(--color-danger)";
    case "completed": return "var(--color-sage)";
    case "awaitingConfirmation": return "var(--color-ink-soft)";
    default: return apptTypeAccent(a); // confirmed → type colour
  }
}

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
  const [view, setView] = useState<View>("day");
  const [showNew, setShowNew] = useState(false);
  if (!identity) return null;
  if (store.status === "loading") return <p className="text-ink-soft">Loading…</p>;
  if (store.status === "error") return <p className="text-ink-soft">Could not load data. Open the dashboard to retry.</p>;

  return <CalendarInner identity={identity} view={view} setView={setView}
    showNew={showNew} setShowNew={setShowNew} />;
}

function CalendarInner({ identity, view, setView, showNew, setShowNew }: {
  identity: Identity; view: View; setView: (v: View) => void;
  showNew: boolean; setShowNew: (v: boolean | ((p: boolean) => boolean)) => void;
}) {
  const store = useDemoStore();
  const ownerID = identity.context.kind === "clinic" ? identity.context.clinic.id : identity.user.id;
  const me = identity;
  const todayISO = isoDay(store.now);
  const [selectedISO, setSelectedISO] = useState(todayISO);

  const periodLabel = view === "day" ? dayLabel(selectedISO) : view === "week" ? weekRangeLabel(selectedISO) : monthLabel(selectedISO);
  function step(dir: 1 | -1) {
    setSelectedISO(view === "day" ? addDaysISO(selectedISO, dir)
      : view === "week" ? addDaysISO(selectedISO, dir * 7)
      : shiftMonthISO(selectedISO, dir));
  }
  function openDay(iso: string) { setSelectedISO(iso); setView("day"); }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-ink">Calendar</h1>
          <p className="mt-1 text-ink-soft">{periodLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-btn border border-line p-0.5">
            {(["day", "week", "month"] as View[]).map((v) => (
              <button key={v} onClick={() => setView(v)}
                className="rounded-btn px-3 py-1.5 text-sm capitalize"
                style={view === v ? { background: "var(--color-tint)", color: "var(--color-card)" } : { color: "var(--color-ink-soft)" }}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button onClick={() => step(-1)} className="rounded-btn border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-tint" aria-label="Previous">‹</button>
        <button onClick={() => setSelectedISO(todayISO)} className="rounded-btn border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-tint">Today</button>
        <button onClick={() => step(1)} className="rounded-btn border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-tint" aria-label="Next">›</button>
        {view === "day" && (
          <button onClick={() => setShowNew((v) => !v)}
            className="ml-auto rounded-btn px-4 py-2 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>
            New appointment
          </button>
        )}
      </div>

      {view === "day" && (
        <DayView ownerID={ownerID} dateISO={selectedISO} todayISO={todayISO} me={me}
          showNew={showNew} setShowNew={setShowNew} />
      )}
      {view === "week" && <WeekView ownerID={ownerID} selectedISO={selectedISO} todayISO={todayISO} openDay={openDay} />}
      {view === "month" && <MonthView ownerID={ownerID} selectedISO={selectedISO} todayISO={todayISO} openDay={openDay} />}
    </div>
  );
}

function DayView({ ownerID, dateISO, todayISO, me, showNew, setShowNew }: {
  ownerID: string; dateISO: string; todayISO: string; me: Identity;
  showNew: boolean; setShowNew: (v: boolean | ((p: boolean) => boolean)) => void;
}) {
  const store = useDemoStore();
  const dayAppts = store.appointmentsForOwnerOnDay(ownerID, dateISO);
  const settings = store.followUpSettingsForUser(me.user.id);
  const followUps = store.followUpTasksForOwnerOn(me.user.id, dateISO);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = dayAppts.find((a) => a.id === selectedId) ?? null;

  return (
    <>
      {showNew && <NewAppointmentForm dateISO={dateISO} me={me} onDone={() => setShowNew(false)} />}

      <DayTimeline appts={dayAppts} me={me} selectedId={selectedId} onSelect={setSelectedId} />
      {dayAppts.length === 0 && (
        <p className="mt-3 text-sm text-ink-soft">No appointments{dateISO === todayISO ? " today" : ""}.</p>
      )}

      {selected && (
        <div className="mt-4 rounded-inner border border-line bg-card px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-medium text-ink">{selected.patientName ?? "Blocked time"} · {timeLabel(selected.startMinute)}–{timeLabel(selected.endMinute)}</span>
            <span className="micro" style={{ color: apptColor(selected) }}>{STATUS_LABEL[selected.status]}</span>
          </div>
          {selected.appointmentNote && <p className="mt-0.5 text-sm text-ink-soft">{selected.appointmentNote}</p>}
          <AppointmentActions key={`${selected.startMinute}-${selected.endMinute}-${selected.status}`}
            appt={selected} me={me} onDone={() => setSelectedId(null)} />
        </div>
      )}

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
          <input type="checkbox" checked={settings.enabled}
            onChange={(e) => store.setFollowUpSettings({ ...settings, enabled: e.target.checked }, me)} />
          Remind me to follow up after a treatment
        </label>
        {settings.enabled && (
          <label className="mt-2 flex items-center gap-2 text-sm text-ink-soft">
            Interval
            <input type="number" min={1} max={90} value={settings.intervalDays}
              onChange={(e) => {
                const n = Math.min(90, Math.max(1, Number(e.target.value) || 1));
                store.setFollowUpSettings({ ...settings, intervalDays: n }, me);
              }}
              className="w-20 rounded-field border border-line px-2 py-1 text-sm text-ink" />
            days after treatment
          </label>
        )}
      </div>
    </>
  );
}

// Visible day window for the timeline views.
const WIN_START = 7 * 60;   // 07:00
const WIN_END = 19 * 60;    // 19:00
const PX_PER_MIN = 1;       // 60px / hour — a 30-min chip is 30px (fits one text line)
const TEXT_MIN_PX = 28;     // below this a chip is a colour-only bar
const DRAG_STEP = 5;        // snap dragged appointments to 5-minute steps
const DRAG_THRESHOLD = 4;   // px of movement before a press becomes a drag (vs a tap)

function hoursIn(): number[] {
  return Array.from({ length: (WIN_END - WIN_START) / 60 + 1 }, (_, i) => WIN_START / 60 + i);
}
function canReschedule(a: Appointment): boolean {
  return a.status === "awaitingConfirmation" || a.status === "confirmed";
}

// Full-width day timeline: hour rail + time-positioned blocks. Overlapping appointments
// lay out side-by-side (via layoutDay); a block can be dragged to reschedule its start,
// and a tap (movement under the threshold) selects it.
function DayTimeline({ appts, me, selectedId, onSelect }: {
  appts: Appointment[]; me: Identity; selectedId: string | null; onSelect: (id: string | null) => void;
}) {
  const railHeight = (WIN_END - WIN_START) * PX_PER_MIN;
  const cols = new Map<string, DayColumn>(
    layoutDay(appts.map((a) => ({ id: a.id, startMinute: a.startMinute, endMinute: a.endMinute }))).map((c) => [c.id, c]),
  );

  return (
    <div className="mt-6 grid" style={{ gridTemplateColumns: "3rem 1fr" }}>
      <div className="relative" style={{ height: railHeight }}>
        {hoursIn().map((h) => (
          <div key={h} className="pointer-events-none absolute right-1 -translate-y-1/2 text-xs text-ink-soft"
            style={{ top: (h * 60 - WIN_START) * PX_PER_MIN }}>{String(h).padStart(2, "0")}:00</div>
        ))}
      </div>
      <div className="relative border-l border-line" style={{ height: railHeight }}
        onClick={(e) => { if (e.target === e.currentTarget) onSelect(null); }}>
        {hoursIn().map((h) => (
          <div key={h} className="pointer-events-none absolute left-0 right-0 border-t border-line/60"
            style={{ top: (h * 60 - WIN_START) * PX_PER_MIN }} />
        ))}
        {appts.map((a) => (
          <TimelineBlock key={a.id} appt={a} me={me} layout={cols.get(a.id)!}
            selected={a.id === selectedId} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

function TimelineBlock({ appt, me, layout, selected, onSelect }: {
  appt: Appointment; me: Identity; layout: DayColumn; selected: boolean; onSelect: (id: string | null) => void;
}) {
  const store = useDemoStore();
  const [dragDy, setDragDy] = useState(0);
  const drag = useRef<{ startY: number; moved: boolean } | null>(null);
  const draggable = canReschedule(appt);

  const start = Math.max(appt.startMinute, WIN_START);
  const end = Math.min(appt.endMinute, WIN_END);
  if (end <= start) return null;
  const top = (start - WIN_START) * PX_PER_MIN;
  const height = Math.max(4, (end - start) * PX_PER_MIN);
  const showText = height >= TEXT_MIN_PX;
  const width = 100 / layout.cols;
  const left = layout.col * width;

  function onPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, moved: false };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const dy = e.clientY - drag.current.startY;
    if (Math.abs(dy) > DRAG_THRESHOLD) drag.current.moved = true;
    if (draggable && drag.current.moved) setDragDy(dy);
  }
  function onPointerUp() {
    const st = drag.current;
    drag.current = null;
    setDragDy(0);
    if (!st) return;
    if (!st.moved || !draggable) { onSelect(appt.id); return; } // a tap selects
    const duration = appt.endMinute - appt.startMinute;
    const newStart = dragStartMinute(appt.startMinute, dragDy, PX_PER_MIN, DRAG_STEP, duration, WIN_START, WIN_END);
    if (newStart !== appt.startMinute) store.rescheduleAppointment(appt.id, appt.dateISO, newStart, duration, me);
  }

  return (
    <button
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      className="absolute overflow-hidden rounded-[6px] px-1.5 py-0.5 text-left text-card"
      style={{
        top: top + dragDy, height, left: `calc(${left}% + 2px)`, width: `calc(${width}% - 4px)`,
        background: apptColor(appt), borderLeft: `3px solid ${apptTypeAccent(appt)}`,
        touchAction: "none", cursor: draggable ? "grab" : "pointer",
        outline: selected ? "2px solid var(--color-ink)" : "none", outlineOffset: 1,
        zIndex: dragDy !== 0 ? 10 : 1,
      }}
      title={`${timeLabel(appt.startMinute)} ${appt.patientName ?? "Blocked time"}`}>
      {showText && (
        <span className="block text-[11px] leading-tight">
          <span className="font-medium">{timeLabel(appt.startMinute)}</span> {appt.patientName ?? "—"}
        </span>
      )}
    </button>
  );
}

function WeekView({ ownerID, selectedISO, todayISO, openDay }: {
  ownerID: string; selectedISO: string; todayISO: string; openDay: (iso: string) => void;
}) {
  const store = useDemoStore();
  const days = weekDaysFor(selectedISO);
  const appts = store.appointmentsForOwnerInRange(ownerID, days[0], days[6]);
  const byDay = new Map<string, Appointment[]>();
  for (const a of appts) byDay.set(a.dateISO, [...(byDay.get(a.dateISO) ?? []), a]);
  const hours = Array.from({ length: (WIN_END - WIN_START) / 60 + 1 }, (_, i) => WIN_START / 60 + i);
  const railHeight = (WIN_END - WIN_START) * PX_PER_MIN;

  return (
    <div className="mt-6 overflow-x-auto">
      <div className="grid min-w-[680px]" style={{ gridTemplateColumns: "3rem repeat(7, minmax(0, 1fr))" }}>
        {/* header row */}
        <div />
        {days.map((iso) => (
          <button key={iso} onClick={() => openDay(iso)}
            className="border-b border-line px-1 pb-2 text-center text-sm hover:text-tint"
            style={iso === todayISO ? { color: "var(--color-tint)", fontWeight: 600 } : { color: "var(--color-ink-soft)" }}>
            {dayHeaderLabel(iso)}
          </button>
        ))}
        {/* hour rail */}
        <div className="relative" style={{ height: railHeight }}>
          {hours.map((h) => (
            <div key={h} className="absolute right-1 -translate-y-1/2 text-xs text-ink-soft"
              style={{ top: (h * 60 - WIN_START) * PX_PER_MIN }}>{String(h).padStart(2, "0")}:00</div>
          ))}
        </div>
        {/* day columns */}
        {days.map((iso) => {
          const dayAppts = byDay.get(iso) ?? [];
          const cols = new Map<string, DayColumn>(
            layoutDay(dayAppts.map((a) => ({ id: a.id, startMinute: a.startMinute, endMinute: a.endMinute }))).map((c) => [c.id, c]),
          );
          return (
            <div key={iso} className="relative border-l border-line" style={{ height: railHeight }}>
              {hours.map((h) => (
                <div key={h} className="absolute left-0 right-0 border-t border-line/60"
                  style={{ top: (h * 60 - WIN_START) * PX_PER_MIN }} />
              ))}
              {dayAppts.map((a) => {
                // Clamp both edges to the visible window; an appointment fully outside it is skipped.
                const start = Math.max(a.startMinute, WIN_START);
                const end = Math.min(a.endMinute, WIN_END);
                if (end <= start) return null;
                const top = (start - WIN_START) * PX_PER_MIN;
                const height = Math.max(4, (end - start) * PX_PER_MIN);
                const showText = height >= TEXT_MIN_PX;
                const layout = cols.get(a.id)!;
                const width = 100 / layout.cols;
                const left = layout.col * width;
                return (
                  <button key={a.id} onClick={() => openDay(iso)}
                    className="absolute overflow-hidden rounded-[6px] px-1.5 py-0.5 text-left text-card"
                    style={{ top, height, left: `calc(${left}% + 1px)`, width: `calc(${width}% - 2px)`,
                      background: apptColor(a), borderLeft: `3px solid ${apptTypeAccent(a)}` }}
                    title={`${timeLabel(a.startMinute)} ${a.patientName ?? "Blocked time"}`}>
                    {showText && (
                      <span className="block text-[11px] leading-tight">
                        <span className="font-medium">{timeLabel(a.startMinute)}</span> {a.patientName ?? "—"}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const MONTH_MAX_CHIPS = 3;

function MonthView({ ownerID, selectedISO, todayISO, openDay }: {
  ownerID: string; selectedISO: string; todayISO: string; openDay: (iso: string) => void;
}) {
  const store = useDemoStore();
  const cells = monthGridFor(selectedISO);
  const appts = store.appointmentsForOwnerInRange(ownerID, cells[0].iso, cells[cells.length - 1].iso);
  const byDay = new Map<string, Appointment[]>();
  for (const a of appts) byDay.set(a.dateISO, [...(byDay.get(a.dateISO) ?? []), a]);
  const weekdayHeads = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="mt-6">
      <div className="grid grid-cols-7 gap-px">
        {weekdayHeads.map((d) => <div key={d} className="pb-1 text-center text-xs text-ink-soft">{d}</div>)}
        {cells.map((c) => {
          const list = byDay.get(c.iso) ?? [];
          const day = Number(c.iso.slice(8, 10));
          const isToday = c.iso === todayISO;
          const isSelected = c.iso === selectedISO;
          return (
            <button key={c.iso} onClick={() => openDay(c.iso)}
              className="flex min-h-[92px] flex-col gap-1 rounded-inner border border-line p-1.5 text-left hover:border-tint"
              style={{
                background: isSelected ? "var(--color-tint)" : c.isWeekend ? "var(--color-paper-deep)" : "var(--color-card)",
                opacity: c.inMonth ? 1 : 0.45,
              }}>
              <span className="text-xs font-medium"
                style={{ color: isSelected ? "var(--color-card)" : isToday ? "var(--color-tint)" : "var(--color-ink-soft)" }}>
                {isToday && !isSelected ? `• ${day}` : day}
              </span>
              {list.slice(0, MONTH_MAX_CHIPS).map((a) => (
                <span key={a.id} className="flex items-center gap-1 truncate text-[10px] leading-tight"
                  style={{ color: isSelected ? "var(--color-card)" : "var(--color-ink)" }}>
                  <span className="inline-block h-2 w-1 flex-none rounded-sm" style={{ background: apptColor(a) }} />
                  <span className="truncate">{timeLabel(a.startMinute)} {a.patientName ?? "—"}</span>
                </span>
              ))}
              {list.length > MONTH_MAX_CHIPS && (
                <span className="text-[10px]" style={{ color: isSelected ? "var(--color-card)" : "var(--color-ink-soft)" }}>
                  +{list.length - MONTH_MAX_CHIPS}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NewAppointmentForm({ dateISO, me, onDone }: { dateISO: string; me: Identity; onDone: () => void }) {
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
      dateISO, startMinute: minutesFromTime(time), durationMinutes: duration,
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

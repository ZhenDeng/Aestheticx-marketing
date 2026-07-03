"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { isoDay, isLeadAppointment, leadName, appointmentTitle, draftFromLead, canCreatePatient, BackendError } from "@/lib/demo/backend";
import { PatientForm } from "@/components/app/PatientForm";
import { LeadFields, leadFromDraft, emptyLeadDraft, type LeadDraft } from "@/components/app/LeadFields";
import {
  addDaysISO, shiftMonthISO, weekDaysFor, monthGridFor,
  monthLabel, weekRangeLabel, dayHeaderLabel, dayLabel,
  layoutDay, dragStartMinute, dragEndMinute, dragTopMinute, edgeScrollVelocity, slotStartMinute, dayDelta, type DayColumn,
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
      {view === "week" && <WeekView ownerID={ownerID} selectedISO={selectedISO} todayISO={todayISO} me={me} openDay={openDay} />}
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
  const [chooser, setChooser] = useState<number | null>(null); // tapped start minute
  const [slotForm, setSlotForm] = useState<{ start: number; block: boolean } | null>(null);
  const selected = dayAppts.find((a) => a.id === selectedId) ?? null;
  const showForm = showNew || slotForm !== null;
  function closeForm() { setShowNew(false); setSlotForm(null); }

  return (
    <>
      {showForm && (
        <NewAppointmentForm dateISO={dateISO} me={me}
          initialStart={slotForm?.start} initialBlock={slotForm?.block} onDone={closeForm} />
      )}

      {chooser !== null && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-inner border border-line bg-card px-4 py-3">
          <span className="text-sm text-ink-soft">Add at {timeLabel(chooser)}</span>
          <button onClick={() => { setSlotForm({ start: chooser, block: false }); setChooser(null); }}
            className="rounded-btn px-3 py-1.5 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>New appointment</button>
          <button onClick={() => { setSlotForm({ start: chooser, block: true }); setChooser(null); }}
            className="rounded-btn border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-tint">Block time</button>
          <button onClick={() => setChooser(null)} className="rounded-btn px-2 py-1.5 text-sm text-ink-soft">Cancel</button>
        </div>
      )}

      <DayTimeline appts={dayAppts} me={me} selectedId={selectedId} onSelect={setSelectedId}
        onEmptyTap={(startMinute) => { setChooser(startMinute); setSlotForm(null); }} />
      {dayAppts.length === 0 && (
        <p className="mt-3 text-sm text-ink-soft">No appointments{dateISO === todayISO ? " today" : ""}. Tap the timeline to add one.</p>
      )}

      {selected && <AppointmentDetail key={selected.id} appt={selected} me={me} onDone={() => setSelectedId(null)} />}

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
const MIN_DURATION = 15;    // an appointment can't be resized shorter than this
const SLOT_STEP = 15;       // tap-to-create snaps the start to 15-minute steps
const HOURS_IN = Array.from({ length: (WIN_END - WIN_START) / 60 + 1 }, (_, i) => WIN_START / 60 + i);

function canReschedule(a: Appointment): boolean {
  return a.status === "awaitingConfirmation" || a.status === "confirmed";
}

// Full-width day timeline: hour rail + time-positioned blocks. Overlapping appointments
// lay out side-by-side (via layoutDay); a block can be dragged to reschedule its start,
// and a tap (movement under the threshold) selects it.
function DayTimeline({ appts, me, selectedId, onSelect, onEmptyTap }: {
  appts: Appointment[]; me: Identity; selectedId: string | null;
  onSelect: (id: string | null) => void; onEmptyTap: (startMinute: number) => void;
}) {
  const railHeight = (WIN_END - WIN_START) * PX_PER_MIN;
  const cols = new Map<string, DayColumn>(
    layoutDay(appts.map((a) => ({ id: a.id, startMinute: a.startMinute, endMinute: a.endMinute }))).map((c) => [c.id, c]),
  );

  // A click on the bare column (grid lines are pointer-events-none, blocks are separate
  // targets) is an empty-slot tap: clear any selection and offer to add at the tapped time.
  function onColumnClick(e: React.MouseEvent) {
    if (e.target !== e.currentTarget) return;
    onSelect(null);
    onEmptyTap(slotStartMinute(e.nativeEvent.offsetY, PX_PER_MIN, SLOT_STEP, WIN_START, WIN_END));
  }

  return (
    <div className="mt-6 grid" style={{ gridTemplateColumns: "3rem 1fr" }}>
      <div className="relative" style={{ height: railHeight }}>
        {HOURS_IN.map((h) => (
          <div key={h} className="pointer-events-none absolute right-1 -translate-y-1/2 text-xs text-ink-soft"
            style={{ top: (h * 60 - WIN_START) * PX_PER_MIN }}>{String(h).padStart(2, "0")}:00</div>
        ))}
      </div>
      <div className="relative border-l border-line" style={{ height: railHeight }} onClick={onColumnClick}>
        {HOURS_IN.map((h) => (
          <div key={h} className="pointer-events-none absolute left-0 right-0 border-t border-line/60"
            style={{ top: (h * 60 - WIN_START) * PX_PER_MIN }} />
        ))}
        {appts.map((a) => (
          <TimelineBlock key={a.id} appt={a} me={me} layout={cols.get(a.id) ?? { id: a.id, col: 0, cols: 1 }}
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
  const [resizeDy, setResizeDy] = useState(0);
  const [topDy, setTopDy] = useState(0);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  // `dy` lives in the ref (not state) so onPointerUp commits the latest delta, not a stale render's.
  // clientY + startScrollY feed the edge auto-scroll loop: scrolling moves the drop time under a
  // stationary pointer, so the scroll delta joins the pointer delta.
  const drag = useRef<{ startY: number; moved: boolean; dy: number; clientY: number; startScrollY: number } | null>(null);
  const resize = useRef<{ startY: number; dy: number } | null>(null);
  const topResize = useRef<{ startY: number; dy: number } | null>(null);
  const scrollLoop = useRef<number | null>(null);
  const draggable = canReschedule(appt);

  const stopScrollLoop = useCallback(() => {
    if (scrollLoop.current !== null) { cancelAnimationFrame(scrollLoop.current); scrollLoop.current = null; }
  }, []);
  useEffect(() => stopScrollLoop, [stopScrollLoop]); // unmount safety

  // While a move drag sits in an edge zone, scroll the window and refresh the compensated
  // delta — pointermove doesn't fire for a stationary pointer, so the loop does both.
  function startScrollLoop() {
    if (scrollLoop.current !== null) return;
    const step = () => {
      const st = drag.current;
      if (!st || !st.moved) { scrollLoop.current = null; return; }
      const v = edgeScrollVelocity(st.clientY, window.innerHeight);
      if (v !== 0) {
        window.scrollBy(0, v);
        st.dy = (st.clientY - st.startY) + (window.scrollY - st.startScrollY);
        setDragDy(st.dy);
      }
      scrollLoop.current = requestAnimationFrame(step);
    };
    scrollLoop.current = requestAnimationFrame(step);
  }

  const start = Math.max(appt.startMinute, WIN_START);
  const end = Math.min(appt.endMinute, WIN_END);
  if (end <= start) return null;
  // Preview both resizes through the same clamps used at commit time, so the visual edges
  // never invert, collapse below the minimum, or run past the window.
  const previewStart = topDy !== 0
    ? dragTopMinute(appt.startMinute, topDy, PX_PER_MIN, DRAG_STEP, appt.endMinute, MIN_DURATION, WIN_START)
    : start;
  const previewEnd = resizeDy !== 0
    ? dragEndMinute(appt.endMinute, resizeDy, PX_PER_MIN, DRAG_STEP, appt.startMinute, MIN_DURATION, WIN_END)
    : end;
  const top = (previewStart - WIN_START) * PX_PER_MIN;
  const height = Math.max(4, (previewEnd - previewStart) * PX_PER_MIN);
  const showText = height >= TEXT_MIN_PX;
  const width = 100 / layout.cols;
  const left = layout.col * width;

  function onPointerDown(e: React.PointerEvent) {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* no active pointer (e.g. tests) — capture is best-effort */ }
    drag.current = { startY: e.clientY, moved: false, dy: 0, clientY: e.clientY, startScrollY: window.scrollY };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    drag.current.clientY = e.clientY;
    const dy = (e.clientY - drag.current.startY) + (window.scrollY - drag.current.startScrollY);
    drag.current.dy = dy;
    if (Math.abs(dy) > DRAG_THRESHOLD) drag.current.moved = true;
    if (draggable && drag.current.moved) {
      setDragDy(dy);
      startScrollLoop();
    }
  }
  function onPointerUp() {
    stopScrollLoop();
    const st = drag.current;
    drag.current = null;
    setDragDy(0);
    if (!st) return;
    if (!st.moved || !draggable) { onSelect(appt.id); return; } // a tap selects
    const duration = appt.endMinute - appt.startMinute;
    const newStart = dragStartMinute(appt.startMinute, st.dy, PX_PER_MIN, DRAG_STEP, duration, WIN_START, WIN_END);
    if (newStart !== appt.startMinute) {
      try {
        store.rescheduleAppointment(appt.id, appt.dateISO, newStart, duration, me);
        setScheduleError(null);
      } catch (e) {
        setScheduleError(e instanceof BackendError && e.message === "unavailable"
          ? "That time is outside your treatment hours or on a blocked time."
          : "Could not move the appointment. Please try again.");
      }
    }
  }
  // OS/browser interruptions (call, notification, home-bar swipe) fire pointercancel, not
  // pointerup — reset so the captured pointer state isn't leaked into the next gesture.
  function onPointerCancel() {
    stopScrollLoop();
    drag.current = null;
    setDragDy(0);
  }

  // Bottom-edge resize — a distinct gesture from the body move-drag (stopPropagation) and
  // from a tap. Changes the end time only; the start stays put.
  function onResizeDown(e: React.PointerEvent) {
    e.stopPropagation();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* no active pointer (e.g. tests) — capture is best-effort */ }
    resize.current = { startY: e.clientY, dy: 0 };
  }
  function onResizeMove(e: React.PointerEvent) {
    if (!resize.current) return;
    e.stopPropagation();
    const dy = e.clientY - resize.current.startY;
    resize.current.dy = dy;
    setResizeDy(dy);
  }
  function onResizeUp(e: React.PointerEvent) {
    e.stopPropagation(); // always stop, regardless of ref state, so the parent never sees this up
    const st = resize.current;
    resize.current = null;
    setResizeDy(0);
    if (!st) return;
    const newEnd = dragEndMinute(appt.endMinute, st.dy, PX_PER_MIN, DRAG_STEP, appt.startMinute, MIN_DURATION, WIN_END);
    const duration = newEnd - appt.startMinute;
    if (duration !== appt.endMinute - appt.startMinute) {
      try {
        store.rescheduleAppointment(appt.id, appt.dateISO, appt.startMinute, duration, me);
        setScheduleError(null);
      } catch (e) {
        setScheduleError(e instanceof BackendError && e.message === "unavailable"
          ? "That time is outside your treatment hours or on a blocked time."
          : "Could not move the appointment. Please try again.");
      }
    }
  }
  function onResizeCancel() {
    resize.current = null;
    setResizeDy(0);
  }

  // Top-edge resize — moves the start while the end stays put (the mirror of the bottom
  // handle). Same gesture discipline: stopPropagation from the body drag, pointer capture,
  // cancel-safe.
  function onTopDown(e: React.PointerEvent) {
    e.stopPropagation();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* no active pointer (e.g. tests) — capture is best-effort */ }
    topResize.current = { startY: e.clientY, dy: 0 };
  }
  function onTopMove(e: React.PointerEvent) {
    if (!topResize.current) return;
    e.stopPropagation();
    const dy = e.clientY - topResize.current.startY;
    topResize.current.dy = dy;
    setTopDy(dy);
  }
  function onTopUp(e: React.PointerEvent) {
    e.stopPropagation(); // always stop, regardless of ref state, so the parent never sees this up
    const st = topResize.current;
    topResize.current = null;
    setTopDy(0);
    if (!st) return;
    const newStart = dragTopMinute(appt.startMinute, st.dy, PX_PER_MIN, DRAG_STEP, appt.endMinute, MIN_DURATION, WIN_START);
    if (newStart !== appt.startMinute) {
      try {
        store.rescheduleAppointment(appt.id, appt.dateISO, newStart, appt.endMinute - newStart, me);
        setScheduleError(null);
      } catch (e) {
        setScheduleError(e instanceof BackendError && e.message === "unavailable"
          ? "That time is outside your treatment hours or on a blocked time."
          : "Could not move the appointment. Please try again.");
      }
    }
  }
  function onTopCancel() {
    topResize.current = null;
    setTopDy(0);
  }

  return (
    <button
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}
      className="absolute overflow-hidden rounded-[6px] px-1.5 py-0.5 text-left text-card"
      style={{
        top: top + dragDy, height, left: `calc(${left}% + 2px)`, width: `calc(${width}% - 4px)`,
        background: apptColor(appt), borderLeft: `3px solid ${apptTypeAccent(appt)}`,
        touchAction: "none", cursor: draggable ? "grab" : "pointer",
        outline: selected ? "2px solid var(--color-ink)" : "none", outlineOffset: 1,
        zIndex: dragDy !== 0 || resizeDy !== 0 || topDy !== 0 ? 10 : 1,
      }}
      aria-label={`${timeLabel(appt.startMinute)}–${timeLabel(appt.endMinute)} ${appointmentTitle(appt, "Blocked time")}, ${STATUS_LABEL[appt.status]}`}
      title={`${timeLabel(appt.startMinute)} ${appointmentTitle(appt, "Blocked time")}`}>
      {showText && (
        <span className="block text-[11px] leading-tight">
          <span className="font-medium">{timeLabel(appt.startMinute)}</span> {appointmentTitle(appt)}
        </span>
      )}
      {draggable && (
        <>
          <span
            onPointerDown={onTopDown} onPointerMove={onTopMove} onPointerUp={onTopUp} onPointerCancel={onTopCancel}
            className="absolute inset-x-0 top-0 h-2"
            style={{ cursor: "ns-resize", touchAction: "none" }}
            aria-hidden />
          <span
            onPointerDown={onResizeDown} onPointerMove={onResizeMove} onPointerUp={onResizeUp} onPointerCancel={onResizeCancel}
            className="absolute inset-x-0 bottom-0 h-2"
            style={{ cursor: "ns-resize", touchAction: "none" }}
            aria-hidden />
        </>
      )}
      {scheduleError && (
        <p className="mt-1 text-[10px] leading-tight" style={{ color: "var(--color-rose)" }}>{scheduleError}</p>
      )}
    </button>
  );
}

// A week chip with the day-timeline gestures adapted to the grid: drag to reschedule
// (vertical → time, horizontal → another day), top/bottom-edge drag to resize, tap → open the day.
function WeekBlock({ appt, me, days, dayIndex, layout, openDay }: {
  appt: Appointment; me: Identity; days: string[]; dayIndex: number; layout: DayColumn; openDay: (iso: string) => void;
}) {
  const store = useDemoStore();
  const [move, setMove] = useState<{ dx: number; dy: number } | null>(null);
  const [resizeDy, setResizeDy] = useState(0);
  const [topDy, setTopDy] = useState(0);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const drag = useRef<{
    startX: number; startY: number; moved: boolean; dx: number; dy: number; colW: number;
    clientY: number; startScrollY: number;
  } | null>(null);
  const resize = useRef<{ startY: number; dy: number } | null>(null);
  const topResize = useRef<{ startY: number; dy: number } | null>(null);
  const scrollLoop = useRef<number | null>(null);
  const draggable = canReschedule(appt);

  const stopScrollLoop = useCallback(() => {
    if (scrollLoop.current !== null) { cancelAnimationFrame(scrollLoop.current); scrollLoop.current = null; }
  }, []);
  useEffect(() => stopScrollLoop, [stopScrollLoop]); // unmount safety

  // Edge auto-scroll during the move drag — see TimelineBlock; vertical only (the week grid
  // fits the viewport horizontally).
  function startScrollLoop() {
    if (scrollLoop.current !== null) return;
    const step = () => {
      const st = drag.current;
      if (!st || !st.moved) { scrollLoop.current = null; return; }
      const v = edgeScrollVelocity(st.clientY, window.innerHeight);
      if (v !== 0) {
        window.scrollBy(0, v);
        st.dy = (st.clientY - st.startY) + (window.scrollY - st.startScrollY);
        setMove({ dx: st.dx, dy: st.dy });
      }
      scrollLoop.current = requestAnimationFrame(step);
    };
    scrollLoop.current = requestAnimationFrame(step);
  }

  const start = Math.max(appt.startMinute, WIN_START);
  const end = Math.min(appt.endMinute, WIN_END);
  if (end <= start) return null;
  const previewStart = topDy !== 0
    ? dragTopMinute(appt.startMinute, topDy, PX_PER_MIN, DRAG_STEP, appt.endMinute, MIN_DURATION, WIN_START)
    : start;
  const previewEnd = resizeDy !== 0
    ? dragEndMinute(appt.endMinute, resizeDy, PX_PER_MIN, DRAG_STEP, appt.startMinute, MIN_DURATION, WIN_END)
    : end;
  const top = (previewStart - WIN_START) * PX_PER_MIN;
  const height = Math.max(4, (previewEnd - previewStart) * PX_PER_MIN);
  const showText = height >= TEXT_MIN_PX;
  const width = 100 / layout.cols;
  const left = layout.col * width;

  function onPointerDown(e: React.PointerEvent) {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* no active pointer (e.g. tests) — capture is best-effort */ }
    // Reconstruct the full column width from the chip's own rect (chip width = colW/cols),
    // which is always available and transform/scroll-invariant (unlike offsetParent).
    const colW = e.currentTarget.getBoundingClientRect().width * layout.cols;
    drag.current = {
      startX: e.clientX, startY: e.clientY, moved: false, dx: 0, dy: 0, colW,
      clientY: e.clientY, startScrollY: window.scrollY,
    };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    drag.current.clientY = e.clientY;
    const dx = e.clientX - drag.current.startX;
    const dy = (e.clientY - drag.current.startY) + (window.scrollY - drag.current.startScrollY);
    drag.current.dx = dx; drag.current.dy = dy;
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) drag.current.moved = true;
    if (draggable && drag.current.moved) {
      setMove({ dx, dy });
      startScrollLoop();
    }
  }
  function onPointerUp() {
    stopScrollLoop();
    const st = drag.current; drag.current = null; setMove(null);
    if (!st) return;
    if (!st.moved) { openDay(appt.dateISO); return; } // a tap opens the day
    if (!draggable) return; // dragged a non-reschedulable chip — discard silently
    const duration = appt.endMinute - appt.startMinute;
    const targetISO = days[Math.max(0, Math.min(days.length - 1, dayIndex + dayDelta(st.dx, st.colW)))];
    const newStart = dragStartMinute(appt.startMinute, st.dy, PX_PER_MIN, DRAG_STEP, duration, WIN_START, WIN_END);
    if (targetISO !== appt.dateISO || newStart !== appt.startMinute) {
      try {
        store.rescheduleAppointment(appt.id, targetISO, newStart, duration, me);
        setScheduleError(null);
      } catch (e) {
        setScheduleError(e instanceof BackendError && e.message === "unavailable"
          ? "That time is outside your treatment hours or on a blocked time."
          : "Could not move the appointment. Please try again.");
      }
    }
  }
  function onPointerCancel() { stopScrollLoop(); drag.current = null; setMove(null); }

  function onResizeDown(e: React.PointerEvent) {
    e.stopPropagation();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* no active pointer (e.g. tests) — capture is best-effort */ }
    resize.current = { startY: e.clientY, dy: 0 };
  }
  function onResizeMove(e: React.PointerEvent) {
    if (!resize.current) return;
    e.stopPropagation();
    const dy = e.clientY - resize.current.startY;
    resize.current.dy = dy;
    setResizeDy(dy);
  }
  function onResizeUp(e: React.PointerEvent) {
    e.stopPropagation();
    const st = resize.current; resize.current = null; setResizeDy(0);
    if (!st) return;
    const newEnd = dragEndMinute(appt.endMinute, st.dy, PX_PER_MIN, DRAG_STEP, appt.startMinute, MIN_DURATION, WIN_END);
    const duration = newEnd - appt.startMinute;
    if (duration !== appt.endMinute - appt.startMinute) {
      try {
        store.rescheduleAppointment(appt.id, appt.dateISO, appt.startMinute, duration, me);
        setScheduleError(null);
      } catch (e) {
        setScheduleError(e instanceof BackendError && e.message === "unavailable"
          ? "That time is outside your treatment hours or on a blocked time."
          : "Could not move the appointment. Please try again.");
      }
    }
  }
  function onResizeCancel() { resize.current = null; setResizeDy(0); }

  // Top-edge resize — moves the start, end fixed (mirror of the bottom handle).
  function onTopDown(e: React.PointerEvent) {
    e.stopPropagation();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* no active pointer (e.g. tests) — capture is best-effort */ }
    topResize.current = { startY: e.clientY, dy: 0 };
  }
  function onTopMove(e: React.PointerEvent) {
    if (!topResize.current) return;
    e.stopPropagation();
    const dy = e.clientY - topResize.current.startY;
    topResize.current.dy = dy;
    setTopDy(dy);
  }
  function onTopUp(e: React.PointerEvent) {
    e.stopPropagation();
    const st = topResize.current; topResize.current = null; setTopDy(0);
    if (!st) return;
    const newStart = dragTopMinute(appt.startMinute, st.dy, PX_PER_MIN, DRAG_STEP, appt.endMinute, MIN_DURATION, WIN_START);
    if (newStart !== appt.startMinute) {
      try {
        store.rescheduleAppointment(appt.id, appt.dateISO, newStart, appt.endMinute - newStart, me);
        setScheduleError(null);
      } catch (e) {
        setScheduleError(e instanceof BackendError && e.message === "unavailable"
          ? "That time is outside your treatment hours or on a blocked time."
          : "Could not move the appointment. Please try again.");
      }
    }
  }
  function onTopCancel() { topResize.current = null; setTopDy(0); }

  return (
    <button
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}
      className="absolute overflow-hidden rounded-[6px] px-1.5 py-0.5 text-left text-card"
      style={{
        top, height, left: `calc(${left}% + 1px)`, width: `calc(${width}% - 2px)`,
        background: apptColor(appt), borderLeft: `3px solid ${apptTypeAccent(appt)}`,
        transform: move ? `translate(${move.dx}px, ${move.dy}px)` : undefined,
        touchAction: "none", cursor: draggable ? "grab" : "pointer",
        zIndex: move || resizeDy !== 0 || topDy !== 0 ? 10 : 1,
      }}
      aria-label={`${timeLabel(appt.startMinute)}–${timeLabel(appt.endMinute)} ${appointmentTitle(appt, "Blocked time")}, ${STATUS_LABEL[appt.status]}`}
      title={`${timeLabel(appt.startMinute)} ${appointmentTitle(appt, "Blocked time")}`}>
      {showText && (
        <span className="block text-[11px] leading-tight">
          <span className="font-medium">{timeLabel(appt.startMinute)}</span> {appointmentTitle(appt)}
        </span>
      )}
      {draggable && (
        <>
          <span
            onPointerDown={onTopDown} onPointerMove={onTopMove} onPointerUp={onTopUp} onPointerCancel={onTopCancel}
            className="absolute inset-x-0 top-0 h-2"
            style={{ cursor: "ns-resize", touchAction: "none" }}
            aria-hidden />
          <span
            onPointerDown={onResizeDown} onPointerMove={onResizeMove} onPointerUp={onResizeUp} onPointerCancel={onResizeCancel}
            className="absolute inset-x-0 bottom-0 h-2"
            style={{ cursor: "ns-resize", touchAction: "none" }}
            aria-hidden />
        </>
      )}
      {scheduleError && (
        <p className="mt-1 text-[10px] leading-tight" style={{ color: "var(--color-rose)" }}>{scheduleError}</p>
      )}
    </button>
  );
}

function WeekView({ ownerID, selectedISO, todayISO, me, openDay }: {
  ownerID: string; selectedISO: string; todayISO: string; me: Identity; openDay: (iso: string) => void;
}) {
  const store = useDemoStore();
  const days = weekDaysFor(selectedISO);
  const appts = store.appointmentsForOwnerInRange(ownerID, days[0], days[6]);
  const byDay = new Map<string, Appointment[]>();
  for (const a of appts) byDay.set(a.dateISO, [...(byDay.get(a.dateISO) ?? []), a]);
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
          {HOURS_IN.map((h) => (
            <div key={h} className="absolute right-1 -translate-y-1/2 text-xs text-ink-soft"
              style={{ top: (h * 60 - WIN_START) * PX_PER_MIN }}>{String(h).padStart(2, "0")}:00</div>
          ))}
        </div>
        {/* day columns */}
        {days.map((iso, dayIndex) => {
          const dayAppts = byDay.get(iso) ?? [];
          const cols = new Map<string, DayColumn>(
            layoutDay(dayAppts.map((a) => ({ id: a.id, startMinute: a.startMinute, endMinute: a.endMinute }))).map((c) => [c.id, c]),
          );
          return (
            <div key={iso} className="relative border-l border-line" style={{ height: railHeight }}>
              {HOURS_IN.map((h) => (
                <div key={h} className="absolute left-0 right-0 border-t border-line/60"
                  style={{ top: (h * 60 - WIN_START) * PX_PER_MIN }} />
              ))}
              {dayAppts.map((a) => (
                <WeekBlock key={a.id} appt={a} me={me} days={days} dayIndex={dayIndex}
                  layout={cols.get(a.id) ?? { id: a.id, col: 0, cols: 1 }} openDay={openDay} />
              ))}
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
                  <span className="truncate">{timeLabel(a.startMinute)} {appointmentTitle(a)}</span>
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

function NewAppointmentForm({ dateISO, me, onDone, initialStart, initialBlock }: {
  dateISO: string; me: Identity; onDone: () => void; initialStart?: number; initialBlock?: boolean;
}) {
  const store = useDemoStore();
  const [blockTime, setBlockTime] = useState(initialBlock ?? false);
  const [newPatient, setNewPatient] = useState(false);
  const [leadDraft, setLeadDraft] = useState<LeadDraft>(emptyLeadDraft());
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const [time, setTime] = useState(initialStart != null ? timeValue(initialStart) : "10:00");
  const [duration, setDuration] = useState(30);
  const [note, setNote] = useState("");

  const matches = !blockTime && !newPatient && query.trim() && !picked ? store.searchPatients(query, me).slice(0, 5) : [];
  const lead = newPatient ? leadFromDraft(leadDraft) : null;
  const canSave = blockTime || (newPatient ? lead !== null : picked !== null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  function save() {
    try {
      store.bookTreatmentAppointment({
        dateISO, startMinute: minutesFromTime(time), durationMinutes: duration,
        patientID: blockTime || newPatient ? undefined : picked?.id,
        patientName: blockTime || newPatient ? undefined : picked?.name,
        lead: lead ?? undefined,
        note: note.trim() || undefined, identity: me,
      });
      setScheduleError(null);
      onDone();
    } catch (e) {
      setScheduleError(e instanceof BackendError && e.message === "unavailable"
        ? "That time is outside your treatment hours or on a blocked time."
        : "Could not book the appointment. Please try again.");
    }
  }

  return (
    <div className="mt-4 rounded-inner border border-line bg-card p-4">
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={blockTime} onChange={(e) => { setBlockTime(e.target.checked); if (e.target.checked) setNewPatient(false); setPicked(null); }} />
          Block time (no patient)
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={newPatient} onChange={(e) => { setNewPatient(e.target.checked); if (e.target.checked) setBlockTime(false); setPicked(null); }} />
          New patient (no file yet)
        </label>
      </div>

      {newPatient && (
        <div className="mt-3">
          <LeadFields value={leadDraft} onChange={setLeadDraft} />
        </div>
      )}

      {!blockTime && !newPatient && (
        <div className="mt-3">
          {picked ? (
            <p className="text-sm text-ink">{picked.name} <button onClick={() => setPicked(null)} className="ml-2 text-ink-soft underline">change</button></p>
          ) : (
            <>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, DOB (dd/mm/yyyy), or phone"
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
      {scheduleError && <p className="mt-2 text-sm" style={{ color: "var(--color-rose)" }}>{scheduleError}</p>}
    </div>
  );
}

// Detail panel for the selected appointment: an actionable patient row (link to file /
// create-from-lead) plus the status quick-actions.
function AppointmentDetail({ appt, me, onDone }: { appt: Appointment; me: Identity; onDone: () => void }) {
  const store = useDemoStore();
  const [creating, setCreating] = useState(false);
  const lead = isLeadAppointment(appt);

  return (
    <div className="mt-4 rounded-inner border border-line bg-card px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium text-ink">
          {appt.patientID ? (
            <Link href={`/app/patients/${appt.patientID}`} className="underline decoration-line underline-offset-2 hover:decoration-tint">{appt.patientName ?? "Patient"}</Link>
          ) : lead ? (
            <>{leadName(appt) || "New patient"} <span className="micro text-ink-soft">· new patient</span></>
          ) : "Blocked time"}
          {" · "}{timeLabel(appt.startMinute)}–{timeLabel(appt.endMinute)}
        </span>
        <span className="micro" style={{ color: apptColor(appt) }}>{STATUS_LABEL[appt.status]}</span>
      </div>
      {appt.appointmentNote && <p className="mt-0.5 text-sm text-ink-soft">{appt.appointmentNote}</p>}

      {lead && !creating && canCreatePatient(me) && (
        <button onClick={() => setCreating(true)}
          className="mt-2 rounded-btn border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-tint">Create patient from lead</button>
      )}
      {lead && creating ? (
        <div className="mt-3 border-t border-line pt-3">
          <PatientForm mode="create" compact initial={draftFromLead(appt)}
            onCreated={(id) => store.linkAppointmentPatient(appt.id, id, me)}
            onCancel={() => setCreating(false)} />
        </div>
      ) : (
        <AppointmentActions key={`${appt.startMinute}-${appt.endMinute}-${appt.status}`} appt={appt} me={me} onDone={onDone} />
      )}
    </div>
  );
}

function AppointmentActions({ appt, me, onDone }: { appt: Appointment; me: Identity; onDone: () => void }) {
  const store = useDemoStore();
  const [time, setTime] = useState(timeValue(appt.startMinute));
  const [duration, setDuration] = useState(appt.endMinute - appt.startMinute);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const canMark = appt.status === "awaitingConfirmation" || appt.status === "confirmed";

  // Status actions can race (the appointment may have just been actioned elsewhere); the
  // store eager-validates so the BackendError lands here, surfaced on the existing error line.
  function act(fn: () => void) {
    try {
      fn();
      setScheduleError(null);
      onDone();
    } catch {
      setScheduleError("Could not update this appointment — it may have just been actioned elsewhere.");
    }
  }

  return (
    <div className="mt-2 border-t border-line pt-2">
      {canMark ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="rounded-field border border-line px-2 py-1 text-sm text-ink" />
            <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="rounded-field border border-line px-2 py-1 text-sm text-ink">
              {[15, 30, 45, 60].map((d) => <option key={d} value={d}>{d} min</option>)}
            </select>
            <button onClick={() => {
              try {
                store.rescheduleAppointment(appt.id, appt.dateISO, minutesFromTime(time), duration, me);
                setScheduleError(null);
                onDone();
              } catch (e) {
                setScheduleError(e instanceof BackendError && e.message === "unavailable"
                  ? "That time is outside your treatment hours or on a blocked time."
                  : "Could not move the appointment. Please try again.");
              }
            }}
                    className="rounded-btn border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-tint">Reschedule</button>
          </div>
          {scheduleError && <p className="mt-2 text-sm" style={{ color: "var(--color-rose)" }}>{scheduleError}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            {appt.status === "awaitingConfirmation" && (
              <button onClick={() => act(() => store.confirmAppointment(appt.id, me))}
                      className="rounded-btn px-3 py-1.5 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>Confirm</button>
            )}
            <button onClick={() => act(() => store.markAppointment(appt.id, "completed", me))} className="rounded-btn border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-tint">Complete</button>
            <button onClick={() => act(() => store.markAppointment(appt.id, "noShow", me))} className="rounded-btn border border-line px-3 py-1.5 text-sm" style={{ color: "var(--color-rose)" }}>No-show</button>
            <button onClick={() => act(() => store.markAppointment(appt.id, "cancelled", me))} className="rounded-btn border border-line px-3 py-1.5 text-sm" style={{ color: "var(--color-rose)" }}>Cancel</button>
          </div>
        </>
      ) : (
        <p className="text-sm text-ink-soft">No actions available for a {STATUS_LABEL[appt.status].toLowerCase()} appointment.</p>
      )}
    </div>
  );
}

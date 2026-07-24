"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { isoDay, isLeadAppointment, leadName, appointmentChipTitle, appointmentContact, draftFromLead, canCreatePatient, canRescheduleAppointment, canManageAppointment, appointmentOwnerScope, BackendError } from "@/lib/demo/backend";
import { PendingBookings } from "@/components/app/PendingBookings";
import { ConfirmAction } from "@/components/app/ConfirmAction";
import { ClientInvoiceComposer } from "@/components/app/ClientInvoiceComposer";
import { externalBusyForDate } from "@/lib/demo/externalBusy";
import { PatientForm } from "@/components/app/PatientForm";
import { LeadFields, leadFromDraft, emptyLeadDraft, type LeadDraft } from "@/components/app/LeadFields";
import {
  addDaysISO, shiftMonthISO, weekDaysFor, weekStartISO, monthGridFor,
  monthLabel, weekRangeLabel, dayHeaderLabel, dayLabel,
  layoutDay, dragStartMinute, dragEndMinute, dragTopMinute, edgeScrollVelocity, slotStartMinute, dayDelta, type DayColumn,
} from "@/lib/demo/calendar";
import type { Appointment, AppointmentReminderLead, AppointmentStatus, FollowUpNamedPreset, FollowUpPreset, Identity } from "@/lib/demo/types";
import { categoryDisplayName, PRODUCT_CATEGORIES } from "@/lib/demo/catalog";

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
  const [view, setView] = useState<View>("week");
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
      <PendingBookings me={me} />
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
        {(view === "day" || view === "week") && (
          <button onClick={() => setShowNew((v) => !v)}
            className="ml-auto rounded-btn px-4 py-2 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>
            New appointment
          </button>
        )}
      </div>

      {/* key={selectedISO}: stepping the period REMOUNTS the view so tap-state (selection,
          empty-slot chooser, slot form) can never leak onto a different week/day — a stale
          chooser could otherwise book an appointment on a date no longer on screen. */}
      {view === "day" && (
        <DayView key={selectedISO} ownerID={ownerID} dateISO={selectedISO} todayISO={todayISO} me={me}
          showNew={showNew} setShowNew={setShowNew} />
      )}
      {view === "week" && (
        <WeekView key={weekStartISO(selectedISO)} ownerID={ownerID} selectedISO={selectedISO} todayISO={todayISO} me={me} openDay={openDay}
          showNew={showNew} setShowNew={setShowNew} />
      )}
      {view === "month" && <MonthView ownerID={ownerID} selectedISO={selectedISO} todayISO={todayISO} me={me} openDay={openDay} />}
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
  const reminderLead = store.appointmentReminderForUser(me.user.id);
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

      <DayTimeline appts={dayAppts} me={me} ownerID={ownerID} dateISO={dateISO} selectedId={selectedId} onSelect={setSelectedId}
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
          <>
            <label className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
              Default interval
              <select value={settings.preset}
                onChange={(e) => store.setFollowUpSettings({ ...settings, preset: e.target.value as FollowUpPreset }, me)}
                className="rounded-field border border-line px-2 py-1 text-sm text-ink">
                <option value="2wk">2 weeks</option>
                <option value="2mo">2 months</option>
                <option value="4mo">4 months</option>
                <option value="6mo">6 months</option>
                <option value="custom">Custom…</option>
              </select>
              after treatment
            </label>
            {settings.preset === "custom" && (
              <label className="mt-2 flex items-center gap-2 text-sm text-ink-soft">
                Custom
                <input type="number" min={1} max={90} value={settings.customDays ?? 14}
                  onChange={(e) => store.setFollowUpSettings({ ...settings, customDays: Math.min(90, Math.max(1, Number(e.target.value) || 1)) }, me)}
                  className="w-20 rounded-field border border-line px-2 py-1 text-sm text-ink" />
                days
              </label>
            )}
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-ink-soft">Per-treatment interval (optional)</summary>
              <p className="mt-1 text-xs text-ink-faint">Overrides the default for a treatment type; the earliest applies when a note spans several.</p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {PRODUCT_CATEGORIES.map((cat) => (
                  <li key={cat} className="flex items-center justify-between gap-2">
                    <span id={`fu-cat-${cat}`} className="text-ink">{categoryDisplayName(cat)}</span>
                    <select aria-labelledby={`fu-cat-${cat}`} value={settings.perTreatment?.[cat] ?? ""}
                      onChange={(e) => {
                        const next = { ...(settings.perTreatment ?? {}) };
                        if (e.target.value === "") delete next[cat];
                        else next[cat] = e.target.value as FollowUpNamedPreset;
                        store.setFollowUpSettings({ ...settings, perTreatment: Object.keys(next).length ? next : undefined }, me);
                      }}
                      className="rounded-field border border-line px-2 py-1 text-sm text-ink">
                      <option value="">Use default</option>
                      <option value="2wk">2 weeks</option>
                      <option value="2mo">2 months</option>
                      <option value="4mo">4 months</option>
                      <option value="6mo">6 months</option>
                    </select>
                  </li>
                ))}
              </ul>
            </details>
          </>
        )}
      </div>

      <div className="mt-6 rounded-card border border-line bg-card p-5">
        <h2 className="font-display text-lg text-ink">Appointment reminders</h2>
        <label className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink">
          Email the patient a reminder
          <select value={reminderLead}
            onChange={(e) => store.setAppointmentReminder(Number(e.target.value) as AppointmentReminderLead, me)}
            className="rounded-field border border-line px-2 py-1 text-sm text-ink">
            <option value={0}>None</option>
            <option value={1}>1 day before</option>
            <option value={2}>2 days before</option>
          </select>
          {reminderLead !== 0 && <span className="text-ink-soft">the appointment</span>}
        </label>
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


// Full-width day timeline: hour rail + time-positioned blocks. Overlapping appointments
// lay out side-by-side (via layoutDay); a block can be dragged to reschedule its start,
// and a tap (movement under the threshold) selects it.
function DayTimeline({ appts, me, ownerID, dateISO, selectedId, onSelect, onEmptyTap }: {
  appts: Appointment[]; me: Identity; ownerID: string; dateISO: string; selectedId: string | null;
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
        <BusyBlocks ownerID={ownerID} dateISO={dateISO} />
        <BlockedBands ownerID={ownerID} dateISO={dateISO} />
        {appts.map((a) => (
          <TimelineBlock key={a.id} appt={a} me={me} layout={cols.get(a.id) ?? { id: a.id, col: 0, cols: 1 }}
            selected={a.id === selectedId} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

// External-calendar busy times as muted, non-interactive background bands behind the
// appointment chips (spec: calendar sync — externally-committed times are visible; they
// gate PUBLIC/self booking server-side, while staff may still deliberately double-book).
function BusyBlocks({ ownerID, dateISO }: { ownerID: string; dateISO: string }) {
  const store = useDemoStore();
  const cal = store.state.externalBusyByOwner[ownerID];
  // Memoised: Intl.DateTimeFormat runs per event inside externalBusyForDate, and the week
  // view mounts seven of these — recompute only when the calendar doc or day changes.
  const bands = useMemo(() => {
    if (!cal) return [];
    return externalBusyForDate(cal.events, dateISO, cal.timeZone)
      .map((b) => ({ start: Math.max(b.start, WIN_START), end: Math.min(b.end, WIN_END) }))
      .filter((b) => b.end > b.start);
  }, [cal, dateISO]);
  if (bands.length === 0) return null;
  return (
    <>
      {bands.map((b) => {
        const height = (b.end - b.start) * PX_PER_MIN;
        return (
          <div key={`${b.start}-${b.end}`} aria-hidden
            className="pointer-events-none absolute inset-x-0 overflow-hidden rounded-[6px]"
            style={{
              top: (b.start - WIN_START) * PX_PER_MIN, height,
              background: "repeating-linear-gradient(-45deg, var(--color-paper-deep), var(--color-paper-deep) 6px, transparent 6px, transparent 12px)",
              border: "1px dashed var(--color-line)",
            }}>
            {height >= TEXT_MIN_PX && (
              <span className="micro block px-1.5 pt-0.5 text-ink-faint">Busy · external calendar</span>
            )}
          </div>
        );
      })}
    </>
  );
}

// Availability treatment blocks as muted, non-interactive bands (2026-07-24: blocks added
// under Availability → Treatment now show on the calendar). Solid muted fill distinguishes
// them from the external-calendar "Busy" hatch; pointer-events-none so empty-slot taps pass through.
function BlockedBands({ ownerID, dateISO }: { ownerID: string; dateISO: string }) {
  const store = useDemoStore();
  const blocks = store.treatmentBlocksForOwnerOnDay(ownerID, dateISO)
    .map((b) => ({ id: b.id, start: Math.max(b.startMinute, WIN_START), end: Math.min(b.endMinute, WIN_END) }))
    .filter((b) => b.end > b.start);
  if (blocks.length === 0) return null;
  return (
    <>
      {blocks.map((b) => {
        const height = (b.end - b.start) * PX_PER_MIN;
        return (
          <div key={b.id} aria-hidden
            className="pointer-events-none absolute inset-x-0 overflow-hidden rounded-[6px]"
            style={{ top: (b.start - WIN_START) * PX_PER_MIN, height, background: "var(--color-paper-deep)", border: "1px solid var(--color-line)" }}>
            {height >= TEXT_MIN_PX && <span className="micro block px-1.5 pt-0.5 text-ink-faint">Blocked</span>}
          </div>
        );
      })}
    </>
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
  const draggable = canRescheduleAppointment(appt, appointmentOwnerScope(me));

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
      onLostPointerCapture={onPointerCancel} // backstop: a silently-released capture must stop the scroll loop
      className="absolute overflow-hidden rounded-[6px] px-1.5 py-0.5 text-left text-card"
      style={{
        top: top + dragDy, height, left: `calc(${left}% + 2px)`, width: `calc(${width}% - 4px)`,
        background: apptColor(appt), borderLeft: `3px solid ${apptTypeAccent(appt)}`,
        touchAction: "none", cursor: draggable ? "grab" : "pointer",
        outline: selected ? "2px solid var(--color-ink)" : "none", outlineOffset: 1,
        zIndex: dragDy !== 0 || resizeDy !== 0 || topDy !== 0 ? 10 : 1,
      }}
      aria-label={`${timeLabel(appt.startMinute)}–${timeLabel(appt.endMinute)} ${appointmentChipTitle(store.state, appt, "Blocked time")}, ${STATUS_LABEL[appt.status]}`}
      title={`${timeLabel(appt.startMinute)} ${appointmentChipTitle(store.state, appt, "Blocked time")}`}>
      {showText && (
        <span className="block text-[11px] leading-tight">
          <span className="font-medium">{timeLabel(appt.startMinute)}</span> {appointmentChipTitle(store.state, appt)}
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
function WeekBlock({ appt, me, days, dayIndex, layout, selected, onSelect }: {
  appt: Appointment; me: Identity; days: string[]; dayIndex: number; layout: DayColumn;
  selected: boolean; onSelect: (id: string | null) => void;
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
  const draggable = canRescheduleAppointment(appt, appointmentOwnerScope(me));

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
    // 14/07 feedback: a tap opens the same detail/edit panel as day view (was: openDay).
    if (!st.moved) { onSelect(appt.id); return; }
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
      onLostPointerCapture={onPointerCancel} // backstop: a silently-released capture must stop the scroll loop
      className="absolute overflow-hidden rounded-[6px] px-1.5 py-0.5 text-left text-card"
      style={{
        top, height, left: `calc(${left}% + 1px)`, width: `calc(${width}% - 2px)`,
        background: apptColor(appt), borderLeft: `3px solid ${apptTypeAccent(appt)}`,
        transform: move ? `translate(${move.dx}px, ${move.dy}px)` : undefined,
        touchAction: "none", cursor: draggable ? "grab" : "pointer",
        outline: selected ? "2px solid var(--color-ink)" : "none", outlineOffset: 1,
        zIndex: move || resizeDy !== 0 || topDy !== 0 ? 10 : 1,
      }}
      aria-label={`${timeLabel(appt.startMinute)}–${timeLabel(appt.endMinute)} ${appointmentChipTitle(store.state, appt, "Blocked time")}, ${STATUS_LABEL[appt.status]}`}
      title={`${timeLabel(appt.startMinute)} ${appointmentChipTitle(store.state, appt, "Blocked time")}`}>
      {showText && (
        <span className="block text-[11px] leading-tight">
          <span className="font-medium">{timeLabel(appt.startMinute)}</span> {appointmentChipTitle(store.state, appt)}
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

function WeekView({ ownerID, selectedISO, todayISO, me, openDay, showNew, setShowNew }: {
  ownerID: string; selectedISO: string; todayISO: string; me: Identity; openDay: (iso: string) => void;
  showNew: boolean; setShowNew: (v: boolean | ((p: boolean) => boolean)) => void;
}) {
  const store = useDemoStore();
  const days = weekDaysFor(selectedISO);
  const appts = store.appointmentsForOwnerInRange(ownerID, days[0], days[6]);
  const byDay = new Map<string, Appointment[]>();
  for (const a of appts) byDay.set(a.dateISO, [...(byDay.get(a.dateISO) ?? []), a]);
  const railHeight = (WIN_END - WIN_START) * PX_PER_MIN;
  // 14/07 feedback: week view gains the day view's editing affordances — tap a chip to
  // open the detail/edit panel (was: switch to day view), tap an empty column slot to
  // book or block that time on THAT day. Drag/resize behaviour is unchanged.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [chooser, setChooser] = useState<{ iso: string; start: number } | null>(null);
  const [slotForm, setSlotForm] = useState<{ iso: string; start?: number; block?: boolean } | null>(null);
  const selected = appts.find((a) => a.id === selectedId) ?? null;
  const showForm = showNew || slotForm !== null;
  function closeForm() { setShowNew(false); setSlotForm(null); }

  function onColumnClick(iso: string, e: React.MouseEvent) {
    // Grid lines/busy bands are pointer-events-none and blocks are separate targets, so a
    // bare-column click is an empty-slot tap (DayTimeline.onColumnClick parity).
    if (e.target !== e.currentTarget) return;
    setSelectedId(null);
    setChooser({ iso, start: slotStartMinute(e.nativeEvent.offsetY, PX_PER_MIN, SLOT_STEP, WIN_START, WIN_END) });
    setSlotForm(null);
  }

  return (
    <>
      {showForm && (
        <NewAppointmentForm dateISO={slotForm?.iso ?? selectedISO} me={me}
          initialStart={slotForm?.start} initialBlock={slotForm?.block} onDone={closeForm} />
      )}

      {chooser !== null && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-inner border border-line bg-card px-4 py-3">
          <span className="text-sm text-ink-soft">Add {dayHeaderLabel(chooser.iso)} at {timeLabel(chooser.start)}</span>
          <button onClick={() => { setSlotForm({ iso: chooser.iso, start: chooser.start, block: false }); setChooser(null); }}
            className="rounded-btn px-3 py-1.5 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>New appointment</button>
          <button onClick={() => { setSlotForm({ iso: chooser.iso, start: chooser.start, block: true }); setChooser(null); }}
            className="rounded-btn border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-tint">Block time</button>
          <button onClick={() => setChooser(null)} className="rounded-btn px-2 py-1.5 text-sm text-ink-soft">Cancel</button>
        </div>
      )}

      {/* 15/07 feedback: no left-right scroll on mobile — the min width only kicks in at sm+; below
          that the flexible minmax(0,1fr) day columns compress to the viewport. */}
      <div className="mt-6 overflow-x-auto">
        <div className="grid sm:min-w-[680px]" style={{ gridTemplateColumns: "3rem repeat(7, minmax(0, 1fr))" }}>
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
              <div key={iso} className="relative border-l border-line" style={{ height: railHeight }}
                onClick={(e) => onColumnClick(iso, e)}>
                {HOURS_IN.map((h) => (
                  <div key={h} className="pointer-events-none absolute left-0 right-0 border-t border-line/60"
                    style={{ top: (h * 60 - WIN_START) * PX_PER_MIN }} />
                ))}
                <BusyBlocks ownerID={ownerID} dateISO={iso} />
                <BlockedBands ownerID={ownerID} dateISO={iso} />
                {dayAppts.map((a) => (
                  <WeekBlock key={a.id} appt={a} me={me} days={days} dayIndex={dayIndex}
                    layout={cols.get(a.id) ?? { id: a.id, col: 0, cols: 1 }}
                    selected={a.id === selectedId} onSelect={setSelectedId} />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {selected && <AppointmentDetail key={selected.id} appt={selected} me={me} onDone={() => setSelectedId(null)} />}
    </>
  );
}

const MONTH_MAX_CHIPS = 3;

function MonthView({ ownerID, selectedISO, todayISO, me, openDay }: {
  ownerID: string; selectedISO: string; todayISO: string; me: Identity; openDay: (iso: string) => void;
}) {
  const store = useDemoStore();
  const [dragError, setDragError] = useState<string | null>(null);
  const cells = monthGridFor(selectedISO);
  const appts = store.appointmentsForOwnerInRange(ownerID, cells[0].iso, cells[cells.length - 1].iso);
  const byDay = new Map<string, Appointment[]>();
  for (const a of appts) byDay.set(a.dateISO, [...(byDay.get(a.dateISO) ?? []), a]);
  const weekdayHeads = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="mt-6">
      {dragError && <p className="mb-2 text-sm" style={{ color: "var(--color-rose)" }}>{dragError}</p>}
      <div className="grid grid-cols-7 gap-px">
        {weekdayHeads.map((d) => <div key={d} className="pb-1 text-center text-xs text-ink-soft">{d}</div>)}
        {cells.map((c) => {
          const list = byDay.get(c.iso) ?? [];
          const day = Number(c.iso.slice(8, 10));
          const isToday = c.iso === todayISO;
          const isSelected = c.iso === selectedISO;
          return (
            <button key={c.iso} data-iso={c.iso} onClick={() => openDay(c.iso)}
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
                <MonthChip key={a.id} appt={a} me={me} selected={isSelected} onError={setDragError} />
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

// A month-grid chip, draggable to another day cell (same time, new date). A tap is left to
// bubble so the cell's own click still opens the day; after a real drag the chip suppresses
// that click. The drop cell is resolved by hit-testing under the pointer — the chip disables
// its own pointer-events while dragging so elementFromPoint sees the cell beneath it (the
// captured pointer keeps delivering events to the chip regardless).
function MonthChip({ appt, me, selected, onError }: {
  appt: Appointment; me: Identity; selected: boolean; onError: (msg: string | null) => void;
}) {
  const store = useDemoStore();
  const [move, setMove] = useState<{ dx: number; dy: number } | null>(null);
  const drag = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);
  const movedRef = useRef(false);
  const draggable = canRescheduleAppointment(appt, appointmentOwnerScope(me));

  function onPointerDown(e: React.PointerEvent) {
    if (!draggable) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* no active pointer (e.g. tests) — capture is best-effort */ }
    drag.current = { startX: e.clientX, startY: e.clientY, moved: false };
    movedRef.current = false;
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.startX;
    const dy = e.clientY - drag.current.startY;
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
      drag.current.moved = true;
      movedRef.current = true;
    }
    if (drag.current.moved) setMove({ dx, dy });
  }
  function onPointerUp(e: React.PointerEvent) {
    const st = drag.current;
    drag.current = null;
    setMove(null);
    if (!st?.moved) return; // a tap — the bubbling click opens the day
    const iso = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-iso]")?.getAttribute("data-iso");
    if (!iso || iso === appt.dateISO) return;
    try {
      store.rescheduleAppointment(appt.id, iso, appt.startMinute, appt.endMinute - appt.startMinute, me);
      onError(null);
    } catch (err) {
      onError(err instanceof BackendError && err.message === "unavailable"
        ? "That day is outside your treatment hours or on a blocked time."
        : "Could not move the appointment. Please try again.");
    }
  }
  function onPointerCancel() {
    drag.current = null;
    setMove(null);
  }
  // The drag already handled the gesture — keep the click from reaching the day cell.
  function onClick(e: React.MouseEvent) {
    if (movedRef.current) {
      e.preventDefault();
      e.stopPropagation();
      movedRef.current = false;
    }
  }

  return (
    <span
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel} onLostPointerCapture={onPointerCancel} onClick={onClick}
      className="flex items-center gap-1 truncate text-[10px] leading-tight"
      style={{
        color: selected ? "var(--color-card)" : "var(--color-ink)",
        transform: move ? `translate(${move.dx}px, ${move.dy}px)` : undefined,
        position: "relative",
        zIndex: move ? 10 : undefined,
        pointerEvents: move ? "none" : undefined,
        touchAction: draggable ? "none" : undefined,
        cursor: draggable ? "grab" : undefined,
      }}>
      <span className="inline-block h-2 w-1 flex-none rounded-sm" style={{ background: apptColor(appt) }} />
      <span className="truncate">{timeLabel(appt.startMinute)} {appointmentChipTitle(store.state, appt)}</span>
    </span>
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
      <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Appointment note (optional)" rows={2}
                className="mt-3 w-full resize-y rounded-inner border border-line px-3 py-2 text-sm text-ink outline-none focus:border-tint" />

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
// Rendered as a centred modal (DirectionDialog pattern) rather than inline below the
// timeline — on a busy day the inline block sat off-screen. Scrim click, Escape, and
// the Close button all dismiss; actions still dismiss through the existing onDone.
function AppointmentDetail({ appt, me, onDone }: { appt: Appointment; me: Identity; onDone: () => void }) {
  const store = useDemoStore();
  const [creating, setCreating] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  // Only the owner may resolve a lead (create/link a patient). A booking nurse viewing the doctor's
  // auth slot sees it read-only — linkAppointmentPatient is owner-gated, so offering it here would
  // only ever error (and could strand an orphan patient on create-from-lead).
  const isOwner = appt.ownerID === appointmentOwnerScope(me);
  const lead = isLeadAppointment(appt);
  // Client contact (spec: DOB/phone/email on the calendar) — lead fields, patient-record fallback.
  const contact = appointmentContact(appt, appt.patientID ? store.state.patients[appt.patientID] : undefined);
  const contactLine = [contact.dobLabel && `DOB ${contact.dobLabel}`, contact.phone, contact.email]
    .filter(Boolean).join(" · ");
  // Return-patient detection (feedback 2026-07-07 item 3): existing files of THIS subject that
  // match the lead on name + DOB, so a returning client is linked instead of duplicated.
  const leadMatches = useMemo(
    () => (appt.lead ? store.matchLeadToPatients(appt.lead, me) : []),
    [appt.lead, me, store],
  );

  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onDone(); };
    window.addEventListener("keydown", onKey);
    // Move focus into the dialog on open and lock background scroll while it's up; both
    // restore on unmount (the subtree remounts per appointment via the call-site key).
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onDone]);

  return (
    <div role="dialog" aria-modal="true" aria-label="Appointment details"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "color-mix(in srgb, var(--color-ink) 45%, transparent)" }}
      onClick={onDone}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-card border border-line bg-card px-5 py-4 shadow-card"
        onClick={(e) => e.stopPropagation()}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium text-ink">
          {appt.patientID ? (
            <Link href={`/app/patients/${appt.patientID}`} className="underline decoration-line underline-offset-2 hover:decoration-tint">{appt.patientName ?? "Patient"}</Link>
          ) : lead ? (
            <>{leadName(appt) || "New patient"} <span className="micro text-ink-soft">· new patient</span></>
          ) : "Blocked time"}
          {" · "}{timeLabel(appt.startMinute)}–{timeLabel(appt.endMinute)}
        </span>
        <span className="flex flex-none items-center gap-2.5">
          <span className="micro" style={{ color: apptColor(appt) }}>{STATUS_LABEL[appt.status]}</span>
          <button ref={closeRef} type="button" onClick={onDone}
            className="rounded-btn border border-line px-3 py-1 text-sm text-ink-soft hover:border-tint">
            Close
          </button>
        </span>
      </div>
      {contactLine && <p className="micro mt-0.5">{contactLine}</p>}
      {appt.source === "google" && (
        <p className="micro mt-0.5 text-ink-soft">Booked via Google Calendar — changes made there sync here automatically.</p>
      )}
      {appt.appointmentNote && <p className="mt-0.5 text-sm text-ink-soft">{appt.appointmentNote}</p>}

      {lead && !creating && isOwner && canCreatePatient(me) && (
        <div className="mt-2 flex flex-col gap-2">
          {leadMatches.length > 0 && (
            <div className="rounded-inner border border-line px-3 py-2"
              style={{ background: "color-mix(in srgb, var(--color-tint) 8%, transparent)" }}>
              <p className="micro text-ink-soft">Possible existing patient{leadMatches.length > 1 ? "s" : ""} in your records:</p>
              <ul className="mt-1 flex flex-col gap-1.5">
                {leadMatches.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 text-sm text-ink">
                      {p.givenName} {p.lastName}
                      <span className="micro text-ink-soft"> · DOB {p.dateOfBirth.day}/{p.dateOfBirth.month}/{p.dateOfBirth.year}</span>
                    </span>
                    <button onClick={() => {
                      // Eager-validated in the store, so a race (already linked) throws here, not mid-render.
                      try { store.linkAppointmentPatient(appt.id, p.id, me); onDone(); }
                      catch { setLinkError("Could not link — this booking may have just been actioned elsewhere."); }
                    }}
                      className="flex-none rounded-btn px-3 py-1.5 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>
                      Use this file
                    </button>
                  </li>
                ))}
              </ul>
              {linkError && <p className="mt-2 text-sm" style={{ color: "var(--color-rose)" }}>{linkError}</p>}
            </div>
          )}
          <button onClick={() => setCreating(true)}
            className="self-start rounded-btn border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-tint">
            {leadMatches.length > 0 ? "Not them — create new patient" : "Create patient from lead"}
          </button>
        </div>
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
    </div>
  );
}

function AppointmentActions({ appt, me, onDone }: { appt: Appointment; me: Identity; onDone: () => void }) {
  const store = useDemoStore();
  const [time, setTime] = useState(timeValue(appt.startMinute));
  const [duration, setDuration] = useState(appt.endMinute - appt.startMinute);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  // The owner can always manage; the nurse/clinic who BOOKED an auth teleconsult can reschedule
  // or cancel it too (15/07 feedback). Confirm + Complete/No-show stay owner-only below — the
  // booker's grant is limited to reschedule + cancel, matching the feedback's literal scope.
  const isOwner = appt.ownerID === appointmentOwnerScope(me);
  const canManage = canManageAppointment(appt, appointmentOwnerScope(me));
  const canMark = appt.status === "awaitingConfirmation" || appt.status === "confirmed";
  // Check-out → manual client invoice (spec: 2026-07-24), for an appointment with a real
  // patient file. The composer self-guards on commercial access, so it renders nothing when
  // this viewer can't bill the appointment's client.
  const patient = appt.patientID ? store.state.patients[appt.patientID] : undefined;

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
      {patient && canManage && (
        <div className="mb-3">
          <button type="button" onClick={() => setCheckingOut((v) => !v)}
            className="rounded-btn border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-tint">
            {checkingOut ? "Hide check out" : "Check out"}
          </button>
          {checkingOut && (
            <div className="mt-3">
              <ClientInvoiceComposer patient={patient} appointmentID={appt.id} />
            </div>
          )}
        </div>
      )}
      {!canManage ? (
        <p className="text-sm text-ink-soft">This appointment is managed on its owner&apos;s calendar — view only.</p>
      ) : canMark ? (
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
            {isOwner && appt.status === "awaitingConfirmation" && (
              <button onClick={() => act(() => store.confirmAppointment(appt.id, me))}
                      className="rounded-btn px-3 py-1.5 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>Confirm</button>
            )}
            {/* Complete / No-show are the owner's (doctor's) clinical determination. */}
            {isOwner && (
              <>
                <button onClick={() => act(() => store.markAppointment(appt.id, "completed", me))} className="rounded-btn border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-tint">Complete</button>
                <button onClick={() => act(() => store.markAppointment(appt.id, "noShow", me))} className="rounded-btn border border-line px-3 py-1.5 text-sm" style={{ color: "var(--color-rose)" }}>No-show</button>
              </>
            )}
            {/* 16/07 feedback bug 3 (safety step): cancelling asks first — one accidental
                tap must never kill an appointment. Keyed to the appointment so switching
                selection resets the pending confirmation. */}
            <ConfirmAction
              key={appt.id}
              label="Cancel"
              prompt="Cancel this appointment?"
              confirmLabel="Cancel appointment"
              onConfirm={() => act(() => store.markAppointment(appt.id, "cancelled", me))}
            />
          </div>
        </>
      ) : (
        <p className="text-sm text-ink-soft">No actions available for a {STATUS_LABEL[appt.status].toLowerCase()} appointment.</p>
      )}
    </div>
  );
}

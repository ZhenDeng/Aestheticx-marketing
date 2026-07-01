// Pure date helpers for the calendar week/month views.
// All math is UTC to match `isoDay` (backend.ts), so no timezone drift.

const MS_PER_DAY = 86_400_000;

function toUTC(dateISO: string): number {
  return Date.parse(`${dateISO}T00:00:00.000Z`);
}
function toISO(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
// 0 = Monday … 6 = Sunday
export function isoWeekday(dateISO: string): number {
  return (new Date(toUTC(dateISO)).getUTCDay() + 6) % 7;
}

export function addDaysISO(dateISO: string, n: number): string {
  return toISO(toUTC(dateISO) + n * MS_PER_DAY);
}

export function isWeekend(dateISO: string): boolean {
  return isoWeekday(dateISO) >= 5;
}

export function weekStartISO(dateISO: string): string {
  return addDaysISO(dateISO, -isoWeekday(dateISO));
}

export function weekDaysFor(dateISO: string): string[] {
  const start = weekStartISO(dateISO);
  return Array.from({ length: 7 }, (_, i) => addDaysISO(start, i));
}

// Move to the same month-day in the month `n` away (clamped to the 1st), for month-view nav.
export function shiftMonthISO(dateISO: string, n: number): string {
  const d = new Date(toUTC(dateISO));
  d.setUTCMonth(d.getUTCMonth() + n, 1);
  return d.toISOString().slice(0, 10);
}

export interface MonthCell {
  iso: string;
  inMonth: boolean;
  isWeekend: boolean;
}

// Monday-first grid covering the whole month, padded with adjacent-month days so the
// length is a multiple of 7 (5 or 6 rows).
export function monthGridFor(dateISO: string): MonthCell[] {
  const month = dateISO.slice(0, 7); // yyyy-mm
  const firstOfMonth = `${month}-01`;
  let cursor = weekStartISO(firstOfMonth);
  const cells: MonthCell[] = [];
  do {
    for (let i = 0; i < 7; i++) {
      cells.push({ iso: cursor, inMonth: cursor.slice(0, 7) === month, isWeekend: isWeekend(cursor) });
      cursor = addDaysISO(cursor, 1);
    }
  } while (cursor.slice(0, 7) === month); // keep adding weeks until past the month
  return cells;
}

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function monthLabel(dateISO: string): string {
  const d = new Date(toUTC(dateISO));
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function weekRangeLabel(dateISO: string): string {
  const startISO = weekStartISO(dateISO);
  const start = new Date(toUTC(startISO));
  const end = new Date(toUTC(addDaysISO(startISO, 6)));
  // Show the start year too only when the week straddles a year boundary.
  const startYear = start.getUTCFullYear() === end.getUTCFullYear() ? "" : ` ${start.getUTCFullYear()}`;
  return `${start.getUTCDate()} ${MONTHS_SHORT[start.getUTCMonth()]}${startYear} – ${end.getUTCDate()} ${MONTHS_SHORT[end.getUTCMonth()]} ${end.getUTCFullYear()}`;
}

const WEEKDAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Short weekday + day-of-month for a column header, e.g. "Mon 30".
export function dayHeaderLabel(dateISO: string): string {
  return `${WEEKDAYS_SHORT[isoWeekday(dateISO)]} ${new Date(toUTC(dateISO)).getUTCDate()}`;
}

// Full single-day label for the day-view subtitle, e.g. "Wed 1 Jul 2026".
export function dayLabel(dateISO: string): string {
  const d = new Date(toUTC(dateISO));
  return `${WEEKDAYS_SHORT[isoWeekday(dateISO)]} ${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// ── Timeline layout + drag math (pure) ──────────────────────────────────────

interface TimeSpan { id: string; startMinute: number; endMinute: number }
export interface DayColumn { id: string; col: number; cols: number }

// Side-by-side column assignment for a day's appointments. Time-overlapping spans are
// grouped into a connected cluster; within a cluster each span takes the first column whose
// previous span has already ended (greedy by start time), and every span in the cluster
// reports the cluster's total column count so siblings render at equal width.
// Adjacent spans (end === next start) do NOT overlap.
export function layoutDay(spans: TimeSpan[]): DayColumn[] {
  const sorted = [...spans].sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);
  const out: DayColumn[] = [];
  let cluster: TimeSpan[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    const colEnds: number[] = []; // last end time placed in each column
    const placed: { id: string; col: number }[] = [];
    for (const s of cluster) {
      let col = colEnds.findIndex((end) => end <= s.startMinute);
      if (col === -1) { col = colEnds.length; colEnds.push(s.endMinute); }
      else colEnds[col] = s.endMinute;
      placed.push({ id: s.id, col });
    }
    const cols = colEnds.length;
    for (const p of placed) out.push({ id: p.id, col: p.col, cols });
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const s of sorted) {
    if (cluster.length && s.startMinute >= clusterEnd) flush();
    cluster.push(s);
    clusterEnd = Math.max(clusterEnd, s.endMinute);
  }
  if (cluster.length) flush();
  return out;
}

// New start minute for a block dragged by `deltaPx`, snapped to `step` minutes and clamped
// so the block stays fully within [winStart, winEnd]. Pure so it is unit-testable apart
// from pointer events.
export function dragStartMinute(
  origStart: number, deltaPx: number, pxPerMin: number, step: number,
  durationMin: number, winStart: number, winEnd: number,
): number {
  const raw = origStart + deltaPx / pxPerMin;
  const snapped = Math.round(raw / step) * step;
  // Floor the bottom bound to the step grid so a block at the end of the window stays snapped.
  const maxStart = Math.floor((winEnd - durationMin) / step) * step;
  return Math.max(winStart, Math.min(snapped, maxStart));
}

// New end minute for a block whose bottom edge is dragged by `deltaPx`, snapped to `step`
// and clamped to [startMin + minDuration, winEnd]. The start never moves.
export function dragEndMinute(
  origEnd: number, deltaPx: number, pxPerMin: number, step: number,
  startMin: number, minDuration: number, winEnd: number,
): number {
  const raw = origEnd + deltaPx / pxPerMin;
  const snapped = Math.round(raw / step) * step;
  // startMin is always on the step grid (appointments are only booked/moved in step
  // increments), so startMin + minDuration stays on-grid when minDuration is a step multiple.
  return Math.max(startMin + minDuration, Math.min(snapped, winEnd));
}

// How many equal-width day-columns a horizontal drag of `dx` pixels crossed (week move).
export function dayDelta(dx: number, dayWidth: number): number {
  return dayWidth > 0 ? Math.round(dx / dayWidth) || 0 : 0; // `|| 0` normalises -0 → 0
}

// Start minute for a tap at `offsetPx` down the timeline, snapped to `step` and clamped to
// [winStart, winEnd - step] so at least one step fits before the window closes.
export function slotStartMinute(
  offsetPx: number, pxPerMin: number, step: number, winStart: number, winEnd: number,
): number {
  const raw = winStart + offsetPx / pxPerMin;
  const snapped = Math.round(raw / step) * step;
  return Math.max(winStart, Math.min(snapped, winEnd - step));
}

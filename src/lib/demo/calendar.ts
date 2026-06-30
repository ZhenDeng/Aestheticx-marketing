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
function isoWeekday(dateISO: string): number {
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

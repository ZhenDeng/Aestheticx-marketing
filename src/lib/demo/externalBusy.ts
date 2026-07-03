// External-calendar busy times, read side — a byte-for-byte port of the backend's
// unit-tested calendarSync.ts semantics so the web renders exactly the intervals the
// server subtracts from public/self-booking availability. Pure (no Firebase imports).
import type { ExternalBusyEvent } from "./types";

// The local wall-clock date and minute-of-day an instant falls on in a given IANA timezone.
// Intl handles DST and offset rules — the wire stores instants + the owner's zone precisely
// so no client offset guessing is needed.
export function localPartsInZone(instant: Date, timeZone: string): { dateISO: string; minute: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    dateISO: `${get("year")}-${get("month")}-${get("day")}`,
    minute: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

// Busy intervals (minutes-from-midnight) an external calendar imposes on one local day.
// Events are clamped to the day (before → 0, after → 1440) so an event spanning midnight
// blocks the right portion; transparent ("free") events are ignored.
export function externalBusyForDate(
  events: ExternalBusyEvent[], dateISO: string, timeZone: string,
): { start: number; end: number }[] {
  const busy: { start: number; end: number }[] = [];
  for (const event of events) {
    if (event.transparent) continue;
    const start = localPartsInZone(new Date(event.startISO), timeZone);
    const end = localPartsInZone(new Date(event.endISO), timeZone);
    const startMinute = start.dateISO < dateISO ? 0 : start.dateISO > dateISO ? 1440 : start.minute;
    const endMinute = end.dateISO < dateISO ? 0 : end.dateISO > dateISO ? 1440 : end.minute;
    if (endMinute > startMinute) busy.push({ start: startMinute, end: endMinute });
  }
  return busy;
}

import { describe, it, expect } from "vitest";
import { localPartsInZone, externalBusyForDate } from "@/lib/demo/externalBusy";
import type { ExternalBusyEvent } from "@/lib/demo/types";

const SYDNEY = "Australia/Sydney";

describe("localPartsInZone", () => {
  it("converts a UTC instant to Sydney wall-clock (AEST, UTC+10)", () => {
    // 2026-06-26T00:30Z = 10:30 AEST (winter — no DST)
    expect(localPartsInZone(new Date("2026-06-26T00:30:00Z"), SYDNEY)).toEqual({ dateISO: "2026-06-26", minute: 630 });
  });
  it("is DST-correct (AEDT, UTC+11 in January)", () => {
    // 2026-01-15T00:30Z = 11:30 AEDT
    expect(localPartsInZone(new Date("2026-01-15T00:30:00Z"), SYDNEY)).toEqual({ dateISO: "2026-01-15", minute: 690 });
  });
  it("rolls the date across the local midnight", () => {
    // 2026-06-26T15:30Z = 01:30 on the 27th AEST
    expect(localPartsInZone(new Date("2026-06-26T15:30:00Z"), SYDNEY)).toEqual({ dateISO: "2026-06-27", minute: 90 });
  });
});

describe("externalBusyForDate", () => {
  const event = (startISO: string, endISO: string, transparent?: boolean): ExternalBusyEvent =>
    ({ startISO, endISO, transparent });

  it("maps an in-day event to minutes-from-midnight", () => {
    // 10:30–11:30 AEST on 26 Jun
    const busy = externalBusyForDate([event("2026-06-26T00:30:00Z", "2026-06-26T01:30:00Z")], "2026-06-26", SYDNEY);
    expect(busy).toEqual([{ start: 630, end: 690 }]);
  });
  it("clamps an event that started the previous evening to the top of the day", () => {
    // 25 Jun 23:00 → 26 Jun 01:00 AEST
    const busy = externalBusyForDate([event("2026-06-25T13:00:00Z", "2026-06-25T15:00:00Z")], "2026-06-26", SYDNEY);
    expect(busy).toEqual([{ start: 0, end: 60 }]);
  });
  it("clamps an event that runs past local midnight to the end of the day", () => {
    // 26 Jun 23:00 → 27 Jun 01:00 AEST
    const busy = externalBusyForDate([event("2026-06-26T13:00:00Z", "2026-06-26T15:00:00Z")], "2026-06-26", SYDNEY);
    expect(busy).toEqual([{ start: 1380, end: 1440 }]);
  });
  it("skips transparent (free) events and events on other days", () => {
    const busy = externalBusyForDate([
      event("2026-06-26T00:30:00Z", "2026-06-26T01:30:00Z", true),
      event("2026-06-20T00:30:00Z", "2026-06-20T01:30:00Z"),
    ], "2026-06-26", SYDNEY);
    expect(busy).toEqual([]);
  });
  it("returns nothing for no events", () => {
    expect(externalBusyForDate([], "2026-06-26", SYDNEY)).toEqual([]);
  });
});

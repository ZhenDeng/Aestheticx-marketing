import { describe, it, expect } from "vitest";
import {
  addDaysISO, weekStartISO, weekDaysFor, monthGridFor, isWeekend,
  monthLabel, weekRangeLabel,
} from "@/lib/demo/calendar";

describe("addDaysISO", () => {
  it("shifts forward and backward", () => {
    expect(addDaysISO("2026-06-30", 1)).toBe("2026-07-01"); // month boundary
    expect(addDaysISO("2026-06-30", -1)).toBe("2026-06-29");
    expect(addDaysISO("2026-12-31", 1)).toBe("2027-01-01"); // year boundary
    expect(addDaysISO("2026-06-30", 0)).toBe("2026-06-30");
  });
});

describe("weekStartISO (Monday-first)", () => {
  it("returns Monday for a midweek day", () => {
    expect(weekStartISO("2026-07-01")).toBe("2026-06-29"); // Wed → Mon
  });
  it("returns the same day when it is a Monday", () => {
    expect(weekStartISO("2026-06-29")).toBe("2026-06-29");
  });
  it("treats Sunday as the end of its week, not the start", () => {
    expect(weekStartISO("2026-07-05")).toBe("2026-06-29"); // Sun → previous Mon
  });
});

describe("weekDaysFor", () => {
  it("returns 7 ordered Monday-first days", () => {
    expect(weekDaysFor("2026-07-01")).toEqual([
      "2026-06-29", "2026-06-30", "2026-07-01", "2026-07-02",
      "2026-07-03", "2026-07-04", "2026-07-05",
    ]);
  });
});

describe("isWeekend", () => {
  it("is true for Saturday and Sunday only", () => {
    expect(isWeekend("2026-07-04")).toBe(true);  // Sat
    expect(isWeekend("2026-07-05")).toBe(true);  // Sun
    expect(isWeekend("2026-07-03")).toBe(false); // Fri
    expect(isWeekend("2026-06-29")).toBe(false); // Mon
  });
});

describe("monthGridFor", () => {
  const grid = monthGridFor("2026-07-15"); // July 2026: starts Wed, 31 days
  it("starts on a Monday and ends on a Sunday with length a multiple of 7", () => {
    expect(isWeekend(grid[0].iso)).toBe(false);
    expect(weekStartISO(grid[0].iso)).toBe(grid[0].iso);
    expect(grid.length % 7).toBe(0);
  });
  it("contains every day of the target month flagged inMonth", () => {
    const inMonth = grid.filter((c) => c.inMonth).map((c) => c.iso);
    expect(inMonth[0]).toBe("2026-07-01");
    expect(inMonth[inMonth.length - 1]).toBe("2026-07-31");
    expect(inMonth.length).toBe(31);
  });
  it("pads leading/trailing days from adjacent months as out-of-month", () => {
    expect(grid[0].iso).toBe("2026-06-29"); // Mon before Jul 1
    expect(grid[0].inMonth).toBe(false);
    expect(grid[grid.length - 1].inMonth).toBe(false);
  });
  it("flags weekend cells", () => {
    const sat = grid.find((c) => c.iso === "2026-07-04");
    expect(sat?.isWeekend).toBe(true);
  });
});

describe("labels", () => {
  it("formats a month label", () => {
    expect(monthLabel("2026-07-15")).toBe("July 2026");
  });
  it("formats a week range label", () => {
    expect(weekRangeLabel("2026-07-01")).toBe("29 Jun – 5 Jul 2026");
  });
});

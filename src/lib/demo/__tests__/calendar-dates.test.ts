import { describe, it, expect } from "vitest";
import {
  addDaysISO, shiftMonthISO, weekStartISO, weekDaysFor, monthGridFor, isWeekend,
  monthLabel, weekRangeLabel, dayLabel,
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
  it("has no leading padding when the month starts on a Monday", () => {
    const march = monthGridFor("2027-03-10"); // 1 Mar 2027 is a Monday
    expect(march[0].iso).toBe("2027-03-01");
    expect(march[0].inMonth).toBe(true);
    expect(march.length % 7).toBe(0);
  });
});

describe("shiftMonthISO", () => {
  it("moves to the 1st of the month n away", () => {
    expect(shiftMonthISO("2026-07-15", 1)).toBe("2026-08-01");
    expect(shiftMonthISO("2026-07-15", -1)).toBe("2026-06-01");
    expect(shiftMonthISO("2026-12-31", 1)).toBe("2027-01-01"); // year boundary
    expect(shiftMonthISO("2026-01-10", -1)).toBe("2025-12-01");
  });
});

describe("labels", () => {
  it("formats a month label", () => {
    expect(monthLabel("2026-07-15")).toBe("July 2026");
  });
  it("formats a week range label", () => {
    expect(weekRangeLabel("2026-07-01")).toBe("29 Jun – 5 Jul 2026");
  });
  it("includes the start year when the week straddles a year boundary", () => {
    // Mon 28 Dec 2026 – Sun 3 Jan 2027
    expect(weekRangeLabel("2026-12-30")).toBe("28 Dec 2026 – 3 Jan 2027");
  });
  it("formats a single-day label", () => {
    expect(dayLabel("2026-07-01")).toBe("Wed 1 Jul 2026");
  });
});

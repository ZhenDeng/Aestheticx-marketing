import { describe, it, expect } from "vitest";
import { layoutDay, dragStartMinute, dragEndMinute, dragTopMinute, edgeScrollVelocity, slotStartMinute, dayDelta } from "@/lib/demo/calendar";

type Span = { id: string; startMinute: number; endMinute: number };
const span = (id: string, startMinute: number, endMinute: number): Span => ({ id, startMinute, endMinute });

// Map id -> {col, cols} for terse assertions.
function byId(rows: { id: string; col: number; cols: number }[]) {
  return Object.fromEntries(rows.map((r) => [r.id, { col: r.col, cols: r.cols }]));
}

describe("layoutDay", () => {
  it("gives a lone appointment a full single column", () => {
    expect(byId(layoutDay([span("a", 540, 570)]))).toEqual({ a: { col: 0, cols: 1 } });
  });

  it("places two overlapping appointments in two columns of equal share", () => {
    const m = byId(layoutDay([span("a", 540, 600), span("b", 570, 630)]));
    expect(m).toEqual({ a: { col: 0, cols: 2 }, b: { col: 1, cols: 2 } });
  });

  it("uses three columns for three mutually overlapping appointments", () => {
    const m = byId(layoutDay([span("a", 540, 600), span("b", 550, 610), span("c", 560, 620)]));
    expect(m).toEqual({ a: { col: 0, cols: 3 }, b: { col: 1, cols: 3 }, c: { col: 2, cols: 3 } });
  });

  it("reuses a freed column within a transitively-connected cluster (cols:2)", () => {
    // a∩b, b∩c, but a does not overlap c → cluster of 3, only 2 columns needed
    const m = byId(layoutDay([span("a", 540, 570), span("b", 555, 585), span("c", 580, 610)]));
    expect(m).toEqual({ a: { col: 0, cols: 2 }, b: { col: 1, cols: 2 }, c: { col: 0, cols: 2 } });
  });

  it("treats adjacent appointments (end == next start) as non-overlapping", () => {
    const m = byId(layoutDay([span("a", 540, 570), span("b", 570, 600)]));
    expect(m).toEqual({ a: { col: 0, cols: 1 }, b: { col: 0, cols: 1 } });
  });

  it("is independent of input order", () => {
    const ordered = byId(layoutDay([span("a", 540, 600), span("b", 570, 630), span("c", 560, 620)]));
    const shuffled = byId(layoutDay([span("c", 560, 620), span("a", 540, 600), span("b", 570, 630)]));
    expect(shuffled).toEqual(ordered);
  });
});

describe("dragStartMinute", () => {
  const W_START = 420, W_END = 1140, PX = 1, STEP = 5;
  it("is the identity for zero delta (already on a step)", () => {
    expect(dragStartMinute(540, 0, PX, STEP, 30, W_START, W_END)).toBe(540);
  });
  it("snaps a downward drag to the nearest step", () => {
    expect(dragStartMinute(540, 12, PX, STEP, 30, W_START, W_END)).toBe(550);
  });
  it("snaps an upward drag to the nearest step", () => {
    expect(dragStartMinute(540, -7, PX, STEP, 30, W_START, W_END)).toBe(535);
  });
  it("clamps to the top of the window", () => {
    expect(dragStartMinute(430, -100, PX, STEP, 30, W_START, W_END)).toBe(420);
  });
  it("clamps so the block's end stays within the window", () => {
    expect(dragStartMinute(1100, 200, PX, STEP, 60, W_START, W_END)).toBe(1080); // 1140 - 60
  });
  it("keeps the bottom clamp on the step grid for an off-grid duration", () => {
    // maxStart = floor((1140 - 7) / 5) * 5 = 1130, not 1133
    expect(dragStartMinute(1100, 200, PX, STEP, 7, W_START, W_END)).toBe(1130);
  });
  it("respects a non-unit pixels-per-minute scale", () => {
    // 24px at 0.8px/min = 30min → 540 + 30 = 570
    expect(dragStartMinute(540, 24, 0.8, STEP, 30, W_START, W_END)).toBe(570);
  });
});

describe("edgeScrollVelocity", () => {
  const H = 800, EDGE = 48, MAX = 14;
  it("is zero across the middle of the viewport", () => {
    expect(edgeScrollVelocity(400, H, EDGE, MAX)).toBe(0);
    expect(edgeScrollVelocity(EDGE, H, EDGE, MAX)).toBe(0);      // zone boundaries inclusive-out
    expect(edgeScrollVelocity(H - EDGE, H, EDGE, MAX)).toBe(0);
  });
  it("ramps up linearly toward the top edge (negative = scroll up)", () => {
    expect(edgeScrollVelocity(24, H, EDGE, MAX)).toBe(-7);  // halfway into the zone
    expect(edgeScrollVelocity(0, H, EDGE, MAX)).toBe(-14);  // at the very edge
  });
  it("ramps down linearly toward the bottom edge", () => {
    expect(edgeScrollVelocity(H - 24, H, EDGE, MAX)).toBe(7);
    expect(edgeScrollVelocity(H, H, EDGE, MAX)).toBe(14);
  });
  it("clamps beyond the viewport (captured pointer outside the window)", () => {
    expect(edgeScrollVelocity(-100, H, EDGE, MAX)).toBe(-14);
    expect(edgeScrollVelocity(H + 100, H, EDGE, MAX)).toBe(14);
  });
  it("honours custom edge and speed parameters", () => {
    expect(edgeScrollVelocity(10, 600, 40, 20)).toBe(-15); // 30/40 into the zone
  });
});

describe("dragTopMinute", () => {
  const W_START = 420, PX = 1, STEP = 5, MIN = 15;
  it("is the identity for zero delta", () => {
    expect(dragTopMinute(540, 0, PX, STEP, 600, MIN, W_START)).toBe(540);
  });
  it("moves the start later (shortening from the front), snapped to the step", () => {
    expect(dragTopMinute(540, 12, PX, STEP, 600, MIN, W_START)).toBe(550);
  });
  it("moves the start earlier (lengthening), snapped to the step", () => {
    expect(dragTopMinute(540, -22, PX, STEP, 600, MIN, W_START)).toBe(520);
  });
  it("clamps to the top of the window", () => {
    expect(dragTopMinute(430, -100, PX, STEP, 600, MIN, W_START)).toBe(420);
  });
  it("never crosses the end minus the minimum duration (no inversion)", () => {
    // end 600, min 15 → start can't go past 585
    expect(dragTopMinute(540, 200, PX, STEP, 600, MIN, W_START)).toBe(585);
  });
  it("respects a non-unit pixels-per-minute scale", () => {
    expect(dragTopMinute(540, 24, 0.8, STEP, 600, MIN, W_START)).toBe(570); // +30min
  });
});

describe("dragEndMinute", () => {
  const W_END = 1140, PX = 1, STEP = 5, MIN = 15;
  it("is the identity for zero delta", () => {
    expect(dragEndMinute(600, 0, PX, STEP, 540, MIN, W_END)).toBe(600);
  });
  it("lengthens, snapped to the step", () => {
    expect(dragEndMinute(600, 12, PX, STEP, 540, MIN, W_END)).toBe(610);
  });
  it("shortens, snapped to the step", () => {
    expect(dragEndMinute(600, -22, PX, STEP, 540, MIN, W_END)).toBe(580);
  });
  it("clamps to the bottom of the window", () => {
    expect(dragEndMinute(1130, 100, PX, STEP, 1000, MIN, W_END)).toBe(1140);
  });
  it("never shrinks past the minimum duration (no inversion)", () => {
    // start 540, min 15 → end can't go below 555
    expect(dragEndMinute(600, -200, PX, STEP, 540, MIN, W_END)).toBe(555);
  });
  it("respects a non-unit pixels-per-minute scale", () => {
    expect(dragEndMinute(600, 24, 0.8, STEP, 540, MIN, W_END)).toBe(630); // +30min
  });
});

describe("dayDelta", () => {
  it("is 0 for a sub-column horizontal drag", () => {
    expect(dayDelta(20, 100)).toBe(0);
    expect(dayDelta(-20, 100)).toBe(0);
  });
  it("crosses one column at a full column width", () => {
    expect(dayDelta(100, 100)).toBe(1);
    expect(dayDelta(-100, 100)).toBe(-1);
  });
  it("crosses multiple columns", () => {
    expect(dayDelta(250, 100)).toBe(3); // rounds 2.5 → 3
    expect(dayDelta(-240, 100)).toBe(-2);
  });
  it("is 0 when the column width is non-positive", () => {
    expect(dayDelta(500, 0)).toBe(0);
  });
});

describe("slotStartMinute", () => {
  const W_START = 420, W_END = 1140, PX = 1, STEP = 15;
  it("snaps a tap offset to the step", () => {
    expect(slotStartMinute(200, PX, STEP, W_START, W_END)).toBe(615); // 620 → nearest 15-min boundary is 615
  });
  it("clamps to the top of the window", () => {
    expect(slotStartMinute(-50, PX, STEP, W_START, W_END)).toBe(420);
  });
  it("clamps to the bottom of the window (leaving one step)", () => {
    expect(slotStartMinute(5000, PX, STEP, W_START, W_END)).toBe(1125); // 1140 - 15
  });
  it("respects a non-unit pixels-per-minute scale", () => {
    // 240px at 0.8px/min = 300min → 420 + 300 = 720 (already on a 15 grid)
    expect(slotStartMinute(240, 0.8, STEP, W_START, W_END)).toBe(720);
  });
});

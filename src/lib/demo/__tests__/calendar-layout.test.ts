import { describe, it, expect } from "vitest";
import { layoutDay, dragStartMinute } from "@/lib/demo/calendar";

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

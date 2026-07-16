// DirectionWriter graphics primitives (16/07 feedback — bordered invoice table):
// hline/vline/rect/textAt/cellLines plus the currentY/setY/newPage cursor controls
// the table renderer needs. Namespace import so the byte-stability pin below runs
// even while the ops are unimplemented (TDD red = missing methods, not a broken import).
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import * as pdf from "@/lib/demo/directionPdf";
import type { DirectionContent } from "@/lib/demo/direction";

const { DirectionWriter, INK, SOFT, renderDirectionPdf } = pdf;

// Fixed fixture (mirrors direction-pdf.test.ts) — pins the clause-68C output bytes.
const complete: DirectionContent = {
  directionId: "AUTH-7G2K-09",
  patientName: "Amara Boyd",
  patientDateOfBirth: "12/3/1991",
  patientAllergies: "None recorded",
  patientAddress: "14 Marra St, Bondi NSW 2026",
  prescriberName: "Dr Adrian Voss",
  prescriberPhone: "02 9388 4410",
  prescriberPrincipalPlace: "A. Voss Medical, 88 Oxford St, Paddington NSW 2021",
  premisesOfAdministration: "Lumière Aesthetics, 12 Hall St, Bondi Beach NSW 2026",
  responsibleProvider: "RN Sarah Chen",
  authorisationStatus: "Approved 17 Jun 2026",
  authorisationExpires: "17 Dec 2026",
  patientReviewedISO: "2026-06-17",
  directionPeriod: "6 months",
  administrationCountAndIntervals: "Up to 5, at intervals of at least 4 weeks",
  administrations: [
    { substanceAndForm: "Botulinum toxin type A, injection", category: "Neurotoxin", bodySite: "Glabella", route: "IM", quantity: "20 units" },
  ],
  prescriberAttestation: "Electronically authorised by Dr Adrian Voss",
  emergencyAuthorisations: [
    { label: "Adrenaline — anaphylaxis", detail: "standing order · expires 8 Jul 2027" },
  ],
};

function lastOp(w: InstanceType<typeof DirectionWriter>): string {
  const page = w.pages[w.pages.length - 1];
  return page[page.length - 1];
}

describe("direction PDF byte stability", () => {
  it("renderDirectionPdf output is byte-identical after the graphics-op additions", () => {
    const hash = createHash("sha256").update(renderDirectionPdf(complete)).digest("hex");
    // sha256 of the render captured on the pre-change writer (2026-07-16). If this
    // moves, a "purely additive" writer change altered the clause-68C document.
    expect(hash).toBe("d7f77ddc8abb6b0d298bf629868cd31af99f87bbc8b8134ae6b4f4660c4a8983");
  });
});

describe("DirectionWriter graphics ops", () => {
  it("hline strokes at the current y in PDF space without advancing the cursor", () => {
    const w = new DirectionWriter();
    w.setY(100);
    w.hline(56, 539.28);
    // Defaults: 0.5pt SOFT. y flips top-down 100 → 841.89 − 100.
    expect(lastOp(w)).toBe("0.5 w 0.44 0.4 0.35 RG 56 741.89 m 539.28 741.89 l S");
    expect(w.currentY()).toBe(100);
  });

  it("hline honours width and colour overrides", () => {
    const w = new DirectionWriter();
    w.setY(100);
    w.hline(56, 300, { width: 1, color: INK });
    expect(lastOp(w)).toBe("1 w 0.13 0.11 0.09 RG 56 741.89 m 300 741.89 l S");
  });

  it("vline converts both top-down y positions to PDF space", () => {
    const w = new DirectionWriter();
    w.vline(100, 50, 150);
    expect(lastOp(w)).toBe("0.5 w 0.44 0.4 0.35 RG 100 791.89 m 100 691.89 l S");
  });

  it("rect places a top-down band as a PDF bottom-left `re`", () => {
    const w = new DirectionWriter();
    w.rect(56, 100, 200, 40, { width: 1, color: INK });
    // Bottom-left corner: 841.89 − (100 + 40) = 701.89.
    expect(lastOp(w)).toBe("1 w 0.13 0.11 0.09 RG 56 701.89 200 40 re S");
  });

  it("keeps graphics ops outside BT/ET text objects", () => {
    const w = new DirectionWriter();
    w.hline(56, 300);
    w.vline(56, 10, 20);
    w.rect(56, 10, 10, 10);
    for (const op of w.pages[0]) expect(op).not.toContain("BT");
  });

  it("textAt draws one positioned line at the cursor without advancing it", () => {
    const w = new DirectionWriter();
    w.setY(100);
    w.textAt("Hello", 10, INK, 200, { width: 100 });
    // Baseline like emit: 841.89 − (100 + 10 × 0.72) = 734.69.
    expect(lastOp(w)).toContain("1 0 0 1 200 734.69 Tm (Hello) Tj");
    expect(w.currentY()).toBe(100);
  });

  it("textAt right-aligns using the Helvetica metrics", () => {
    const w = new DirectionWriter();
    w.setY(100);
    w.textAt("$25.00", 9.5, SOFT, 200, { width: 100, align: "right" });
    // textWidth("$25.00", 9.5) = 3058/1000 × 9.5 = 29.051 → x = 300 − 29.05.
    expect(lastOp(w)).toContain("1 0 0 1 270.95 735.05 Tm ($25.00) Tj");
  });

  it("textAt clips to the first wrapped line so a cell never spills into its neighbour", () => {
    const w = new DirectionWriter();
    w.textAt("Lorem ipsum dolor", 10, INK, 56, { width: 50 });
    expect(lastOp(w)).toContain("(Lorem) Tj");
    expect(lastOp(w)).not.toContain("ipsum");
  });

  it("cellLines wraps to the column width so the caller can size the row", () => {
    const w = new DirectionWriter();
    expect(w.cellLines("Lorem ipsum dolor", 10, 50)).toEqual(["Lorem", "ipsum", "dolor"]);
    expect(w.cellLines("Hi", 10, 50)).toEqual(["Hi"]);
  });

  it("currentY/setY/newPage position the cursor for table bands", () => {
    const w = new DirectionWriter();
    expect(w.currentY()).toBe(56); // top margin
    w.setY(400);
    expect(w.currentY()).toBe(400);
    w.newPage();
    expect(w.pages).toHaveLength(2);
    expect(w.currentY()).toBe(56);
  });

  it("exports the layout constants the table renderer needs", () => {
    expect(pdf.MARGIN).toBe(56);
    expect(pdf.CONTENT_WIDTH).toBeCloseTo(483.28, 2);
    expect(pdf.BOTTOM_LIMIT).toBeCloseTo(785.89, 2);
  });
});

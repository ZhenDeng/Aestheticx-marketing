// Client-side render of the Clause 68C direction PDF. Layout is a faithful port of
// the backend's renderDirectionPDF (backend/functions/src/direction.ts): A4, 56pt
// margins, Helvetica, and the ink/gold/soft palette. The web app has no PDF library
// and demo mode has no server, so this writes a minimal uncompressed PDF by hand —
// enough for single-font flowing text, which is all the direction needs.
// Pure (Uint8Array out) so the assembly is unit-testable.
import type { DirectionContent } from "./direction";

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
// Exported for renderers that lay out absolute bands (the invoice table): the page
// grid is part of the writer's contract, not something callers should re-derive.
export const MARGIN = 56;
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
export const BOTTOM_LIMIT = PAGE_HEIGHT - MARGIN;

export type Rgb = readonly [number, number, number];
export const INK: Rgb = [0x21 / 255, 0x1c / 255, 0x16 / 255]; // #211C16
export const GOLD: Rgb = [0x8f / 255, 0x6f / 255, 0x3c / 255]; // #8F6F3C
export const SOFT: Rgb = [0x71 / 255, 0x66 / 255, 0x5a / 255]; // #71665A

// Standard Helvetica AFM advance widths (per 1000 units) for ASCII 32–126.
const HELVETICA_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

// Unicode → WinAnsi byte for the punctuation this document actually uses; characters
// WinAnsi cannot express are transliterated in `toWinAnsi` before this lookup.
const WIN_ANSI: Record<number, number> = {
  0x2014: 0x97, // — em dash
  0x2013: 0x96, // – en dash
  0x2018: 0x91, 0x2019: 0x92, // ‘ ’
  0x201c: 0x93, 0x201d: 0x94, // “ ”
  0x2026: 0x85, // …
  0x2022: 0x95, // •
  0x20ac: 0x80, // €
};

/** Latin-1/WinAnsi byte string; ≥/≤ expand to ASCII, anything else unmappable → "?". */
function toWinAnsi(text: string): string {
  const expanded = text.replace(/≥/g, ">=").replace(/≤/g, "<=");
  let out = "";
  for (const ch of expanded) {
    const code = ch.codePointAt(0) ?? 0x3f;
    if (code <= 0xff) out += String.fromCharCode(code);
    else out += String.fromCharCode(WIN_ANSI[code] ?? 0x3f);
  }
  return out;
}

/** Advance width in points of a WinAnsi byte string at `size`, incl. character spacing. */
function textWidth(encoded: string, size: number, charSpace: number): number {
  let units = 0;
  for (let i = 0; i < encoded.length; i += 1) {
    const code = encoded.charCodeAt(i);
    units += code >= 32 && code <= 126 ? HELVETICA_WIDTHS[code - 32] : 556;
  }
  return (units / 1000) * size + charSpace * encoded.length;
}

/** Character-level split for a single token wider than the line — the space-only wrap
 *  below can't break it, and an unbroken overflow is silently cut at the page edge
 *  (engineer review 17/07: user-editable emails/addresses now flow through here). */
function breakWord(word: string, size: number, maxWidth: number, charSpace: number): string[] {
  const parts: string[] = [];
  let current = "";
  for (const ch of word) {
    if (current !== "" && textWidth(current + ch, size, charSpace) > maxWidth) {
      parts.push(current);
      current = ch;
    } else {
      current += ch;
    }
  }
  if (current !== "") parts.push(current);
  return parts;
}

/** Greedy word wrap on the encoded string (mirrors pdfkit's default line breaking),
 *  with a character-level fallback for tokens wider than the line. */
function wrapText(encoded: string, size: number, maxWidth: number, charSpace: number): string[] {
  const words = encoded.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (textWidth(word, size, charSpace) > maxWidth) {
      // Oversized token: flush the pending line, hard-break the token, and keep
      // its tail as the new pending line so following words continue after it.
      if (line !== "") lines.push(line);
      const parts = breakWord(word, size, maxWidth, charSpace);
      line = parts.pop() ?? "";
      lines.push(...parts);
      continue;
    }
    const candidate = line === "" ? word : `${line} ${word}`;
    if (line !== "" && textWidth(candidate, size, charSpace) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line !== "") lines.push(line);
  return lines.length > 0 ? lines : [""];
}

// PDF literal-string escaping (spec §7.3.4.2): backslash first, then parens, then
// EOL characters — a raw newline inside (…) would be read as part of the string.
const escapePdfString = (s: string): string =>
  s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/\n/g, "\\n").replace(/\r/g, "\\r");
const num = (n: number): string => n.toFixed(2).replace(/\.?0+$/, "") || "0";

interface Run {
  text: string;
  size: number;
  color: Rgb;
  charSpace?: number;
}

/** Flowing-text cursor over one or more pages (the tiny subset of pdfkit we mirror).
 *  Exported for the approval-document renderer (approvalPdf.ts), which shares the
 *  same hand-rolled single-font writer. */
export class DirectionWriter {
  readonly pages: string[][] = [[]];
  private y = MARGIN; // distance from the top of the page, like pdfkit's doc.y
  private lastSize = 12;

  private lineHeight(size: number): number {
    return size * 1.15;
  }

  private breakPageIfNeeded(advance: number): void {
    if (this.y + advance > BOTTOM_LIMIT) {
      this.pages.push([]);
      this.y = MARGIN;
    }
  }

  private emit(encoded: string, size: number, color: Rgb, charSpace: number, x: number): void {
    const baseline = PAGE_HEIGHT - (this.y + size * 0.72);
    this.pages[this.pages.length - 1].push(
      `BT /F1 ${num(size)} Tf ${num(charSpace)} Tc ${color.map(num).join(" ")} rg ` +
        `1 0 0 1 ${num(x)} ${num(baseline)} Tm (${escapePdfString(encoded)}) Tj ET`,
    );
  }

  /** Word-wrapped block at the left margin; advances the cursor (pdfkit doc.text). */
  text(value: string, size: number, color: Rgb, opts: { charSpace?: number; width?: number } = {}): void {
    const charSpace = opts.charSpace ?? 0;
    const lines = wrapText(toWinAnsi(value), size, opts.width ?? CONTENT_WIDTH, charSpace);
    for (const line of lines) {
      this.breakPageIfNeeded(this.lineHeight(size));
      this.emit(line, size, color, charSpace, MARGIN);
      this.y += this.lineHeight(size);
    }
    this.lastSize = size;
  }

  /** Multiple styled runs on one baseline (pdfkit's `continued: true`). */
  runs(parts: Run[]): void {
    const maxSize = Math.max(...parts.map((p) => p.size));
    this.breakPageIfNeeded(this.lineHeight(maxSize));
    let x = MARGIN;
    for (const part of parts) {
      const encoded = toWinAnsi(part.text);
      this.emit(encoded, part.size, part.color, part.charSpace ?? 0, x);
      x += textWidth(encoded, part.size, part.charSpace ?? 0);
    }
    this.y += this.lineHeight(maxSize);
    this.lastSize = parts[parts.length - 1]?.size ?? this.lastSize;
  }

  moveDown(lines: number): void {
    this.y += lines * this.lineHeight(this.lastSize);
  }

  // ——— Graphics primitives (bordered-table support; 16/07 feedback) ———
  // Strokes are emitted as self-contained ops between the BT..ET text blocks, which
  // the PDF grammar allows — graphics state never leaks into a text object.

  /** Top-down cursor position (pdfkit's doc.y) — lets a table renderer compute row bands. */
  currentY(): number {
    return this.y;
  }

  /** Move the cursor to an absolute top-down y (for cell text and band advances). */
  setY(y: number): void {
    this.y = y;
  }

  /** Start a fresh page with the cursor at the top margin (manual page break). */
  newPage(): void {
    this.pages.push([]);
    this.y = MARGIN;
  }

  /** Self-contained stroke op: width + RG stroke colour + the path, defaults 0.5pt SOFT. */
  private stroke(path: string, opts: { width?: number; color?: Rgb }): void {
    const color = opts.color ?? SOFT;
    this.pages[this.pages.length - 1].push(`${num(opts.width ?? 0.5)} w ${color.map(num).join(" ")} RG ${path}`);
  }

  /** Horizontal rule at the current y (does not advance the cursor). */
  hline(x1: number, x2: number, opts: { width?: number; color?: Rgb } = {}): void {
    const y = PAGE_HEIGHT - this.y;
    this.stroke(`${num(x1)} ${num(y)} m ${num(x2)} ${num(y)} l S`, opts);
  }

  /** Vertical rule between two absolute top-down y positions (column separators). */
  vline(x: number, yTop: number, yBottom: number, opts: { width?: number; color?: Rgb } = {}): void {
    this.stroke(`${num(x)} ${num(PAGE_HEIGHT - yTop)} m ${num(x)} ${num(PAGE_HEIGHT - yBottom)} l S`, opts);
  }

  /** Stroked rectangle whose top edge sits at top-down yTop (table frames, total band). */
  rect(x: number, yTop: number, w: number, h: number, opts: { width?: number; color?: Rgb } = {}): void {
    this.stroke(`${num(x)} ${num(PAGE_HEIGHT - (yTop + h))} ${num(w)} ${num(h)} re S`, opts);
  }

  /** One cell line at the current y, absolutely positioned at column x — clipped to the
   *  first wrapped line so a cell can never spill into its neighbour; right alignment
   *  uses the Helvetica metrics. Does not advance the cursor. */
  textAt(
    value: string,
    size: number,
    color: Rgb,
    x: number,
    opts: { width: number; align?: "left" | "right"; charSpace?: number },
  ): void {
    const charSpace = opts.charSpace ?? 0;
    const [line] = wrapText(toWinAnsi(value), size, opts.width, charSpace);
    const tx = opts.align === "right" ? x + opts.width - textWidth(line, size, charSpace) : x;
    this.emit(line, size, color, charSpace, tx);
  }

  /** Wrapped (WinAnsi-encoded) cell lines for a column width, so the caller can size the
   *  row before drawing it; feed each line back through textAt (re-encoding is idempotent
   *  because every Latin-1 code point maps to itself). */
  cellLines(value: string, size: number, width: number, charSpace = 0): string[] {
    return wrapText(toWinAnsi(value), size, width, charSpace);
  }
}

/** Serialise content streams into a complete single-font PDF file. */
export function buildPdfFile(pageStreams: string[]): Uint8Array {
  const objects: string[] = [];
  const pageObjectIds = pageStreams.map((_, i) => 4 + i * 2);
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(`<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageStreams.length} >>`);
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  for (const [i, stream] of pageStreams.entries()) {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Resources << /Font << /F1 3 0 R >> >> /Contents ${4 + i * 2 + 1} 0 R >>`,
    );
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }

  let file = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const [i, body] of objects.entries()) {
    offsets.push(file.length);
    file += `${i + 1} 0 obj\n${body}\nendobj\n`;
  }
  const xrefStart = file.length;
  file += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) file += `${String(offset).padStart(10, "0")} 00000 n \n`;
  file += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return Uint8Array.from(file, (c) => c.charCodeAt(0));
}

/** A labelled field block: small soft caps label over the ink value (backend `field()`). */
export function field(writer: DirectionWriter, label: string, value: string): void {
  writer.text(label.toUpperCase(), 8, SOFT, { charSpace: 0.5 });
  writer.text(value.trim() === "" ? "—" : value, 11.5, INK);
  writer.moveDown(0.45);
}

export function renderDirectionPdf(content: DirectionContent): Uint8Array {
  const writer = new DirectionWriter();

  writer.text(`DIRECTION TO ADMINISTER · NSW CL. 68C · ${content.directionId}`, 8, GOLD, { charSpace: 1.5 });
  writer.moveDown(0.4);
  writer.text("Treatment direction", 23, INK);
  writer.moveDown(1);

  field(writer, "Patient", content.patientName);
  field(writer, "Date of birth", content.patientDateOfBirth);
  field(writer, "Allergies", content.patientAllergies);
  field(writer, "Patient address", content.patientAddress);
  field(writer, "Prescriber", `${content.prescriberName} · ${content.prescriberPhone}`);
  field(writer, "Principal place of practice", content.prescriberPrincipalPlace);
  field(writer, "Premises of administration", content.premisesOfAdministration);
  field(writer, "Responsible provider", content.responsibleProvider);
  field(writer, "Authorisation status", content.authorisationStatus);
  field(writer, "Authorisation expires", content.authorisationExpires);
  field(writer, "Patient reviewed", content.patientReviewedISO);
  field(writer, "Direction effective for", content.directionPeriod);
  field(writer, "Administrations", content.administrationCountAndIntervals);

  writer.moveDown(0.6);
  writer.text("PER ADMINISTRATION — TO RECORD", 9, GOLD, { charSpace: 1 });
  writer.moveDown(0.3);
  for (const a of content.administrations) {
    // Two wrapping text lines rather than one continued run: body sites are unbounded
    // (areas.join) and `runs()` does not wrap or clip, so a long row would silently spill
    // past the page edge — unacceptable data loss on a compliance document. writer.text wraps.
    writer.text(a.substanceAndForm, 10.5, INK);
    writer.text(`${a.category} · ${a.bodySite} · ${a.route} · ${a.quantity}`, 9.5, SOFT);
    writer.moveDown(0.3);
  }

  writer.moveDown(0.6);
  writer.text("EMERGENCY STANDING AUTHORISATIONS", 9, GOLD, { charSpace: 1 });
  writer.moveDown(0.3);
  if (content.emergencyAuthorisations.length === 0) {
    writer.text("None on file.", 10, SOFT);
  } else {
    for (const e of content.emergencyAuthorisations) {
      writer.runs([
        { text: e.label, size: 10.5, color: INK },
        { text: `   ${e.detail}`, size: 9.5, color: SOFT },
      ]);
      writer.moveDown(0.3);
    }
  }

  writer.moveDown(0.8);
  writer.text("PRESCRIBER AUTHORISATION", 9, GOLD, { charSpace: 1 });
  writer.moveDown(0.3);
  writer.text(content.prescriberAttestation, 11.5, INK);
  writer.text(`${content.authorisationStatus} · Authorisation ${content.directionId}`, 9, SOFT);

  writer.moveDown(1);
  writer.text(
    "For each administration the nurse must record: name, date administered, batch number, " +
      "substance, site, route, and quantity. Wording pending practitioner/legal sign-off before clinical use.",
    8.5,
    SOFT,
    { width: 483 },
  );

  return buildPdfFile(writer.pages.map((ops) => ops.join("\n")));
}

/** Download name, mirroring iOS's "AestheticX-Authorisation-…" file naming. */
export function directionPdfFilename(directionId: string): string {
  const clean = directionId.replace(/[/\\:*?"<>|\s]/g, "");
  return `AestheticX-Direction-${clean}.pdf`;
}

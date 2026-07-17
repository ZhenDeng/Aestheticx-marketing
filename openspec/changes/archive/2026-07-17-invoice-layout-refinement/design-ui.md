# UI design notes — 17/07 invoice layout refinement

Aesthetic contract unchanged: warm clinical minimalism — INK on white, GOLD (`#8F6F3C`) as the
single accent for uppercase micro-labels (8pt, charSpace 1), SOFT for secondary values, hairline
rules. The 16/07 bordered items table and totals band stand as designed (archive §6). This round
restructures the document's top half into the classic financial-document grid: identity left,
metadata right, addressee below — every datum on its own line.

## 1. Header band — title left, metadata top-right

One vertical band, two columns, on the A4 grid (56pt margins, 483pt content width):

- **Left**: `TAX INVOICE` 23pt INK at the left margin — unchanged.
- **Right** (right-aligned to the right margin, sharing the title's top edge — the whitespace the
  title never used):
  - `DATE ISSUED` 8pt GOLD kicker, charSpace 1 → value 11.5pt INK (e.g. `17 Jul 2026`)
  - 0.5-line gap
  - `INVOICE NUMBER` 8pt GOLD kicker → value 11.5pt INK (`INV-JLARWR1F`), then the billing
    period 9pt SOFT beneath (`July 2026`) — the number stays clean, the period reads as caption.
- All right-block lines right-aligned (`textAt … align:"right"`, width-bounded ≈ 180pt) so the
  ragged edge sits flush against the margin like a ledger.
- The cursor resumes below whichever column runs deeper; the left column then carries the seller
  block (§2) so the two never collide.

## 2. Seller block — top left, one line per datum

Under the title, the issuer as a vertical block (no comma-joins, no inline `·` separators):

| Line | Content | Type |
|---|---|---|
| 1 | Practitioner name — `Dr Jenn Lee` | 12.5pt INK |
| 2 | Trading / clinic name | 10.5pt INK |
| 3 | `ABN 61688638226` | 10pt SOFT |
| 4 | Business address / active premise | 10pt SOFT |
| 5 | Contact email | 10pt SOFT |

Lines with no data are omitted entirely — a short block beats placeholder rows — except ABN,
which keeps its em-dash fallback (`ABN —`): it is an ATO-required element and its absence must be
visible, not silent. When no practitioner name exists (legacy snapshot), the trading name promotes
to line 1 at 12.5pt so the block always leads with an identity.

## 3. TO block — addressee, address split across lines

Below the header band, left-aligned, before the items table:

- `TO` 8pt GOLD kicker, charSpace 1 (the existing field-label idiom)
- Recipient name 11.5pt INK
- Address components 10pt SOFT, **one comma-group per line** — `Internal Clinic, Chatswood
  Westfield, Chatswood NSW 2067` renders as three stacked lines, never one merged row. An
  address without commas renders as a single line (graceful fallback).

## 4. Items table + totals — unchanged (16/07, archive §6)

Bordered full-width table (GOLD header band, column separators, 0.5pt row rules), right-aligned
totals mini-table, framed `TOTAL AMOUNT PAYABLE` band, verbatim ATO statement. No changes.

## 5. On-screen preview table — visible frame + column dividers

The generate-panel preview (billing page) mirrors the PDF's grid instead of floating rows:

- Table wrapper: `border border-line` outer frame (`rounded-inner` to match the panel).
- Header cells: existing `border-y border-line` band, GOLD-free (screen uses ink-soft per app
  convention) — unchanged type.
- Every cell after the first in a row: `border-l border-line` — the clean column dividing frames
  the ticket asks for. Row rules stay `border-b border-line`.
- Totals rows live in the same framed table (tfoot), right-aligned in the last two columns;
  `Total` row: `font-medium text-ink` on a heavier `border-t` — the bold accent.
- Checkbox selection list above the table: untouched (archive §4 grammar).

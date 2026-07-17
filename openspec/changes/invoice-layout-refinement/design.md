# Design — invoice-layout-refinement

## Context

The tax invoice is rendered client-side by the hand-rolled single-font PDF writer (`DirectionWriter` in `src/lib/demo/directionPdf.ts`), shared by the direction, approval, and invoice renderers. `renderTaxInvoicePdf` (`src/lib/demo/invoicePdf.ts`) currently prints TAX INVOICE, then seller businessName + ABN, then left-column `field()` rows for To / Date issued / Invoice number, then the bordered items table and totals band (both already compliant with the 16/07 feedback).

The 17/07 feedback targets the document's top half: metadata belongs top-right, the seller and TO identities must be vertical multi-line blocks, and the on-screen preview table needs visible border framing.

Party identity flows through `InvoiceParty { businessName, abn, email, address? }` — snapshotted at generation on live invoices (backend), resolved from hydrated state in demo / for legacy invoices (`invoicePartyFor` in `backend.ts`, which today fills only businessName + abn).

## Goals / Non-Goals

**Goals:**
- Header band: title left, DATE ISSUED + INVOICE NUMBER right-aligned in the top-right corner on the same band.
- Seller block: practitioner name, trading name, ABN, address, email — one line each, missing lines omitted (ABN keeps the em-dash fallback).
- TO block: recipient name, then address split across lines by comma groups.
- Preview table in the generate panel: visible outer border + column dividers; totals right-aligned with bold accents (already mostly true — add framing).
- Keep checkbox script selection behaviour untouched.

**Non-Goals:**
- No backend (Firebase Functions) changes — new `InvoiceParty` fields are optional; live snapshots that lack them simply omit lines.
- No change to money math, selection logic, invoice generation, deletion, or email surfacing.
- No redesign of the items table or totals band in the PDF (16/07 work stands).

## Decisions

1. **`InvoiceParty` gains optional `name?: string`.** The ticket wants the practitioner's personal name ("Dr Jenn Lee") above the trading name. Optional keeps every existing snapshot (live and legacy) valid. Alternative — reusing `businessName` for the person — rejected: the ticket explicitly wants both lines.

2. **Party enrichment stays in `invoicePartyFor` (demo/legacy path).** Fill `name` from the owner account/user record, `address` from profile address → principalPlace (doctor) / clinic address (clinic) / active premise address (nurse), `email` from the account record. Live snapshots keep precedence via the existing `invoice.issuer ?? …` fallback. Alternative — enriching in `buildTaxInvoiceModel` — rejected: model assembly should stay pure over resolved parties.

3. **Header layout via `textAt` right-aligned at absolute positions.** The writer already supports absolute placement (`textAt`, `setY`, `currentY`) — the header renders the 23pt title at the left margin and two label/value pairs right-aligned to `MARGIN + CONTENT_WIDTH` within the same vertical band, then the cursor continues below whichever side is taller. No new writer primitives needed.

4. **Address splitting is a pure helper in `invoicePdf.ts`** (`addressLines(address: string): string[]`): split on commas, trim, drop empties; the last two components that look like "City, STATE 1234" group naturally because we keep one component per line and the seed/live data already stores comma-separated addresses. Model assembly (`buildTaxInvoiceModel`) produces `toLines: string[]` and `sellerLines: string[]` so the renderer stays a dumb line printer and the split is unit-testable.

5. **Preview table framing with CSS borders.** Add `border` on the table and `border-l`/vertical divider classes on cells (Tailwind, `--color-line`), matching the PDF's frame + column separators. Checkbox list markup untouched.

## Risks / Trade-offs

- [Live snapshots lack name/address] → renderer omits missing lines by design; demo enrichment covers demo; backend can adopt the optional fields later without a web change.
- [Long seller/TO lines overflowing the right metadata block] → the header reserves the right block's width; seller lines wrap within the left column via the writer's existing wrapping (`text` with width).
- [Address data not comma-separated] → single-line fallback: an address without commas renders as one line — no worse than today.
- [Preview divider borders look heavy in dark mode] → use the existing `--color-line` token (already theme-aware).

## Migration Plan

Pure client change, additive model fields — deploy with the normal Vercel build. No data migration; legacy invoices render with fewer lines. Rollback = revert commit.

## Open Questions

(none — layout decisions are pinned by the ticket's example placement)

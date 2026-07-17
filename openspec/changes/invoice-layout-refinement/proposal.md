# Invoice Layout Refinement

## Why

17/07 owner feedback: the tax invoice renders critical practitioner and patient data as unstructured single-line strings — the invoice number and date clump down the left, the seller's identity is only a business name + ABN, and the bill-to line merges name and address into one long row. The document doesn't read like a professional financial document.

## What Changes

- **Header metadata moves top-right.** DATE ISSUED and INVOICE NUMBER render in the top-right corner of the invoice header, horizontally aligned with the TAX INVOICE title on the left — no longer stacked down the left column.
- **Seller info block (top left) becomes a multi-line block.** Doctor's personal name, company/clinic trading name (new field surfaced), ABN, business address (new), and contact email (new) — each on its own line. Fields without data are omitted rather than shown as placeholders (except ABN, which keeps its em-dash fallback as an ATO-required element).
- **TO billing block becomes a multi-line block.** Below the header, left-aligned: recipient name on line 1, then the address parsed into separate lines (location line, then city/state/postcode) instead of one comma-joined row.
- **On-screen preview grid gets visible borders.** The generate panel's preview table gains a full border frame and column dividers matching the PDF's bordered grid; checkbox selection per script is retained unchanged; subtotal / GST (10%) / TOTAL remain right-aligned beneath the grid with bold accents.
- **Party data plumbing.** `InvoiceParty` grows an optional person-name field; demo-side party resolution fills name, address, and email from hydrated state where knowable (profile address / principal place, account email, clinic address), keeping live snapshot precedence.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `invoicing`: the "Structured tax-invoice layout" requirement is extended — header metadata placement (top-right), multi-line seller identity block (name, trading name, ABN, address, email), multi-line TO block with address split across lines, and the on-screen preview table gaining visible border framing to match the PDF.

## Impact

- `src/lib/demo/invoicePdf.ts` — layout rework: header band, seller block, TO block; table + totals stay.
- `src/lib/demo/invoicing.ts` — `InvoiceParty` optional `name` field.
- `src/lib/demo/backend.ts` — `invoicePartyFor` enrichment (name/address/email from state).
- `src/app/app/billing/page.tsx` — preview table border framing (checkboxes and totals untouched in behaviour).
- Tests: `src/lib/demo/__tests__/invoice-pdf.test.ts`, `src/app/app/billing/__tests__/selective-invoicing.test.tsx`.
- No backend repo changes: live invoices already snapshot issuer/billTo; new fields are optional and backward-compatible with legacy snapshots.

# Tasks — invoice-layout-refinement

## 1. Party data plumbing

- [x] 1.1 Add optional `name?: string` to `InvoiceParty` (`src/lib/demo/invoicing.ts`); tests for backward compatibility with snapshots lacking it
- [x] 1.2 Enrich `invoicePartyFor` (`src/lib/demo/backend.ts`): fill `name` (owner account/user), `address` (profile address → doctor principalPlace / clinic address / nurse active premise), `email` (account record); tests per party kind and for absent data staying empty

## 2. Tax-invoice PDF layout

- [x] 2.1 `addressLines()` helper + `buildTaxInvoiceModel` producing `sellerLines` and `toLines` arrays (name, trading name, ABN, address, email; missing lines omitted, ABN em-dash fallback); unit tests incl. legacy snapshot
- [x] 2.2 Rework `renderTaxInvoicePdf` header: TAX INVOICE title left, DATE ISSUED + INVOICE NUMBER right-aligned top-right on the title band; seller block lines under the title; TO block with name + split address lines; items table + totals unchanged; assert via PDF text-stream tests (top-right x-position, one line per element, ATO elements preserved)

## 3. On-screen preview grid

- [ ] 3.1 Generate-panel preview table (`src/app/app/billing/page.tsx`): visible outer border + column dividers via theme line token; totals right-aligned with bold total row; checkbox selection markup and behaviour untouched; component test asserts frame/divider classes and existing selection tests stay green

## 4. Verification

- [ ] 4.1 Full test suite green (`npm test`) and production build passes (`npm run build`)

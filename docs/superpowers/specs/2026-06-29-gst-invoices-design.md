# Design: pricing + GST invoices (increment 3b)

**Date:** 2026-06-29
**Status:** Approved (brainstorming) — pending spec review
**Repo:** `Aestheticx-marketing` (branch `claude/gst-invoices`, off `main`)
**Source of truth:** iOS/Firebase backend `backend/functions/src/{invoicing,billingFn}.ts`
(`computeInvoice`, `selectableForInvoice`, `setScriptPrice`, `generateInvoice`), `index.ts`
(`mintDownloadUrl`), `backend/firestore.rules` (`invoices`/`scriptPricing` read).

## Goal

The "GST invoices" half of billing. A **doctor** sets a per-counterparty script price and generates an
A4 GST tax invoice over a counterparty + month's un-invoiced authorisations; everyone who may read an
invoice can list and download it. **Live** uses the backend Functions; **demo** simulates with the GST
math **ported verbatim** so totals match. PDF download is **live-only** (demo has no server PDF). Builds
on 3a (billing dashboard).

## Backend contract (consume; stay wire-compatible)

- `setScriptPrice` (onCall, doctor-only): `{ counterpartyId, priceCents }` → writes
  `scriptPricing/{doctorId}_{counterpartyId}` (`priceCents`). `generateInvoice` (onCall, doctor-only):
  `{ counterpartyId, counterpartyType: "nurse"|"clinic", periodLabel, authorisationIds }` → transactional
  (re-checks each auth is approved/this-counterparty/un-invoiced, marks them `invoiced`, writes the
  `invoices/{id}` doc), then renders the A4 PDF to `invoices/{doctorId}/{id}.pdf` (`pdfFileId`) — returns
  `{ invoiceId }`. Default price `2500` cents, GST `0.1`, GST **rounded per line then summed**.
- `mintDownloadUrl` (onCall): `{ path }` → `{ url }` short-lived signed URL, gated to doctor /
  counterparty / clinic-admin.
- `invoices/{id}` doc: `doctorId, counterpartyId, counterpartyType, periodLabel, lines[], subtotalCents,
  gstCents, totalCents, authorisationIds, pdfFileId, createdAt`. Rules: read by doctor / counterparty
  nurse / clinic-admin / super-admin; writes Function-only.

## 1. Money/invoice domain (TDD) — new `src/lib/demo/invoicing.ts`

Ported verbatim from backend `invoicing.ts`:
- `DEFAULT_SCRIPT_PRICE_CENTS = 2500`, `GST_RATE = 0.1`.
- `computeInvoice({ pricePerScriptCents, gstRate, authorisations: { id, dateISO, patientName }[] }) →
  { lines: { authorisationID, dateISO, patientName, feeCents, gstCents }[], subtotalCents, gstCents,
  totalCents }` (per-line `gstCents = Math.round(fee × rate)`; throws if price ≤ 0).
- `selectableForInvoice(auths: { id, counterpartyID, monthKey, invoiced }[], { counterpartyID,
  monthKey }) → same[]` — counterparty+month, not yet invoiced (web auths are implicitly approved).
- `formatAUD(cents): string` → `"$1,234.56"`.
- Types: `InvoiceLine`, `Invoice { id, doctorID, counterpartyID, counterpartyType, periodLabel, lines,
  subtotalCents, gstCents, totalCents, authorisationIDs, pdfFileId?, createdAt }`.
- Tests: `computeInvoice` ($25×1 → subtotal 2500, gst 250, total 2750; multi-line sums); per-line GST
  rounding; `selectableForInvoice` filters; `formatAUD(2750) === "$27.50"`.

## 2. State + authorisation extensions

- Web `Authorisation` += `createdAt: number` and `invoiced: boolean`. `approveRequest` sets
  `createdAt: now, invoiced: false` on each granted authorisation. `mapAuthorisation` reads
  `createdAt` (`toMillis`) + `invoiced` (`=== true`).
- `DemoState` += `invoices: Invoice[]` and `scriptPricing: Record<string, number>` (key
  `"{doctorID}_{counterpartyID}"`). Add to `emptyState()` and `assembleState()` (live starts `[]`/`{}`
  for those not hydrated; see §4).

## 3. Pure demo ops (TDD) — `backend.ts`

- `scriptPriceKey(doctorID, counterpartyID)` helper.
- `setScriptPrice(state, doctorID, counterpartyID, priceCents) → DemoState` — validates positive
  integer; sets `scriptPricing[key]`.
- `billableAuthorisations(state, doctorID): { id, counterpartyID, counterpartyType, monthKey, invoiced,
  patientName, dateISO }[]` — the doctor's authorisations mapped to billable rows (counterparty +
  `monthKey(createdAt)` derived; patientName/dateISO from state).
- `generateInvoice(state, { doctorID, counterpartyID, counterpartyType, periodLabel, authIDs }, now) →
  { state, invoice }` — doctor-gated; resolves price (`scriptPricing[key]` or default); `computeInvoice`
  over the selected (still-selectable) auths; mints `inv-<uuid>`; marks those auths `invoiced`; appends
  the `Invoice`. Throws if no selectable auths.

## 4. Live wiring

- New `src/lib/firebase/invoices.ts`: `setScriptPrice(counterpartyID, priceCents)`,
  `generateInvoice({ counterpartyID, counterpartyType, periodLabel, authorisationIDs }) → { invoiceId }`,
  `invoicePdfUrl(path) → string` (via `httpsCallable("mintDownloadUrl")({ path }) → { url }`).
- `mappers.ts` `mapInvoice(id, data)` (field names per the backend doc). `hydrate.ts`: hydrate `invoices`
  (role-scoped like `billingEvents`) and `scriptPricing` (doctor: `where("doctorId","==",uid)`, key
  `"{doctorId}_{counterpartyId}"`) into state; `mapAuthorisation` now carries `createdAt`/`invoiced`.
- Store: `setScriptPrice`/`generateInvoice` actions branch — **demo** applies the pure op locally;
  **live** calls the Function then `rehydrate()` (server is authoritative). Read accessors
  `invoicesFor(identity)`, `scriptPrice(doctorID, counterpartyID)`, `billableAuthorisations(doctorID)`.

## 5. UI — extends `/app/billing`

- **Doctor**, on each month × counterparty row: a **"Generate invoice"** affordance opening a panel with
  the selectable count, an editable **price** input (`formatAUD`, persists via `setScriptPrice`), the
  computed **subtotal / GST / total**, and **Generate** → calls `generateInvoice` with the selectable
  `authorisationIDs` and `periodLabel = monthLabel(monthKey)`; the invoice appears below and those auths
  leave the billable counts.
- **Everyone (role-scoped)** — an **Invoices** section: `periodLabel · party · total (formatAUD)` per
  invoice, with **Download PDF**: live → `invoicePdfUrl(pdfFileId)` opened in a new tab; demo →
  disabled "Available in live mode".

## 6. Testing & verification

- **TDD (offline):** `computeInvoice`/`selectableForInvoice`/`formatAUD` (`invoicing.test.ts`) and the
  demo `setScriptPrice`/`generateInvoice`/`billableAuthorisations` ops (`backend`/`invoices-ops` test).
  Existing suite green; `npm test`/`tsc`/`lint`/`build` clean.
- **Demo smoke (preview):** as **Dr Voss** on Billing → the Lumière/June row → "Generate invoice" →
  1 line, **$25.00 + $2.50 GST = $27.50**; Generate → it appears in **Invoices**, the billable count
  drops, **Download PDF** shows the live-only state. Screenshot.
- **Live (manual, owner, TEST account):** append a "GST invoices" section to
  `firebase-live-verification.md` — set a price, generate for a TEST counterparty+month, confirm the
  `invoices/{id}` doc + `invoices/{doctorId}/{id}.pdf`, the auths flip to `invoiced`, the counterparty
  can list + download via `mintDownloadUrl`, and re-generating the same month excludes the invoiced auths.

## 7. Caveats / out of scope

- **PDF + email are server-side** — demo has no PDF (download is live-only); the demo invoice math is the
  **ported** server math (kept in sync by hand; tested for parity on the $25/10% defaults).
- **No invoice void/delete** — invoices are immutable (matches the backend); a mistaken invoice is a
  backend concern.
- **Party names** via demo accounts (fallback to id; no live directory).
- **`scriptPricing` is doctor-readable only** — nurses/clinics don't see prices, just invoice totals.

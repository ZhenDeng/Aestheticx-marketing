# Manual client invoicing + treatment blocks on the calendar

**Date:** 2026-07-24
**Branch:** `claude/service-invoice-calendar-sync-257084`
**Feedback round:** owner comments (2 items)

## Problem

Two owner comments:

1. **The nurse/doctor/clinic → patient service invoice is not built.** The only
   client-billing surface today is `PatientAccountSection`'s checkout — demo-only
   (`matrixEnabled = !live`), price-list driven (no manual entry), wallet-coupled.
   In live mode a clinic sees no client-billing tool at all. What's wanted, for now,
   is a **manual** invoice: hand-type each line's description and price, tick whether
   GST applies and whether the entered prices already include GST. It must be reachable
   **from the patient file** and **from a calendar appointment "check out"**, with the
   generated invoice sitting alongside appointment history.

2. **Treatment "Blocked times" don't appear on the calendar.** Blocks added under
   Availability → Treatment (`addTreatmentBlock`) are stored in
   `treatmentAvailabilityByOwner[ownerID].blocks` and gate booking, but the calendar
   only renders *external* (Google/Apple) busy bands — never these blocks. (Auth-slot
   bookings via `bookAuthSlot` already render as `authSlot` appointments, so they are
   out of scope.)

## Decisions (owner-confirmed)

- **Live behaviour of the manual invoice:** *PDF now, persist later.* Demo records the
  invoice and shows it with appointment history; live generates the tax-invoice PDF to
  download/email immediately (via the existing `shareOrMailFile` hand-off) with **no**
  server record yet. Server persistence + mark-paid is a follow-up in the separate
  backend repo (a new client-invoice callable).
- **Existing checkout:** *add alongside.* The price-list/wallet checkout stays as-is
  (demo only); the manual composer is a new option that works in both demo and live.
- **Calendar sync scope:** *treatment blocked times only* (not out-of-hours shading).
- **Invoice kind:** new `"client-invoice"`, distinct from the wallet-linked `"client-sale"`.
- **GST defaults:** "Charge GST" on, "Prices include GST" on (typical GST-registered AU clinic).

## Feature A — Manual client invoice

### A1. GST math — `computeManualInvoice` (`src/lib/demo/invoicing.ts`)

```ts
export interface ManualLineInput { id: string; description: string; amountCents: number; }
export interface ManualGstOptions { chargeGst: boolean; gstIncluded: boolean; }
export function computeManualInvoice(lines: ManualLineInput[], opts: ManualGstOptions): ComputedInvoice
```

Per line, on the integer-cents amount the user typed (money is always integer cents,
never floats — billing-matrix rule):

| chargeGst | gstIncluded | gstCents | feeCents (net) | line total |
|-----------|-------------|----------|----------------|------------|
| false     | —           | `0`      | `amount`       | `amount`   |
| true      | true        | `round(amount/11)` | `amount − gst` | `amount` |
| true      | false       | `round(amount × 0.1)` | `amount` | `amount + gst` |

Line shape mirrors the checkout/service-fee lines: `{ authorisationID: id, dateISO: "",
patientName: "", feeCents, gstCents, description, qty: 1, unitCents: amount }`. Setting
`unitCents = amount` (the typed figure) keeps the PDF's UNIT column showing what the user
entered while AMOUNT shows the line gross (`feeCents + gstCents`) — correct for both the
inclusive and on-top cases.

Validation: at least one line; each `description` non-blank; each `amountCents` a positive
integer. (Mirrors `createServiceInvoice`'s per-line validation.)

### A2. Types & PDF

- `InvoiceKind` gains `"client-invoice"` (`src/lib/demo/invoicing.ts`).
- `Invoice` gains:
  - `appointmentID?: string` — set when checked out from a calendar appointment; links
    billing ↔ appointment.
  - `gstIncluded?: boolean` — recorded so the PDF statement/wording is accurate.
- `buildTaxInvoiceModel` (`src/lib/demo/invoicePdf.ts`) emits a
  `taxStatement: string | null`: `"The total price includes GST."` when
  `invoice.gstCents > 0` (true in both the inclusive and on-top cases — the grand total
  always contains the GST amount), else `null`. The currently-hardcoded statement render
  at `invoicePdf.ts:305-307` becomes conditional on `taxStatement` (skip entirely when
  null — we do **not** assert non-registration for a no-GST invoice).

### A3. Reducer + store

`src/lib/demo/backend.ts` — `createClientInvoice`, modeled on `createServiceInvoice`
(the array `state.invoices`, `appendAuditEntry`, `invoicePartyFor`):

```ts
export interface CreateClientInvoiceInput {
  patientID: string;
  lines: { description: string; amountCents: number }[];
  chargeGst: boolean;
  gstIncluded: boolean;
  appointmentID?: string;
}
// Pure builder shared by demo + live (no state mutation):
export function buildClientInvoice(state, input, identity, now): Invoice
export function createClientInvoice(state, input, identity, now): DemoState // appends + audits
```

- **Permission:** viewer has commercial access to the patient — reuse the exact guard
  `checkoutClient` uses: `patientAccessLevel(state, identity, patient) !== "none"`; throw
  `notPermitted` otherwise (also `notFound` when the patient is missing).
- **Issuer party:** the **owning silo** (`patient.owner`), identical to `checkoutClient` —
  `issuerRef: patient.owner`, `issuer: issuerPartyFor(state, patient.owner)`. The client
  belongs to the owner's book, so the client-facing document issues from that business even
  when a collaborator operates. (This corrects the earlier "acting identity" framing.)
- **Bill-to:** `clientBillTo(patient)` (name + address, no ABN).
- Invoice: `kind: "client-invoice"`, `counterpartyType: "client"`,
  `counterpartyID: patient.id`, `patientID: patient.id`, `issuerRef: patient.owner`,
  `gstIncluded`, `appointmentID`, `paid: false`, `periodLabel: isoDay(now)`,
  `doctorID: ""` (inert). Totals via `computeManualInvoice`.
- **No service-fee split** (deliberate interim simplification): unlike `checkoutClient`,
  a practitioner operating on a clinic client does *not* also get a drafted service fee —
  this manual tool issues exactly one client-facing invoice. The split stays with the
  richer price-list checkout; add later if the owner wants it.
- Audit action `client_invoice_issued`.

`src/lib/demo/store.tsx` — `createClientInvoice(input, identity): Invoice`:
- **Demo** (`!live`): apply `backend.createClientInvoice` and return the persisted invoice.
- **Live:** `backend.buildClientInvoice(...)` → return the transient invoice for PDF
  hand-off; **no `setState`** (nothing persists live yet).

### A4. `ClientInvoiceComposer` component (`src/components/app/ClientInvoiceComposer.tsx`)

- Props: `{ patient: Patient; appointmentID?: string; onIssued?: (invoice: Invoice) => void }`.
- Manual line rows (description + price) with monotonic keys (the `ServiceInvoiceComposer`
  pattern — array-index keys re-associate IME/focus on mid-list removal).
- Checkboxes: **"Charge GST (10%)"** and, when on, **"Prices include GST (总价含 GST)"**
  (bilingual labels follow `PatientAccount`'s "实际支付/赠送金额" precedent).
- Live preview grid (Description / Qty / Unit / GST / Total) reusing the shared
  `CELL`/`NUM_CELL` table styling for parity; GST column reads 0 / hidden when no GST.
- **Issue** → `store.createClientInvoice(...)`; on success render the issued invoice with
  **Download PDF / Email invoice** through the shared `InvoiceActions`.
- Renders nothing without commercial access to the patient.

**Refactor:** extract `InvoiceActions` (currently a private component inside
`src/app/app/billing/page.tsx`) into `src/components/app/InvoiceActions.tsx`, unchanged in
behaviour, so the billing page and the composer share one implementation.

### A5. Entry point 1 — patient file (`src/app/app/patients/[id]/page.tsx`)

- New "Invoice client" section rendering `ClientInvoiceComposer`, visible in **both** demo
  and live for viewers with commercial access, placed near the existing
  `PatientAccountSection` (which stays demo-only, alongside).
- Demo only: a per-patient list of issued `"client-invoice"` invoices (each with
  `InvoiceActions` — Download / Email; no Delete, since `deleteInvoice` fails closed on
  `doctorID: ""` and delete wasn't requested), and an "Invoiced $X" chip/link on
  appointment-history rows whose appointment is linked via `appointmentID`.

### A6. Entry point 2 — calendar check-out (`src/app/app/calendar/page.tsx`)

- In `AppointmentActions` (inside the `AppointmentDetail` modal), add a **"Check out"**
  button for appointments that have a patient (`appt.patientID`) and are manageable by the
  viewer.
- It reveals `ClientInvoiceComposer` inline, prefilled: patient = the appointment's
  patient, `appointmentID = appt.id`, first line description seeded from
  `appt.appointmentNote` (editable).
- Issuing hands off the PDF (both modes) and, in demo, persists + links the invoice.
  Optionally offer "Mark completed" beside it. The modal already scrolls (`max-h-[85vh]`).

## Feature B — Treatment blocked times on the calendar

- Selector `treatmentBlocksForOwnerOnDay(state, ownerID, dateISO)` in `backend.ts`
  (filter `treatmentAvailabilityForOwner(state, ownerID).blocks` by `dateISO`), exposed via
  the store for testability.
- New `BlockedBands` component in `calendar/page.tsx` mirroring `BusyBlocks`: each block
  rendered as a muted, non-interactive (`pointer-events-none`) band clamped to
  `[WIN_START, WIN_END]`, labelled "Blocked" and visually distinct from the external
  "Busy · external calendar" band (solid muted fill vs. the external hatched pattern).
- Rendered beside `<BusyBlocks>` in both `DayTimeline` and the `WeekView` day columns,
  keyed on the same `ownerID` (clinic id or user id — the treatment-availability owner key).
- Scope: blocks only, not out-of-hours. Auth-slot bookings already render — untouched.

## Testing

- **Unit** `computeManualInvoice`: all four GST combinations + rounding (e.g. inclusive
  $110 → GST $10, net $100; on-top $100 → GST $10, total $110; odd-cent rounding);
  positive-integer-cents enforcement.
- **Unit** `createClientInvoice`/`buildClientInvoice`: access guard (no commercial access
  → throws), party stamping (issuer clinic vs practitioner; bill-to patient), appointment
  linkage, audit entry, kind/counterpartyType; live path returns transient invoice without
  mutating state.
- **PDF** `buildTaxInvoiceModel`: `taxStatement` present when `gstCents > 0`, absent when 0.
- **Component** `ClientInvoiceComposer`: add/remove lines; GST toggles change preview +
  total; issue calls the store; PDF actions appear after issue.
- **Integration** calendar check-out: "Check out" opens the composer prefilled; issuing
  links the invoice to the appointment (demo) and the appointment-history chip appears.
- **Calendar** `BlockedBands`: a block renders a band on its day (day + week views); a block
  on another day does not.

## Out of scope / follow-ups

- Live **server persistence** + mark-paid for client invoices (separate backend repo
  callable) — the "persist later" half.
- Out-of-hours / closed-day shading on the calendar (blocks only now).
- No change to the demo price-list/wallet checkout (kept alongside).

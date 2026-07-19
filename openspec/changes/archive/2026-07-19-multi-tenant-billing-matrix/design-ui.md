# UI Design — Multi-Tenant Billing Matrix

Design direction for the new surfaces. The app already has a strong visual identity —
Fraunces display serif over a warm parchment ground, gold (`--color-gold`) for identity
accents, rose tint (`--color-tint`) for actions, hairline `border-line` cards with
`rounded-card`/`rounded-inner` radii, uppercase `micro` labels, and the verified bordered
invoice grid. Every new surface extends that language; nothing introduces a new aesthetic.

## 1. Patient file — "Account" section (wallet + checkout)

A new section on the patient detail page, visible only when the isolation guard grants
commercial access. It reads as one card, laddered like the existing file sections:

```
┌─ rounded-card border-line bg-card ────────────────────────────┐
│ micro: ACCOUNT BALANCE            [silo chip: e.g. "Lumière"] │
│ font-display 4xl:  $3,800.00                                  │
│   ↳ balance in ink; gold-deep chip names the owning silo      │
│ [Top up]   [Checkout]        ← rounded-btn, tint-filled       │
│───────────────────────────────────────────────────────────────│
│ History (collapsible)                                         │
│  12/7 Top-up      +$4,000 cash  ☆ +$1,000 gift    INV-…       │
│  14/7 Checkout    −$1,200 → INV-…                             │
└───────────────────────────────────────────────────────────────┘
```

- **Balance** uses the same `font-display text-4xl` treatment as the billing page's
  "Total approved requests" stat — the wallet is a stat, not a bank UI.
- **Silo chip**: `micro` pill (`rounded-full border border-line`) naming the owning
  silo ("Dr Elena Voss", "Sarah Chen — independent", "Lumière Aesthetics"). This is the
  isolation story made visible: the credit lives *here* and nowhere else.
- **History rows** follow the drilldown row pattern (border-b hairlines, `text-sm`,
  `text-xs text-ink-soft` detail line). Entry-type differentiation:
  - cash top-up amount in `text-ink`, prefixed `+`;
  - **gift credit** portion as a gold accent chip — `☆ gift` styled
    `background: var(--color-gold-soft); color: var(--color-gold-deep)` — never mixed
    into the cash figure, always its own token;
  - drawdowns prefixed `−` in `text-ink-soft` with the settled invoice number as a
    quiet link to the document.

## 2. Top-up form (in-card expansion, like GeneratePanel)

Expanding under the Account card (`rounded-inner border border-line p-3`), not a modal:

- Two `rounded-field` inputs side by side, `micro` labels:
  **"Paid amount (实际支付)"** and **"Gift credit (赠送金额)"** — bilingual labels kept
  verbatim, gift input defaults to `0.00`.
- A live derived line beneath, right-aligned, mirroring invoice totals typography:
  `Total credit added (到账总额)` in `micro` + the sum in `font-display text-2xl`.
  When gift > 0, append the gold gift chip so the promotional nature is visible
  before confirming.
- Confirm button: tint-filled `rounded-btn` "Top up & issue invoice" — one action,
  one ledger entry, one linked tax invoice. Disabled until paid+gift > 0.
- Validation states reuse the app's quiet error tone (`--color-rose` text-xs).

## 3. Checkout panel (in-card expansion)

Follows GeneratePanel's anatomy exactly (checkbox list → derived preview grid → action):

- **Issuer banner** first — a single `micro` line stating the scenario the system
  derived: "Billing as **Dr Elena Voss** (your client)" or
  "Billing as **Lumière Aesthetics** — clinic client · your service fee will be drafted".
  The user never chooses the scenario; the banner announces it.
- **Item picker**: price-list rows as checkbox rows (hover `tint-soft/40` like script
  selection), each with name, kind tag (`micro`: SERVICE / PRODUCT), GST-inclusive
  price, and a compact qty stepper (`− 1 +`, `rounded-field` buttons) that appears
  once ticked.
- **Preview**: the existing bordered grid verbatim (`CELL`/`NUM_CELL` classes, outer
  frame on the scroll wrapper, right-aligned Subtotal / GST (10%) / bold Total).
  GST column shows the inclusive component (total/11).
- **Wallet toggle**: when balance ≥ total, a checkbox row styled like the script rows:
  "Pay from account balance ($3,800 available)" — ticking it annotates the Total row
  with `→ paid from wallet` in `text-ink-soft`. Insufficient balance renders the row
  disabled with the shortfall stated plainly.
- **Split-billing note** (Scenario B only): beneath the action button, a `text-xs
  text-ink-soft` line — "A service-fee invoice to Lumière for $X will be drafted for
  you to review in Invoice." No second grid here; the draft lives on the billing page.

## 4. Billing page — role-aware streams

The page keeps its single-column `max-w-3xl` rhythm; streams are `section`s with the
existing `font-display text-xl` headings.

- **Doctor**: current layout untouched, then two new sections below —
  "Client invoices" (issued client-sale/top-up docs) and "Service fees" (drafts to
  finalize + issued). Order preserves the authorisation flow's primacy.
- **Nurse**: replaces the old "sent by email" stub with the same stream sections.
- **Clinic admin**: "Client invoices" (clinic-issued) and "Received service fees"
  (practitioner→clinic), plus the existing clinic statistics card.
- **Invoice rows** reuse the existing row component anatomy (period · party · amount ·
  Paid/Unpaid chip · actions). New affordances:
  - kind tag as a `micro` chip before the amount: CLIENT / TOP-UP / SERVICE FEE —
    hairline border, no fill; the existing Paid chip stays tint-filled.
  - **Draft state**: gold treatment — `border border-gold text-gold-deep` chip
    "Draft" and a tint-filled "Finalize & send" button. Draft rows sit under a
    `micro` sub-heading "Awaiting your review" at the top of the Service fees stream.
- Empty states use the established `text-sm text-ink-soft` single-line copy.

## 5. Documents

PDF and preview both come from the one parameterized model — the verified template is
the design (metadata top-right, stacked blocks, ruled grid). Only two additions:

- **Gift footnote row** (top-up invoices): final grid row, description column reads
  "Promotional Gift Credit Applied: $1,000.00 (Non-Taxable). Total Wallet Value
  Loaded: $5,000.00."; numeric columns render an em dash. In the on-screen preview
  the row's text is `text-ink-soft italic` so it visibly reads as informational.
- **Client TO block**: name + address lines only — no ABN row (sellers keep the
  em-dash ABN fallback).

## Component inventory

| Component | Home | Reuses |
|---|---|---|
| `PatientAccountSection` | patient file page | stat typography, drilldown rows |
| `TopUpPanel` | inside AccountSection | rounded-field inputs, totals typography |
| `CheckoutPanel` | inside AccountSection | GeneratePanel anatomy, preview grid |
| `WalletHistory` | inside AccountSection | drilldown row + chips |
| `InvoiceStreamSection` (kind-tagged rows, draft finalize) | billing page | invoice row anatomy |
| gift chip, kind chip, silo chip | shared | `micro` pill pattern |

# Design: billing grain reconciliation

**Date:** 2026-06-29
**Status:** Approved (brainstorming) — pending spec review
**Repo:** `Aestheticx-marketing` (branch `claude/billing-grain-reconcile`, off `claude/gst-invoices` / stacks on #16)

## Goal

Make the billing dashboard's "billable" count consistent with invoicing. Today the dashboard counts
`billingEvents` (one per **approved request**) via `billingSummary(ledger, …)`, while invoicing operates
per **authorisation** (line item). So the dashboard count never matches the invoice line count and never
decrements when invoices are generated. Reconcile by making **un-invoiced authorisations** the single
source for billable counts, and remove the now-redundant web `billingEvents`/`ledger` read path.

## 1. Re-point `billingSummary` to authorisations — `src/lib/demo/billing.ts`

- Change the signature to `billingSummary(authorisations: Authorisation[], identity: Identity):
  BillingSummary`. For each authorisation, derive a billable row `{ doctorID, counterpartyType:
  clinicID ? "clinic" : "nurse", counterpartyID: clinicID ?? nurseID, monthKey: monthKey(createdAt) }`
  and **keep only `!invoiced`** rows.
- Apply the **same** role scoping and grouping as today (doctor → group by counterparty; nurse/clinic →
  group by doctor; months desc; parties by count desc). The `BillingSummary` shape is unchanged, so the
  `/app/billing` UI needs no change.
- Net effect: the dashboard count equals the invoiceable line items and **drops as invoices are
  generated** (those authorisations flip `invoiced`); the per-row count and the GeneratePanel's
  "N selectable" now agree.
- `isVisible`/grouping logic is reused verbatim (the derived row has the same four fields the old
  `BillingEvent` path used). `monthKey`/`partyLabel`/`monthLabel` are unchanged.

## 2. Remove the redundant web `billingEvents`/`ledger` machinery

The backend `billingEvents` collection is **untouched** (still the server's billing record); we only stop
the web mirroring something it no longer reads:
- `types.ts` — delete `interface BillingEvent` and the `ledger: BillingEvent[]` field from `DemoState`.
- `backend.ts` — `emptyState()` drops `ledger`; `approveRequest` drops the `BillingEvent` construction
  and the `ledger: [...]` in its returned state (it keeps stamping `createdAt`/`invoiced` on the granted
  authorisations — that's what billing now reads). Drop the unused `BillingEvent` import.
- `mappers.ts` — delete `mapBillingEvent` and the `BillingEvent` import.
- `hydrate.ts` — drop `billingEvents` from `HydrationRows`, the `mapBillingEvent` import, the
  super-admin + normal-branch `billingEvents` queries, and the `ledger` from `assembleState`'s return.
- `store.tsx` — `billingSummary: (id) => billing.billingSummary(Object.values(state.authorisations), id)`.

## 3. Tests

- Rewrite `src/lib/demo/__tests__/billing.test.ts` to feed `Authorisation[]`: a doctor sees un-invoiced
  auths grouped by counterparty; an `invoiced: true` auth is excluded; a clinic-admin groups by doctor;
  an independent nurse with no matching auths sees zero. (`partyLabel`/`monthLabel`/`monthKey` tests
  unchanged.)
- `backend.test.ts` — drop the `next.ledger` billing-event assertions from the approveRequest test
  (keep the authorisation/grant assertions).
- `hydrate.test.ts` — remove the `billingEvents` fixture row and the `ledger` assertions (keep
  `invoices`/`scriptPricing`).

## 4. Testing & verification

- TDD the new `billingSummary` (authorisation-based) parity cases above; full suite + `tsc`/`lint`/`build`
  green.
- **Demo smoke (preview):** as Dr Voss, Billing shows **2** billable authorisations (the seed's 2-item
  approval) under Lumière/June; generate the invoice → the count drops to **0** and the row disappears,
  with the invoice listed (the consistency the reconciliation delivers). Screenshot.
- **Live doc:** update the "Billing dashboard" + "GST invoices" sections of
  `firebase-live-verification.md` — remove the grain-mismatch caveat; note the count is now un-invoiced
  authorisations and decrements on invoicing.

## 5. Caveats / out of scope

- Backend `billingEvents`/`billingMonthly` collections are unchanged (server-side billing record); only
  the web stops reading `billingEvents`.
- Counts are now per authorisation (line item), matching invoicing — this supersedes 3a's per-request
  grain. Party-name resolution and role scoping are unchanged.

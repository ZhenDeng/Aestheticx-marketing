# Design: billing dashboard (increment 3a)

**Date:** 2026-06-29
**Status:** Approved (brainstorming) — pending spec review
**Repo:** `Aestheticx-marketing` (branch `claude/billing-dashboard`, off `main`)
**Source of truth:** iOS/Firebase backend `backend/functions/src/{index,domain}.ts` (`billingEvents`
write on approval, `monthKey`, `billingCounterparty`); `backend/firestore.rules` (billingEvents read).

## Goal

A read-only, role-aware **billing dashboard** showing **billable authorisation counts** — one per
approved request, the grain shared by the existing web `ledger` and the backend `billingEvents`
collection — grouped by **month × counterparty**. This wires up the billing ledger (currently recorded
but never displayed, and never hydrated in live) and aligns its shape to the backend. Money, pricing and
GST invoices are the **next** increment (3b).

## Context (current state)

- `BillingEvent` (`src/lib/demo/types.ts:152`) is a simplified shape: `{ id, requestID, patientID,
  counterpartyID, createdAt }`. `approveRequest` (`backend.ts`) appends one per approval
  (`counterpartyID = clinicID ?? request.nurse.id`) to `state.ledger`.
- **Nothing displays it**, no store accessor exposes it, and live hydrate returns `ledger: []`
  (`hydrate.ts:45`) — the collection is never queried.
- Backend writes `billingEvents/{id}` = `{ requestId, doctorId, counterpartyType: "nurse"|"clinic",
  counterpartyId, monthKey, createdAt }` on `approveRequest`; rules allow the doctor, the counterparty
  nurse, and clinic members to read their own.

## 1. Wire-align `BillingEvent` + record on approval

- Extend `BillingEvent` to: `{ id, requestID, patientID, doctorID, counterpartyType: "nurse" | "clinic",
  counterpartyID, monthKey, createdAt }` (adds `doctorID`, `counterpartyType`, `monthKey`).
- Add a pure `monthKey(millis: number): string` → `"YYYY-MM"` (UTC), ported from backend `domain.monthKey`.
- In `approveRequest`, populate the event: `doctorID: request.doctorID`, `counterpartyType: clinicID ?
  "clinic" : "nurse"`, `counterpartyID: clinicID ?? request.nurse.id`, `monthKey: monthKey(now)`.
- Update the existing approveRequest/ledger test for the new fields.

## 2. Mapper + live hydrate

- `mapBillingEvent(id, data)` in `mappers.ts` — reads `requestId`, `doctorId`, `counterpartyType`,
  `counterpartyId`, `monthKey`, `createdAt` (`toMillis`).
- `hydrate.ts`: add `billingEvents: Row[]` to `HydrationRows`; in `assembleState` map it into `ledger`
  (replacing the hardcoded `ledger: []`). In `hydrate()`, query `billingEvents` with role-scoped
  constraint sets mirroring the rules, deduped via a Map (same pattern as authorisations):
  - doctor: `where("doctorId","==",uid)`
  - nurse: `where("counterpartyType","==","nurse"), where("counterpartyId","==",uid)`
  - clinic: for each clinic id, `where("counterpartyType","==","clinic"), where("counterpartyId","==",cid)`
  - super-admin branch: `runQuery("billingEvents")` (all).

## 3. Pure aggregation (TDD) — new `src/lib/demo/billing.ts`

- `billingSummary(ledger: BillingEvent[], identity: Identity): BillingSummary` where
  `BillingSummary = { totalCount: number; months: { monthKey: string; count: number; byParty:
  { id: string; type: "doctor" | "nurse" | "clinic"; count: number }[] }[] }`.
  - **Scopes** the ledger to events visible to `identity` (so demo mirrors live): doctor →
    `doctorID == me`; nurse → `counterpartyType == "nurse" && counterpartyID == me`; clinic-admin/clinic
    context → `counterpartyType == "clinic" && counterpartyID == myClinicId`.
  - **Grouping dimension by role:** a **doctor** groups by **counterparty** (`byParty.type` = the
    event's `counterpartyType`, id = `counterpartyID`) — who they bill; a **nurse/clinic** groups by
    **doctor** (`type: "doctor"`, id = `doctorID`) — who bills them.
  - Months sorted desc by `monthKey`; parties within a month sorted by `count` desc then id.
- `partyLabel(type, id, accounts, clinic): string` — resolves a user id via `DEMO_ACCOUNTS` users or the
  clinic id via the known clinic (`LUMIERE`), falling back to the raw id.
- Tests: a doctor sees the seeded approval (1) under its `monthKey` + the Lumière counterparty; a nurse
  with no events → `totalCount: 0`, `months: []`; a clinic-admin sees the clinic's event grouped by
  doctor.

## 4. Store + UI

- Store: add `billingSummary: () => billing.billingSummary(state.ledger, identity)` to `StoreValue` and
  the value object (identity from the store's current identity).
- New route `src/app/app/billing/page.tsx`: guards (identity, not loading); render the **total billable
  count**, then a section per month (desc) listing each party (`partyLabel`) with its count; an empty
  state ("No billable authorisations yet."). Role-aware heading: doctor → "Authorisations you can bill";
  nurse/clinic → "Billable to you".
- Add a **"Billing"** link to the app header nav (alongside Dashboard / Patients / Authorisations /
  Calendar).

## 5. Testing & verification

- **TDD (offline):** `billingSummary` + `partyLabel` + `monthKey` (`src/lib/demo/__tests__/billing.test.ts`);
  update the approveRequest ledger test. Existing suite stays green; `npm test`/`tsc`/`lint`/`build` clean.
- **Demo smoke (preview):** sign in as **Dr Voss** → Billing shows **1** billable authorisation under the
  seed month, attributed to **Lumière Clinic**; as **Sarah (nurse)** → Billing shows **0** (the seeded
  approval is billable to the clinic, not her); as **Ava (clinic admin)** → shows the clinic's 1,
  grouped under Dr Voss. Screenshot.
- **Live (manual, owner, TEST account):** append a "Billing dashboard" section to
  `docs/superpowers/firebase-live-verification.md` — approve a request for a TEST patient, then open
  Billing and confirm the count appears under the right month/counterparty, and that the role scoping
  matches (doctor vs nurse vs clinic-admin) and reflects the deployed `billingEvents` rules.

## 6. Caveats / out of scope

- **Counts = approved requests** (the established `billingEvents` grain), not per-medication line items.
- **No money** — pricing (`setScriptPrice`), GST invoice generation (`generateInvoice`) and PDF download
  (`mintDownloadUrl`) are **increment 3b**.
- **Party names** are resolved via the demo accounts/clinic; live has no name directory yet, so it falls
  back to the raw id (documented; a directory is a separate concern).
- The backend `billingMonthly` rollup collection is **not** used — we aggregate `billingEvents` directly
  (one readable source across roles).

# Invoice + calendar feedback batch (14/07) — web design

**Date:** 2026-07-14
**Branch:** `feat/invoice-calendar-feedback-0714`
**Source:** owner feedback "14/07 new comments" (9 items).

## Gap analysis result

The invoicing machinery largely exists (billing page monthly counterparty grid, doctor-writable
per-counterparty price via the deployed `setScriptPrice`, `generateInvoice` callable +
`buildInvoiceTx`, backend `invoicePdf.ts` render + auto-queued `mailOutbox` email). What's
missing on the web: current-month **drilldown** (date – patient – detail), the **ATO Example 2
tax-invoice layout**, any **demo-mode PDF**, surfacing the **email**, an **"Invoice" nav entry**,
authSlot **calendar chip wording**, week-view **editing parity**, upcoming-call **requester +
pre-call review**, and a usable **mobile nav**.

## Per item

### 1. Dashboard tile
Replace the "Patients you can see" tile with **"Authorisation approved this month"**: the
current `monthKey(now)` count from `billingSummary(identity)` (doctor: their approvals;
nurse/clinic: approvals billed to them). Links to `/app/billing`. Pure helper
`approvedThisMonth(state, identity, now)` in billing.ts.

### 2. Invoice section (doctor)
- Nav: clinical nav gains **"Invoice" → `/app/billing`** (all clinical roles keep Profile's
  Billing link; the tab satisfies "a section 'invoice' in doctor's login").
- Billing page, doctor view: **"This month"** section at top — one row per counterparty
  (`nurse/clinic name — N authorisations`, from `billingSummary` current month). Clicking a
  row opens the **counterparty detail**: all of that month's authorisation events as
  `date — patient name — items summary`, sorted most-recent-first (pure
  `counterpartyMonthDetail(state, doctorID, party, monthKey)` on the deduped
  billingEvents grain), plus the existing **price-per-authorisation editor**
  (`setScriptPrice` — already doctor-writable; note: a super-admin cooperation-relationship
  override still wins, matching "unless changed by the doctor or super admin") and the
  existing un-invoiced selection + **Generate invoice** flow (GeneratePanel, reused).

### 3+4. Tax-invoice PDF — ATO Example 2, client-rendered
New `src/lib/demo/invoicePdf.ts` on the shared hand-rolled writer. Layout = ATO **Example 2**
(sale ≥ $1,000 form, also valid below): heading **TAX INVOICE**; seller identity + ABN
(invoice `issuer` snapshot, else business-entity/party fallback); **buyer identity + address**
(`billTo`); issue date; item table where **each line shows qty 1, unit price, GST and
GST-inclusive line total**; description per line = `"{d/m/yyyy} – {patient name} treatment
authorisation"`; totals block (Subtotal ex GST, GST 10%, **Total amount payable**) and the
statement **"The total price includes GST"**. Default price stays `DEFAULT_SCRIPT_PRICE_CENTS`
= $25 + 10% GST = $27.50/line (`computeInvoice` unchanged).
Download button renders **client-side in BOTH modes** (all data is in state) — replaces the
live-only `mintDownloadUrl` path so the owner gets the requested layout everywhere without a
backend deploy. (Backend `invoicePdf.ts`/Storage copy remains the archival artifact; flagged
as follow-up to align layouts.)

### 5. Email after generating
Backend already queues a `mailOutbox` email to `billTo.email` post-generation. Web: after
Generate, show the email state on the invoice row ("Emailed to {billTo.email}" / "No billing
email on file"); demo mode mirrors the same caption. **Backend follow-up flagged:** `mail.ts`
ignores `attachmentPath` — the PDF is not actually attached yet (other repo).

### 6. Calendar authSlot chips
`appointmentTitle` gains an authSlot branch: **"{nurse/clinic} – {patient} – teleconsult"**.
Booker name resolves from `bookedByID` (new pure `bookerLabel(state, bookedByID)`:
`accountsByID` → demo `ownerLabel` → parse the legacy `appointmentNote` "Auth request · X"
suffix → raw id). Signature becomes `appointmentTitle(state, a, placeholder?)` (or a wrapper)
— all six chip sites + dashboard call it, so one change point. Shows identically on the
doctor's (owner) and the booking nurse's/clinic's (bookedBy) calendars.

### 7. Week-view editing parity
- Tap a `WeekBlock` → open the same `AppointmentDetail`/`AppointmentActions` panel as day view
  (today it switches to day view). Keep drag/resize.
- Tap an empty week column slot → same chooser (New appointment | Block time) →
  `NewAppointmentForm` seeded with that day + minute. `NewAppointmentForm` gains a
  `dateISO` prop (day view passes the selected date, week passes the tapped column's date).

### 8. Upcoming authorisation calls (doctor dashboard)
- Row shows the **requesting nurse/clinic name** (same `bookerLabel`).
- For an **existing patient** the row links to the patient file so the doctor can review
  info + previous notes before the call — **gated on access**: link renders when the patient
  is in state and `patientPermissions(...).canView` (prescriber/reviewer/clinic-context).
  Full "any booked call grants pre-call read access" needs a backend rules/trigger change —
  flagged as follow-up in the other repo; the UI lights up automatically once hydration
  delivers the patient.

### 9. Mobile nav
The underline strip stays for `sm:`+. Below `sm:` the nav becomes a **wrapping pill grid**
(3 per row — the Invoice tab makes 9 clinical tabs, so 3×3) — every tab visible at once, no
horizontal scrolling. Active pill = tint-soft background + tint border; inactive = line
border. Same `navItemsFor` data.

## Tests
- billing: `approvedThisMonth` (doctor + counterparty perspectives, month boundary);
  `counterpartyMonthDetail` (dedupe, sort desc, items summary, month/party filter).
- invoicePdf: layout model (lines, totals, GST math, "The total price includes GST",
  buyer identity), bytes contain every Example-2 element; description format.
- appointmentTitle/bookerLabel: authSlot wording both perspectives, legacy note fallback,
  non-auth types unchanged.
- week view: detail panel opens (component test), chooser on empty tap (or pure helpers if
  DOM-heavy — slotStartMinute already tested).
- upcoming calls: requester label + link gating.
- nav: unchanged data; AppShell class change is visual (browser QA).

## Out of scope (flagged in PR)
- Backend: mail.ts attachment support; backend invoicePdf Example-2 alignment; rules/trigger
  for pre-call patient access on booked auth slots.

# 15/07 Feedback Batch — Design

Owner feedback (2026-07-15), 8 items. Built on `feat/feedback-0715`. Demo + live parity where the
backend already supports it; live-only gaps that need the separate backend repo
(`~/Documents/AestheticX`) + a production deploy are flagged as **BACKEND FOLLOW-UP**.

Gap analysis run against `main` (post-PR #93) with 5 parallel Explore agents.

## Item 1 — Route + dosing on active authorisations and the treatment-note selector
**Pure web.** `MedicationItem` already carries `dosage` (required) and `route?` (optional, round 6);
helpers `routeLabel()` (`types.ts`) and `unitSuffix()` (`catalog.ts`) already format them and are used
in the approval/direction PDFs — just not on these two screens.

- **Active authorisations** (`patients/[id]/page.tsx`, "Active authorisations" card): each row shows only
  name + areas + repeat dots. Add a line: `{dosage} {unitSuffix(unit)}` + `· {routeLabel(route)}` when a
  route is present (legacy items have none → omit, matching the em-dash convention in the PDFs).
- **Treatment-note selector** (`TreatmentNoteForm.tsx`, "Optionally consume authorisations"): each tickable
  row shows name + "N left". Add the approved dosing + route to the label so the nurse sees what was
  approved before ticking.

## Item 2 — Email + address in the patient basic-info block
**Pure web, display-only.** `Patient.email` and `Patient.address` are required strings, populated in seed,
the live mapper, and the edit form — just never rendered on the file. Add `Email` and `Address` cells to the
basic-info `<dl>` in `patients/[id]/page.tsx` (address spans full width since it's a flat one-line string).

## Item 3 — Nurse/clinic reschedule/cancel of booked authorisation appointments
An auth teleconsult (`type: "authSlot"`) is owned by the **doctor** (`ownerID`); the booking nurse/clinic is
`bookedByID`. Both see the one shared record (calendar queries match `ownerID || bookedByID`), so any
permitted change already propagates to the doctor automatically — no new sync payload needed.

Today reschedule/cancel are blocked for the booker in **both** the UI and the backend (owner-only gates).

- **Web/demo (this PR):** new pure `canManageAppointment(appt, scope)` = owner **or** (`authSlot` &&
  `bookedByID === scope`). `rescheduleAppointment` and `canRescheduleAppointment` (drag/resize) use it, so the
  booker can reschedule. Per the feedback's literal "reschedule or **cancel**", `markAppointment` admits the
  booker **only for `cancelled`** — `completed`/`noShow` stay the owner's (doctor's) clinical determination;
  `confirmAppointment` stays owner-only. UI: `AppointmentActions` shows Reschedule + Cancel to the booker;
  Confirm/Complete/No-show render only for the owner. Lead-linking stays owner-only (`isOwner`).
- **BACKEND FOLLOW-UP (live):** the deployed `rescheduleAppointment` / `markAppointment` Cloud Functions +
  Firestore rules enforce owner-only server-side. They must accept the `authSlot` booker
  (`bookedById === caller scope`) for live to work. Until deployed, a nurse's live reschedule/cancel is
  rejected server-side (surfaces as the `lastSyncError` banner).

## Item 4 — Invoice section is doctor-only; nurse/clinic receive it by email
- **Web (this PR):** `/app/billing` becomes **doctor-only**. Remove the "Invoice" nav tab for non-doctors
  (`nav.ts`), hide the profile billing link for non-doctors, and guard the billing route (defense-in-depth
  message if reached directly).
- **Email to nurse/clinic:** in **live**, the deployed `generateInvoice` Cloud Function already queues the
  invoice email to `billTo.email` (guarded). The doctor's invoice row already reports "Emailed to …". No web
  change needed for the send itself.
- **BACKEND FOLLOW-UP (verify):** confirm the backend generation-time snapshot resolves the counterparty's
  email into `billTo.email` (demo can't know it — `invoicePartyFor` leaves email empty). If it doesn't, the
  guarded send skips silently. Also the flagged `attachmentPath`-ignored gap (PDF not attached) remains.

## Item 5 — Aftercare email not received; audit all email paths
Root cause (from the email path trace): **aftercare is the only client email path with no empty-recipient
guard.** Booking/invoice/welcome all do `if (!to) return`; the backend `sendAftercare` → `recordAftercareSend`
queues `to: patient.email` unconditionally, so a patient with a blank email produces a doomed `to:""` mail
that Resend rejects — while the note badge shows "Queued" forever (hydrate is one-shot, never streams the
async "failed" flip). Everything else in the pipeline is wired correctly.

- **Web (this PR):** guard the send at the source. `AftercareForm` shows the recipient ("Will be emailed to
  …") and, when `patient.email` is empty, disables Send with a clear message ("No email on file for this
  patient — add one in the patient file first"). This prevents the silent doomed send and tells the clinician
  exactly why it won't go out. Demo `recordAftercareSend`/live path unchanged otherwise.
- **BACKEND FOLLOW-UP (live delivery):** add the missing `if (!to) return` guard to the backend
  `sendAftercare`/`recordAftercareSend` so a blank recipient never queues; and verify the Resend
  configuration (API key, verified sender domain) since the owner reported a real non-delivery. A live
  aftercare **retry** path is also absent (the deployed `retryAftercare` callable has no web mirror; the
  Retry button is demo-gated) — wire it once the callable contract is confirmed.
- **Email inventory (audited):** aftercare (fix above), booking notify (guarded ✓), invoice email
  (guarded ✓), welcome (✓), password reset (✓), consent link (clinician's own mail client ✓).

## Item 6 — Mobile calendar horizontal scroll
**Pure web CSS.** Only the **Week view** overflows (`calendar/page.tsx`): a `min-w-[680px]` grid inside an
`overflow-x-auto` wrapper forces ~305px of left–right scroll at 375px. Day and Month already fit. Gate the
min-width behind `sm:` so the existing `minmax(0,1fr)` day columns compress on mobile; shrink the hour rail +
chip text at the mobile breakpoint. No data/backend change.

## Item 7 — Garbled counterparty titles (raw Firebase uids)
**Pure web.** The billing page resolves counterparty names via `partyLabel(type, id, DEMO_ACCOUNTS, LUMIERE)`,
which scans only the compiled-in demo fixtures → returns the raw uid for any live counterparty. Every other
surface migrated to the state-aware `ownerDisplayLabel(state, {kind, id})` (demo cast → hydrated accounts →
cooperation-relationship names → readable role-prefixed stub, never a raw uid). Migrate the billing page's
three `partyLabel` call sites to `ownerDisplayLabel`. For a live doctor the counterparty name comes from the
hydrated cooperation-relationship snapshot (`accountsByID` is superAdmin-only), so this both de-garbles and
falls back readably.

## Item 8 — Invoice counted per authorization (script), not per medication
`approveRequest` writes one `authorisations` doc **per item** but one billing event **per request**. Display
surfaces (counts, drilldown, custom timeframe) already use the per-request grain, but **invoice generation
still bills per item** (`billableAuthorisations` undeduped → `computeInvoice` one line per item → subtotal =
price × item count). A 3-item request bills 3 × price. Owner: one request = one script = one line, priced once.

- **Web/demo (this PR):** add `requestID` to `BillableAuthorisation`; new pure `scriptsFromBillable(rows)`
  groups billable items by `requestID` (one script per request, carrying its member `authIDs`). `GeneratePanel`
  counts and previews **per script**; `generateInvoice` (demo) builds **one invoice line per script**, prices
  once, and flags **all** member item-authorisations invoiced (`authorisationIDs` = the flattened set).
- **BACKEND FOLLOW-UP (live):** the deployed `generateInvoice`/`buildInvoiceTx` still prices per line item.
  It must group by `requestID` and price per script to match. Until deployed, a **live** generated invoice
  still totals per item (the client per-script preview will differ from the server result) — flagged loudly.
  This reverses the 2026-07-04 "invoicing stays per item" decision per the owner's 2026-07-15 screenshot.

## Test plan
- `scriptsFromBillable`: multi-item request → one script; distinct requests → distinct scripts; carries authIDs.
- demo `generateInvoice`: 3-item request → 1 line, total = 1 × price (+GST); all 3 auths flagged invoiced.
- `canManageAppointment`: owner ✓; authSlot booker ✓; non-booker non-owner ✗; booker on a treatment appt ✗.
- backend `rescheduleAppointment`/`markAppointment`: permit authSlot booker, reject foreign non-owner.
- Item 1/2/6/7 verified in the browser preview (demo mode) + tsc/eslint/build green.

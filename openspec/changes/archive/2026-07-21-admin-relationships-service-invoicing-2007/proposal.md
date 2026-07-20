# Proposal: admin-relationships-service-invoicing-2007

## Why

20/07 owner feedback round. Two gaps surfaced:

1. The super-admin console shows all cooperation relationships as one combined list grouped by doctor, which answers neither operational question the owner actually asks: "who can this doctor authorise for?" (prescribing) and "who works at this clinic?" (employment). With dual-kind (employee + prescriber) doctor↔clinic relationships now supported, the single list conflates the two meanings.
2. The Invoice page is empty for nurses — a nurse can neither pick a client to invoice nor invoice their clinic, and nobody (nurse or employed doctor) can manually issue a service invoice to a clinic. Service-fee invoices today only appear as auto-drafts from checkout.

Also confirmed in this round (already true, to be locked in by spec + regression tests rather than new code): super-admin edits to a business entity's name/ABN flow into subsequently generated invoices (supports a clinician switching between sole trader and company), and identity switching only re-scopes calendar/patient views while prescribing (calls, authorisation requests, authorisation invoicing) follows the doctor's account regardless of active identity.

## What Changes

- **Split the admin relationships section into two views**: a *Prescribing* view grouped by doctor (every counterparty the doctor can issue authorisations to: nurse relationships + prescriber-kind clinic relationships) and an *Employment* view grouped by clinic (employee-kind doctor relationships + nurse/clinicAdmin accounts belonging to the clinic). All existing edit affordances (kind chips, active / requests-allowed / invoicing toggles, price override, remove, audit history, create form) are preserved.
- **Manual service invoice composer** on the Invoice page: an employee practitioner (nurse or doctor with clinic membership) can issue a `service-fee` invoice to their clinic with handwritten line-item descriptions and amounts; issuer and bill-to business-entity blocks are stamped automatically; GST-exclusive B2B math. Demo-mode (matrix layer) for now; live backend callable is a noted follow-up.
- **Populate the nurse's Invoice page**: an "Invoice a client" picker (clients the nurse can check out, linking to the client's account/checkout flow) plus the new "Invoice the clinic" composer, alongside the existing invoice streams.
- **Regression coverage, no behaviour change**: entity name/ABN edits reflected in newly generated invoices; dual-kind relationship independence (authorisation billing unaffected by employment; employee identity required to see clinic clients/calendar; prescribing surfaces unaffected by identity switching).

## Capabilities

### New Capabilities

- `admin-relationship-views`: The super-admin console's dual presentation of cooperation data — Prescribing view (by doctor) and Employment view (by clinic) — and what each lists, edits, and excludes.
- `manual-service-invoicing`: Practitioner-initiated service invoices to a clinic with handwritten line items and auto-stamped business identities, plus the populated nurse Invoice page.

### Modified Capabilities

- `cooperation-linking`: ADDED requirement — a dual-kind doctor↔clinic relationship's two kinds operate independently: employment governs clinic data access via the active identity; prescribing (requests, pricing, authorisation invoicing) is unaffected by employment or by the currently selected identity.
- `invoicing`: ADDED requirement — invoice party blocks are resolved from the *current* active business entity at generation time, so super-admin edits to legal/trading name or ABN appear on all subsequently generated invoices while existing invoices keep their frozen snapshots.

## Impact

- `src/components/admin/AdminConsole.tsx` — relationships section restructured into two views (plus any extraction into a dedicated component file).
- `src/lib/demo/backend.ts`, `src/lib/demo/invoicing.ts`, `src/lib/demo/store.tsx` — new manual service-invoice reducer/action; selectors for prescribing/employment groupings if needed.
- `src/app/app/billing/page.tsx` — nurse (and employed-doctor) surfaces: client picker + clinic service-invoice composer.
- Tests under `src/lib/demo/__tests__/` and `src/components/**/__tests__/`.
- No Firestore schema change. Live mode: manual service invoicing rides the existing `matrixEnabled` gate (demo-only) until the backend repo ships a callable — follow-up noted in design.md.

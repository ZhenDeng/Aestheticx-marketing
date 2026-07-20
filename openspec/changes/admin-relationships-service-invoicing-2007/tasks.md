# Tasks: admin-relationships-service-invoicing-2007

## 1. Relationships section extraction (no behaviour change)

- [x] 1.1 Move `CooperationRelationshipsSection`, `RelationshipRow`, `CreateRelationshipForm` (and their local helpers) verbatim from `AdminConsole.tsx` to `src/components/admin/RelationshipsSection.tsx`; re-export/import so `/app/admin` renders identically; existing tests still pass.

## 2. Prescribing / Employment views

- [x] 2.1 Add the `Prescribing | Employment` segmented switcher (default Prescribing) to the relationships section.
- [x] 2.2 Prescribing view: doctor-grouped list filtered to nurse counterparties + prescriber-kind clinic relationships, full edit affordances retained.
- [x] 2.3 Employment view: clinic-grouped list — employee-kind doctor `RelationshipRow`s + informational nurse/clinicAdmin member rows from `AccountRecord.clinicIDs`, clinic names via directory with fallback labels, empty-state line for staffless clinics.
- [x] 2.4 Create form reachable from both views; component tests: filtering both ways, dual-kind row appears in both views, edit in one view reflects in the other, member rows offer no relationship edits.

## 3. Manual service invoicing (demo/matrix layer)

- [x] 3.1 Backend reducer `createServiceInvoice` + input type: membership/lines validation, GST-exclusive math, `kind: "service-fee"`, `draft: false`, parties frozen via `invoicePartyFor`, field conventions identical to checkout-minted service-fee invoices; unit tests (happy path, validation failures, stream visibility for issuer and clinic, PDF model renders lines).
- [x] 3.2 Store action `createServiceInvoice` (matrix-gated, demo reducer; no live mirror).
- [x] 3.3 `ServiceInvoiceComposer` UI on the billing page: eligibility (practitioner with clinic identity, matrixEnabled), clinic picker when multiple, dynamic handwritten lines, live totals preview, per-line validation, issue + reset; component tests.

## 4. Nurse Invoice page population

- [x] 4.1 Nurse view of `billing/page.tsx`: "Invoice a client" picker (checkout-eligible clients under the active identity, linking to the client file), composer, existing streams, explicit empty states; doctor view gains the composer when employed.
- [x] 4.2 Component tests: populated nurse page, links, empty-state copy, doctor-with-employment sees composer, independent doctor does not.

## 5. Regression locks (existing behaviour, new coverage)

- [x] 5.1 Entity-edit flow-through test: `setBusinessEntity` (name/ABN change) → subsequently generated invoice carries new details; earlier invoice snapshot unchanged.
- [x] 5.2 Dual-kind independence tests: adding `employee` to a prescriber relationship changes neither `billingSummary` nor `generateInvoice` output; clinic patients/calendar visible only under the clinic identity; `prescriberIdentity`-keyed surfaces (pending requests) unaffected by active identity.

## 6. Verify

- [ ] 6.1 Full test suite + typecheck/lint green; manual browser pass over admin views and nurse billing page in demo mode.

# Design: admin-relationships-service-invoicing-2007

## Context

- The relationships UI is one combined section inside `src/components/admin/AdminConsole.tsx` (`CooperationRelationshipsSection` :446, `RelationshipRow` :686, `CreateRelationshipForm` :862), grouped by doctor only. Kind model already exists: `RelationshipKind = "employee" | "prescriber"`, `effectiveRelationshipKinds()` (`types.ts:481`), nurse relationships carry no kinds (always prescribing).
- `AccountRecord.clinicIDs` (`types.ts:415`) lists the clinics an account belongs to — the source for non-doctor staff in the Employment view. The clinic directory hydrates into `state.clinicsByID`.
- The Invoice page (`src/app/app/billing/page.tsx`) gates every actionable surface on `isDoctor`; nurses get an empty page. The billing-matrix layer (checkout, client-sale/service-fee streams) is gated `matrixEnabled = !live` (`store.tsx:429`).
- Service-fee invoices exist only as checkout auto-drafts (`backend.ts` `checkoutClient` :2684-2718, finalized via `finalizeServiceFeeInvoice`). Party stamping is centralized in `invoicePartyFor` (`backend.ts:2292`), which reads the party's *current* active `BusinessEntity` and freezes it on the invoice — this is what makes super-admin entity edits flow into new invoices already.
- Business entity editing already exists on account rows (`BusinessEntityForm`, PR #142) via the `setBusinessEntity` callable — no new edit UI needed.

## Goals / Non-Goals

**Goals:**
- Prescribing/Employment split of the relationships section, preserving every existing edit affordance.
- Manual, handwritten-line service invoice from an employed practitioner to their clinic, with auto-stamped parties.
- A populated nurse Invoice page (client picker + clinic composer + streams).
- Regression tests locking in: entity edits → new invoices; dual-kind independence; identity-switch scoping.

**Non-Goals:**
- No backend (Firebase Functions) changes — manual service invoicing stays behind `matrixEnabled` (demo-only) until the backend repo ships a `createServiceInvoice` callable (follow-up, tracked in memory/billing-matrix).
- No change to the relationship data model, claims, or membership reconciliation.
- No inline client-invoice composer on the billing page — the client flow remains checkout on the patient file; the picker navigates there.
- No pagination/virtualization of admin lists.

## Decisions

1. **Views live where the section lives.** Keep relationships on `/app/admin` (nav already has five tabs); replace the single list with a `Prescribing | Employment` segmented switcher inside the section, defaulting to Prescribing. Extract the whole relationships block from `AdminConsole.tsx` into `src/components/admin/RelationshipsSection.tsx` — the console is 1050+ lines and this change grows it further; the extraction moves `CooperationRelationshipsSection`/`RelationshipRow`/`CreateRelationshipForm` intact.
2. **Grouping is derived, not stored.** Prescribing view: group relationships by doctor, keeping nurse counterparties plus clinic counterparties whose `effectiveRelationshipKinds` include `prescriber`. Employment view: group by clinic id — clinics come from the union of employee-kind relationships' counterparty ids and accounts' `clinicIDs` (resolved to names via `clinicsByID`, fallback label per cooperation-linking spec); under each clinic render employee-kind doctor `RelationshipRow`s (same component, same edits) plus informational member rows (name + role pill) for nurse/clinicAdmin accounts listing that clinic. Dual-kind rows are the same record in both views, so existing store updates propagate automatically.
3. **Manual service invoice is a new demo reducer, not a variant of checkout.** `createServiceInvoice(state, { practitionerID, practitionerKind, clinicID, lines })` in `backend.ts`: validates practitioner clinic membership, non-blank descriptions, positive integer cents; builds `Invoice` with `kind: "service-fee"`, `draft: false`, `counterpartyType: "clinic"`, `issuerRef: { kind: practitionerKind, id }`, lines carrying `description`/`qty: 1`/`unitCents` with `feeCents = amount`, `gstCents = round(amount * 0.1)` (GST-exclusive, same math as checkout service fees); parties frozen via `invoicePartyFor` at creation. Mirror the field conventions of the checkout-minted service-fee invoice exactly (including `doctorID` usage) so `invoicesFor` visibility, streams, and the PDF renderer work unchanged.
4. **Composer UI on the billing page.** New `ServiceInvoiceComposer` in `billing/page.tsx` (or sibling component file): visible when `store.matrixEnabled` and the signed-in practitioner (nurse or doctor) holds ≥1 clinic identity (`heldIdentities` — for doctors this is exactly the employee-kind grant); clinic select when >1; dynamic line rows (description + dollar amount), live subtotal/GST/total preview, per-line validation messages; issues via a new store action `createServiceInvoice` (demo reducer only).
5. **Nurse page composition.** For `role === "nurse"`: render "Invoice a client" (clients where the *current identity* can check out, via the isolation helpers; each row links to `/app/patients/[id]`), then the composer (eligibility above), then existing `MatrixStreams`; explicit empty-state copy when the client list is empty or when nothing at all is available (live mode today). Doctors keep their page and gain the composer at the bottom when employed.
6. **Tests over new behaviour + regressions.** Backend tests: `createServiceInvoice` happy path/validation/visibility/party stamping; entity edit then `generateInvoice` reflects new name+ABN while a pre-edit invoice is untouched; dual-kind relationship leaves `billingSummary` and `generateInvoice` outputs identical to a prescriber-only baseline. Component tests: relationships views filtering/grouping and cross-view reflection; composer validation + issue; nurse page population.

## Risks / Trade-offs

- **Field-convention drift on manual service invoices.** The PDF renderer and `invoicesFor` branch on invoice shape; a manual invoice that sets `doctorID`/`issuerRef` differently from checkout-minted ones would leak or vanish from streams. Mitigated by copying the checkout construction verbatim and asserting stream visibility in tests.
- **Employment view data completeness.** Non-doctor staff come from `AccountRecord.clinicIDs`, which in live mode requires the accounts inventory (superAdmin-only hydrate) — fine for the admin console, but a member account with stale claims may be missing; the view reflects claims, which is the source of truth.
- **Demo-only composer.** Owner may test in live mode and not see the composer; the follow-up (backend callable + lifting `matrixEnabled`) is called out in the PR description and memory to keep the gap visible.
- **Extraction churn.** Moving the relationships block to a new file inflates the diff; mitigated by moving it verbatim in a dedicated commit before behavioural edits.

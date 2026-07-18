# Design — Multi-Tenant Billing Matrix & Data Isolation

## Context

The app is a Next.js demo + live shell over a single in-memory reducer (`src/lib/demo/backend.ts`) with dual demo/live paths. Billing today is one-directional: a doctor invoices the requesting nurse or clinic per approved authorisation script (`generateInvoice`, `invoicing.ts`, `invoicePdf.ts`). Patients already carry a `PatientOwner` tagged union (`doctor` / `nurse` / `clinic`) but ownership is used for display, not as an access boundary. There is no checkout, no patient-facing invoice, no wallet, and the Invoice tab is doctor-only.

The verified tax-invoice template (ATO Example 2 layout: metadata top-right, stacked seller/TO blocks, bordered items grid, GST totals) is implemented once in `invoicePdf.ts` + the on-screen preview in `billing/page.tsx` and must be reused, not re-invented.

## Goals / Non-Goals

**Goals:**
- Hard, testable access boundaries on patient records keyed off `PatientOwner`.
- A checkout flow producing the correct invoice structure per scenario: independent B2C (Scenario A) and clinic-collaborative split billing (Scenario B: clinic→client retail + clinician→clinic service fee).
- A silo-scoped patient wallet with gift-credit top-ups, GST-compliant top-up invoices, and a differentiated ledger.
- Zero behavioral change to the existing authorisation invoice module.

**Non-Goals:**
- Real payment processing (the platform records money, never moves it).
- Firestore security rules / Cloud Functions (live in the separate backend repo). New features are **demo-mode-first**; live mode shows a friendly "not yet available in live mode" state. Hydration and existing live flows are untouched.
- Multi-clinic generalization beyond what the touched code requires (the demo still seeds one clinic, Lumière).

## Decisions

1. **Money stays in integer cents.** The request asks for `paid_amount` / `gift_amount` / `total_credit_added` "as separate floating-point numbers". The codebase convention is integer cents everywhere (`priceCents`, `subtotalCents`…), and floats introduce rounding bugs in money math. We store `paidCents`, `giftCents`, `totalCreditCents` as separate integer fields — same information, safe arithmetic. Display formatting stays on `formatAUD`.

2. **Invoice gains a `kind` discriminator, optional for backward compatibility.** `kind?: "authorisation" | "client-sale" | "service-fee" | "top-up"`; `undefined` ⇒ `"authorisation"` (all stored/legacy invoices). Read scoping (`invoicesFor`), summaries, and rendering switch on the resolved kind. New kinds carry `issuer`/`billTo` snapshots always (generation-time freeze, same pattern as live authorisation invoices), so party resolution never needs to be re-derived for client invoices.

3. **Client-facing parties are `InvoiceParty` without ABN.** The bill-to for B2C invoices is a patient (name + address, no business identity). `InvoiceParty` already makes every field optional except `businessName`; for clients we set `businessName` to the client's full name and `name` unset. The ABN row keeps its em-dash fallback only on seller blocks (ATO requirement is the *seller's* ABN).

4. **GST convention per stream.**
   - **B2C retail (client-sale lines, top-up paid amount): GST-inclusive.** The entered/priced amount is what the client actually pays; the GST component renders as `round(amount/11)` per line with subtotal = total − GST. This matches Australian retail convention and the template's mandatory "The total price includes GST" statement, and satisfies "compute GST (10%) based solely on the paid value" in the inclusive sense.
   - **B2B service fee (clinician→clinic): GST-exclusive + 10% added**, matching the existing doctor→counterparty `computeInvoice` behavior.
   A new pure helper `computeInclusiveTotals(lines)` sits beside `computeInvoice` in `invoicing.ts`.

5. **Gift credit is never a taxable line.** The top-up invoice itemizes exactly one taxable line (the paid amount). The gift renders as a non-taxable footnote row inside the grid: *"Promotional Gift Credit Applied: $X (Non-Taxable). Total Wallet Value Loaded: $Y."* — $0.00 in the GST/Amount columns is not printed; the row spans the description column and dashes the numeric columns so totals visibly exclude it.

6. **Access control is a single pure guard.** `patientAccessLevel(state, identity, patient): "none" | "collaborator" | "owner"` in a new `src/lib/demo/isolation.ts`:
   - doctor-owned → `"owner"` only for that doctor uid;
   - nurse-owned → `"owner"` only for that nurse uid;
   - clinic-owned → `"owner"` for users whose **active identity context is that clinic** (clinic admin, clinic nurses); `"collaborator"` for a doctor with an **active cooperation relationship** with that clinic;
   - platform admin (superAdmin) retains oversight via the existing admin routes (unchanged);
   - otherwise `"none"`.
   Patient list, patient detail, checkout, and wallet all consult this one function. Existing prescriber visibility for authorisation review (`prescribingDoctorIDs` / `openReviewerDoctorIDs`) is preserved as an additional read grant for the clinical flow — the isolation guard governs the *commercial* surfaces (manage/invoice/wallet) and the client book listing.

7. **Scenario routing at checkout is derived, never chosen.** The checkout reducer inspects `patient.owner` vs the operator identity:
   - operator is the owner silo (independent doctor/nurse checking out their own client) → **Scenario A**: one `client-sale` invoice, issuer = operator's own `BusinessEntity`, priced from the operator's price list.
   - patient is clinic-owned and operator has access (clinic context member or collaborating doctor) → **Scenario B**: one `client-sale` invoice (issuer = clinic entity, clinic retail price list) **plus** one auto-drafted `service-fee` invoice (issuer = operating practitioner's entity, billTo = clinic entity, amount = the practitioner's agreed session fee). The service-fee invoice is created with `draft: true`; the practitioner finalizes it from their billing page (queue-for-drafting per the requirement).
   - Scenario B checkouts performed by a clinic admin (not a practitioner) create no service-fee invoice.

8. **Fee schedules are per-silo price lists; service fees are per clinic×practitioner.** New state slices:
   - `priceListByOwner: Record<string, PriceListItem[]>` keyed `"doctor:<uid>" | "nurse:<uid>" | "clinic:<id>"`; items `{ id, kind: "service" | "product", name, priceCents }` (GST-inclusive retail). Seeded for Voss (independent), Sarah (independent), and Lumière (premium retail).
   - `serviceFeeCentsByPair: Record<string, number>` keyed `"<clinicID>_<practitionerUid>"` — the fixed labor fee (手工费), GST-exclusive. Seeded for the demo pairs; editable later, default constant when absent.
   This deliberately does not overload `CooperationRelationship` (that models the doctor→counterparty *authorisation* fee and stays untouched).

9. **Wallet is keyed by patient id; the silo is the patient's owner.** `walletByPatientID: Record<string, WalletEntry[]>` where `WalletEntry` is a tagged union: `{ kind: "topup", paidCents, giftCents, totalCreditCents, invoiceID, by, at }` | `{ kind: "drawdown", amountCents, invoiceID, by, at }`. Balance is derived (`walletBalanceCents`), never stored — no drift. A drawdown may never exceed the balance (reducer guard). Because a patient has exactly one owner, wallet access piggybacks on `patientAccessLevel` — the ledger is inherently silo-scoped.

10. **Checkout can pay from wallet.** The checkout panel offers "pay from account balance" when balance > 0; the reducer records a `drawdown` entry linked to the generated invoice and marks the invoice paid to the drawn extent (full drawdown ⇒ `paid: true`, `markedBy: "wallet"`). Partial payment stays out of scope (all-or-nothing wallet payment) to keep the demo honest.

11. **PDF/preview reuse via model, not forks.** `buildTaxInvoiceModel` is parameterized (`docTitle`, lines with qty, optional footnote rows, inclusive/exclusive totals). One renderer keeps the verified geometry: title top-left, DATE ISSUED + INVOICE NUMBER top-right, stacked blocks, bordered grid, right-aligned totals. `service-fee` PDFs title "TAX INVOICE" as well (they are tax invoices between businesses) with a "Service fee — <clinic> session" description line.

12. **Nav/visibility.** The Invoice tab opens to all clinical roles. The billing page becomes stream-aware: doctors see authorisation invoicing (unchanged) plus their client-sale/service-fee streams; nurses see their client-sale + service-fee streams; clinic admins see the clinic's client-sale stream and received service-fee invoices. `invoicesFor` extends: a party sees an invoice when they are the issuer silo or the bill-to counterparty (clinic members see clinic-issued and clinic-billed documents).

## Risks / Trade-offs

- [Tightening patient visibility could hide previously-visible demo patients] → the guard adds the existing prescriber/reviewer grants for clinical flows, and unit tests assert every seeded patient remains reachable by its intended personas.
- [Two GST conventions coexist (inclusive B2C, exclusive B2B)] → conventions are encapsulated in two pure helpers with table-driven tests; the invoice model stores computed cents so renderers never re-derive.
- [`Invoice` shape drift vs live Firestore mappers] → new fields are optional; `mapInvoice` defaults `kind` to authorisation; live mode gates new streams off, so no live document can carry the new kinds yet.
- [Nav change (Invoice tab for non-doctors) touches existing tests] → update `nav.ts` tests intentionally; the billing page still guards per-role streams.
- [Wallet drawdown + invoice generation must be atomic] → both happen in one reducer action on one state object (single `setState`), so demo mode cannot interleave.

## Open Questions

- Exact live-mode callable names are deferred to the backend repo change (this repo ships the demo model and a disabled live path).

# Multi-Tenant Billing Matrix & Data Isolation

## Why

Today the platform bills in exactly one direction: a doctor invoices the requesting nurse or clinic per approved authorisation script. But the real collaboration model is a matrix — doctors and nurses also act as **independent clinicians** with their own private client books, and they treat **clinic-owned** patients under a split-billing arrangement (clinic charges the client retail; the practitioner earns a fixed service fee from the clinic). None of that is billable in the product today, there is no patient-facing checkout, and there is no stored-value wallet — so clinics and independents run this on paper. This change builds the client-ownership isolation rules, the B2C/B2B invoicing matrix, and a silo-scoped patient wallet with promotional gift credit, without disturbing the existing doctor→counterparty authorisation invoice module.

## What Changes

- **Client data isolation**: enforce the `PatientOwner` silo as a hard access boundary. Doctor-owned and nurse-owned clients are visible/manageable/invoiceable only by their owner; clinic-owned clients are accessible to collaborating practitioners but the record and commercial relationship remain the clinic's.
- **Checkout (Scenario A — independent B2C)**: a doctor or nurse checking out one of their own clients generates a tax invoice with their personal business entity (trading name, ABN) as seller, the client as bill-to, priced from the clinician's own fee schedule. Covers products, services (treatments), and account top-ups.
- **Split billing (Scenario B — clinic collaborative B2C + B2B)**: checking out a clinic-owned client generates two documents in one action: (1) a clinic→client tax invoice at the clinic's retail price list, and (2) an auto-drafted clinician→clinic service-fee invoice (手工费) for the operating practitioner's fixed labor fee.
- **Patient wallet**: an `Account Balance` ledger per client, scoped strictly to the owning silo. Top-ups accept a **paid amount** plus a **gift credit** amount; the balance is credited with the total, but the tax invoice itemizes only the paid amount (GST on paid value only) with a non-taxable gift footnote. Ledger history distinguishes cash top-ups, gift credit, and drawdowns.
- **Invoice layout**: every new invoice type (B2C client invoice, clinic retail invoice, B2B service-fee invoice, top-up invoice) reuses the verified tax-invoice template — stacked seller/buyer blocks, INVOICE NUMBER + DATE ISSUED top-right aligned with the TAX INVOICE header, bordered itemized grid.
- **Non-breaking**: the existing doctor→nurse/clinic authorisation invoice flow (selective invoicing, delete/regenerate, party enrichment) continues unchanged alongside the new streams.

## Capabilities

### New Capabilities
- `client-data-isolation`: ownership-based access boundaries for patient records — who can view, manage, and invoice a client based on `PatientOwner` (doctor / nurse / clinic) and active collaboration.
- `client-checkout`: checkout of products, services, and top-ups against a client, with scenario routing (independent B2C vs clinic split billing), fee schedules/price lists, and dual-invoice generation for clinic-owned clients.
- `patient-wallet`: silo-scoped account balance ledger — top-ups with paid + gift amounts, GST-compliant top-up invoicing, drawdown at checkout, and a differentiated transaction history.

### Modified Capabilities
- `invoicing`: the structured tax-invoice layout requirement extends to all checkout-generated invoice documents (client tax invoices, clinic retail invoices, B2B service-fee invoices, top-up invoices), including the non-taxable gift-credit footnote line on top-up invoices.

## Impact

- **Domain model** (`src/lib/demo/types.ts`, `invoicing.ts`): new state slices for wallets/ledgers, checkout items and fee schedules; `Invoice` gains a kind/direction discriminator (authorisation vs client-sale vs service-fee vs top-up) while remaining backward compatible with stored invoices.
- **Reducers** (`src/lib/demo/backend.ts`): new pure reducers for checkout, top-up, and wallet drawdown; isolation guards on patient reads/writes; existing `generateInvoice`/`approveRequest` untouched in behavior.
- **UI** (`src/app/app/*`): checkout surface on the patient record, wallet/ledger tab, billing page gains the new invoice streams (visible to nurses/clinic admins for their own streams — the Invoice tab is no longer doctor-only), invoice preview/PDF reuse.
- **PDF** (`src/lib/demo/invoicePdf.ts`): parameterized for the new invoice kinds and the gift-credit footnote.
- **Read scoping** (`invoicesFor`, `billingSummary`, patient list filters): extended for the new invoice directions and hardened for ownership isolation.
- **Out of scope**: real payment processing (the platform still records, never moves, money) and Firestore security rules (live in the separate backend repo; this change ships the demo/in-memory model plus client-side scoping, following the established dual-path pattern).

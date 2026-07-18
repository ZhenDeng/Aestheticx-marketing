# Tasks — Multi-Tenant Billing Matrix & Data Isolation

## 1. Domain model & money helpers

- [x] 1.1 Add types: `PriceListItem`, `ServiceFee` pair map, `WalletEntry` union (`topup` with `paidCents`/`giftCents`/`totalCreditCents`, `drawdown`), checkout input types; extend `DemoState` with `priceListByOwner`, `serviceFeeCentsByPair`, `walletByPatientID` (types.ts)
- [x] 1.2 Extend `Invoice` with optional `kind` ("authorisation" | "client-sale" | "service-fee" | "top-up", undefined ⇒ authorisation), `draft?`, `checkoutID?`, `giftCents?`/`totalCreditCents?` for top-ups; add `resolveInvoiceKind` helper (invoicing.ts)
- [x] 1.3 Add GST-inclusive money helper `computeInclusiveTotals(lines)` (GST = round(total/11)) with table-driven unit tests alongside existing `computeInvoice` (invoicing.ts + tests)

## 2. Client data isolation

- [x] 2.1 Create `src/lib/demo/isolation.ts` with `patientAccessLevel(state, identity, patient)` ("none" | "collaborator" | "owner") per design decision 6, with unit tests covering all silo × identity combinations (incl. dual-identity Sarah)
- [x] 2.2 Apply the guard to the patients list and patient detail routes (commercial surfaces), preserving prescriber/reviewer clinical read grants; tests assert every seeded patient stays reachable by its intended personas and unreachable otherwise

## 3. Wallet ledger & top-ups

- [x] 3.1 Reducers: `topUpWallet` (validates non-negative, rejects zero-total, appends topup entry, generates linked `top-up` invoice with paid-only taxable line) and derived `walletBalanceCents`; unit tests incl. the $4,000+$1,000 scenario (backend.ts)
- [x] 3.2 Wallet UI: Account Balance card + top-up form (Paid Amount 实际支付, Gift Credit 赠送金额, live Total Credit Added 到账总额) on the patient detail page, gated by isolation guard
- [x] 3.3 Ledger history tab: differentiated rows (cash vs gift flag vs drawdown with invoice link), running balance; component tests

## 4. Checkout & invoicing matrix

- [x] 4.1 Seed price lists (Voss, Sarah independent, Lumière retail) and service-fee pairs; seed a wallet example (seed.ts)
- [x] 4.2 Reducer `checkoutClient`: scenario routing from `patient.owner` (design decision 7), Scenario A single `client-sale` invoice from own price list/entity; unit tests
- [x] 4.3 Scenario B in `checkoutClient`: atomic dual generation — clinic→client retail invoice + auto-drafted practitioner→clinic `service-fee` invoice (GST-exclusive + 10%), cross-linked via `checkoutID`; clinic-admin checkout emits no service-fee draft; `finalizeServiceFeeInvoice` reducer; unit tests
- [x] 4.4 Wallet payment at checkout: all-or-nothing drawdown linked to the invoice, marks invoice paid, never negative; unit tests
- [x] 4.5 Checkout UI panel on patient detail: item picker with quantities, GST-inclusive live totals, wallet-payment option, scenario-aware issuer display
- [x] 4.6 Store wiring: expose new actions/selectors via `store.tsx` (demo path; live path returns friendly not-available error)

## 5. Invoice rendering & billing page

- [x] 5.1 Parameterize `buildTaxInvoiceModel`/renderer for the new kinds: client bill-to without ABN row, service-fee B2B blocks, gift-credit non-taxable footnote row with dashed numeric columns; PDF unit tests (invoicePdf.ts)
- [x] 5.2 Extend `invoicesFor` + billing summaries for direction/kind scoping (issuer silo or bill-to counterparty); unit tests incl. doctor-stream-unchanged regression
- [x] 5.3 Billing page streams per role: doctor (authorisation unchanged + new streams), nurse (issued docs + draft finalize), clinic admin (issued client invoices + received service fees); on-screen previews reuse the bordered grid
- [x] 5.4 Open Invoice nav entry to nurses and clinic admins (nav.ts) and update nav tests

## 6. Verification

- [ ] 6.1 Full suite green: `npm test`, `tsc --noEmit`, `npm run lint`, `npm run build`
- [ ] 6.2 Regression pass on existing flows: authorisation invoicing tests, direction/68C tests, selective-invoicing UI tests all untouched-green

## 1. Nurse account init + ABN/Address (bugs 1–2)

- [ ] 1.1 Backend diagnosis: pin the exact createUser/rules gap that locks a fresh nurse (claims shape, users-doc fields, linkage) and record it in design.md "Diagnosis outcome"
- [ ] 1.2 Backend repo: fix `createUser` to fully initialise the created role (incl. persisting `abn` + `address`); adjust rules only if required; backend tests green
- [ ] 1.3 Web: add Address field to `CreateUserForm`; send `address` in `mirrorCreateUser`; validation unchanged for optional field
- [ ] 1.4 Web: categorised sync errors — `applyAndMirror` stores `{category: "permission"|"sync"}`; `AppShell` renders permission-specific copy; unit test the categoriser
- [ ] 1.5 Tests: creation payload carries abn+address (userAdmin/mirror mapping test)

## 2. Calendar ↔ Dashboard sync + safe cancel (bug 3)

- [ ] 2.1 TDD: `subscribeAppointments` scope/merge logic (pure merge fn unit-tested), new `src/lib/firebase/appointmentsLive.ts`
- [ ] 2.2 Wire the listener in `store.tsx` after hydrate (own catch, unsubscribe on teardown), scopes from held identities
- [ ] 2.3 TDD: cancelled/completed authSlot leaves `upcomingAuthCalls` (unit test exists? add if missing)
- [ ] 2.4 Calendar: inline confirm step on Cancel (confirming state → Confirm cancellation / Keep); test via component logic or reducer-level guard
- [ ] 2.5 Dashboard: "Mark completed" button per upcoming-call row (owner-gated, error inline); unit test `markAppointment` completed path from dashboard context

## 3. Merged premises card (enhancement 1)

- [ ] 3.1 TDD: selecting a premise from Profile persists `selectedPremiseId` (reuse `premisesAfterSelect`)
- [ ] 3.2 Profile: `PremisesSection` selection-first redesign (active premise header, click-to-open list, radio select, Add at bottom, Edit/Delete per row)
- [ ] 3.3 Profile: hide free-text Address block for nurse-role accounts; keep for others; adjust `ProfileFieldsEditor` props/tests

## 4. Selective invoicing + delete/regenerate (enhancement 2)

- [ ] 4.1 TDD: selection→authIDs expansion helper (scripts → member item ids) in `invoicing.ts`
- [ ] 4.2 `GeneratePanel`: checkbox list per script, live preview totals from selection, Generate disabled at zero
- [ ] 4.3 TDD then implement `deleteInvoice` reducer in `backend.ts` (doctor-only, pool return, audit entry)
- [ ] 4.4 Store + mirror: `deleteInvoice` store method with live callable + optimistic apply; billing UI Delete with inline confirm
- [ ] 4.5 Backend repo: `deleteInvoice` callable (transaction: delete invoice doc + clear `invoiced` on members + audit); tests
- [ ] 4.6 Tests: delete→regenerate round-trip (pool returns, second generate covers returned scripts)

## 5. Structured invoice layout (enhancement 3)

- [ ] 5.1 TDD: `DirectionWriter` gains `hline`/`rect`/`textAt` (ops emitted, y-advance semantics); direction PDF output unchanged
- [ ] 5.2 Rewrite `renderTaxInvoicePdf` as bordered table + framed totals + ATO elements; page-break with repeated header
- [ ] 5.3 Billing generate preview: mini table matching PDF columns
- [ ] 5.4 Tests: PDF contains table ops + all ATO strings; snapshot-ish assertions on column content

## 6. Verification

- [ ] 6.1 Full web suite green (`npm run build` + `vitest run`); backend repo suite green
- [ ] 6.2 Browser QA pass: create-account fields, cancel-confirm flow, dashboard complete, premises switch from profile, selective generate, delete+regenerate, PDF download

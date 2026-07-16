## 1. Nurse account init + ABN/Address (bugs 1–2)

- [x] 1.1 Backend diagnosis: pin the exact createUser/rules gap that locks a fresh nurse (claims shape, users-doc fields, linkage) and record it in design.md "Diagnosis outcome"
- [x] 1.2 Backend repo: `completeFirstLogin` derives claims from server-side truth (getUser + users-doc fallback); `createUser` persists `address` + optional `supervisingDoctorId` → cooperation relationship; new `syncUserClaims` repair callable; backend tests green
- [x] 1.3 Web: add Address field + supervising-doctor select to `CreateUserForm`; send both in `mirrorCreateUser`
- [x] 1.4 Web: categorised sync errors — `applyAndMirror` stores category (permission vs sync); `AppShell` renders category copy; one-shot token force-refresh on permission failure; unit test the categoriser
- [x] 1.5 Web: admin console "Repair access" action per account (live) calling `syncUserClaims`

## 2. Calendar ↔ Dashboard sync + safe cancel (bug 3)

- [x] 2.1 TDD: `subscribeAppointments` scope/merge logic (pure merge fn unit-tested), new `src/lib/firebase/appointmentsLive.ts`
- [x] 2.2 Wire the listener in `store.tsx` after hydrate (own catch, unsubscribe on teardown), scopes from held identities
- [x] 2.3 TDD: cancelled/completed authSlot leaves `upcomingAuthCalls` (unit test exists? add if missing)
- [x] 2.4 Calendar: inline confirm step on Cancel (confirming state → Confirm cancellation / Keep); test via component logic or reducer-level guard
- [x] 2.5 Dashboard: "Mark completed" button per upcoming-call row (owner-gated, error inline); unit test `markAppointment` completed path from dashboard context

## 3. Merged premises card (enhancement 1)

- [x] 3.1 TDD: selecting a premise from Profile persists `selectedPremiseId` (reuse `premisesAfterSelect`)
- [x] 3.2 Profile: `PremisesSection` selection-first redesign (active premise header, click-to-open list, radio select, Add at bottom, Edit/Delete per row)
- [x] 3.3 Profile: hide free-text Address block for nurse-role accounts; keep for others; adjust `ProfileFieldsEditor` props/tests

## 4. Selective invoicing + delete/regenerate (enhancement 2)

- [x] 4.1 TDD: selection→authIDs expansion helper (scripts → member item ids) in `invoicing.ts`
- [x] 4.2 `GeneratePanel`: checkbox list per script, live preview totals from selection, Generate disabled at zero
- [x] 4.3 TDD then implement `deleteInvoice` reducer in `backend.ts` (doctor-only, pool return, audit entry)
- [x] 4.4 Store + mirror: `deleteInvoice` store method with live callable + optimistic apply; billing UI Delete with inline confirm
- [x] 4.5 Backend repo: `deleteInvoice` callable (transaction: delete invoice doc + clear `invoiced` on members + audit); tests
- [x] 4.6 Tests: delete→regenerate round-trip (pool returns, second generate covers returned scripts)

## 5. Structured invoice layout (enhancement 3)

- [x] 5.1 TDD: `DirectionWriter` gains `hline`/`rect`/`textAt` (ops emitted, y-advance semantics); direction PDF output unchanged
- [x] 5.2 Rewrite `renderTaxInvoicePdf` as bordered table + framed totals + ATO elements; page-break with repeated header
- [x] 5.3 Billing generate preview: mini table matching PDF columns
- [x] 5.4 Tests: PDF contains table ops + all ATO strings; snapshot-ish assertions on column content

## 6. Verification

- [x] 6.1 Full web suite green (`npm run build` + `vitest run`); backend repo suite green
- [x] 6.2 Browser QA pass: create-account fields, cancel-confirm flow, dashboard complete, premises switch from profile, selective generate, delete+regenerate, PDF download

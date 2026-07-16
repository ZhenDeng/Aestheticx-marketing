## Why

16/07 owner feedback bundles three high-priority production bugs and three UX/feature gaps across the Admin, Doctor and Nurse modules:

1. A newly created nurse account (e.g. Yinghua Xu) is unusable — every action trips the persistent "could not be saved to the server" banner and refresh doesn't clear it.
2. ABN and Address entered by the Super Admin at account creation never appear in the user's Profile.
3. Cancelling an authorisation appointment in the Calendar can leave the "Upcoming authorisation calls" indicator on the Dashboard; cancel itself is a one-tap action with no warning, so accidental cancellations happen; and there is no way to mark a call completed from the dashboard.
4. Profile shows a free-text Address block *and* a separate Premises-of-administration manager, while the active-premise switcher lives only on the dashboard — three surfaces for one concept.
5. Invoice generation always bills every un-invoiced authorisation for the counterparty-month; a doctor cannot exclude a freebie, and a generated invoice can never be deleted or regenerated to fix an error.
6. The tax-invoice PDF prints line items as loose stacked text — no table, no borders — which reads as unprofessional to clients.

## What Changes

- **Nurse account provisioning (bug 1)** — fix the account-creation/linkage path so a freshly created nurse (with a cooperation relationship under a supervising doctor) can use every designated feature immediately after first login. Root-cause fix lands in the backend repo (`createUser` callable / Firestore rules); the web app additionally surfaces the *actual* sync-failure reason instead of one hardcoded banner string, so a permission failure is distinguishable from a network blip.
- **ABN + Address at creation (bug 2)** — the admin create form gains an explicit Address field; the payload maps `abn` and `address` onto the new user's profile document so both render in Profile immediately. (Backend repo: `createUser` persists both fields.)
- **Calendar ↔ Dashboard sync + safe cancel (bug 3)** —
  - live appointments become a real-time subscription (same pattern as the existing auth-requests listener), so a cancel/change from any client updates the dashboard list without refresh;
  - every calendar cancel asks for confirmation before executing;
  - each dashboard "Upcoming authorisation calls" row gains a doctor-only **Mark completed** action.
- **Unified premises & address (enhancement 1)** — for nurse-role users the Profile's Address block and the Premises manager merge into one "Premises of administration" card: the card leads with the *currently selected* place of practice, clicking it opens the premise list to switch, and Add/Edit/Delete actions sit at the bottom of the list.
- **Selective invoicing + delete/regenerate (enhancement 2)** — the generate panel lists each un-invoiced authorisation (script) with a checkbox (default all selected) so the doctor can exclude specific patients; invoices gain a **Delete** action (confirmation required) that returns member authorisations to the un-invoiced pool so a corrected invoice can be regenerated. (Backend repo: new `deleteInvoice` callable; `generateInvoice` already accepts an explicit id subset.)
- **Structured invoice layout (enhancement 3)** — the tax-invoice PDF is re-architected as a bordered table (Description | Qty | Unit | GST | Total columns, ruled header and rows, framed totals block) while keeping every ATO Example-2 requirement; the PDF writer gains minimal line/rect drawing ops.

## Capabilities

### New Capabilities
- `account-provisioning`: admin-created accounts are fully initialised (roles, links, profile fields) and immediately usable.
- `appointment-sync`: dashboard and calendar always agree; destructive appointment actions confirm first; calls can be completed from the dashboard.
- `profile-premises`: one merged premises/address surface in Profile.
- `invoicing`: selective line items, delete/regenerate, structured tax-invoice layout.

### Modified Capabilities
<!-- Fresh openspec init in this repo — no baseline specs to modify. -->

## Impact

- **Web (this repo)**: `src/components/admin/AdminConsole.tsx` (create form), `src/components/app/AppShell.tsx` (banner copy), `src/lib/demo/store.tsx` (+ appointments listener wiring, deleteInvoice), new `src/lib/firebase/appointmentsLive.ts`, `src/lib/firebase/mirror.ts` (+ address on createUser, deleteInvoice callable), `src/app/app/calendar/page.tsx` (confirm step), `src/app/app/dashboard/page.tsx` (mark completed), `src/app/app/profile/page.tsx` (merged premises card), `src/app/app/billing/page.tsx` (checkbox selection, delete), `src/lib/demo/backend.ts` (deleteInvoice reducer), `src/lib/demo/invoicePdf.ts` + `directionPdf.ts` (table layout), demo seed unchanged.
- **Backend repo (`AestheticX/backend`)**: `createUser` persists `abn`/`address` and completes nurse initialisation; new `deleteInvoice` callable un-invoices member authorisations atomically; Firestore rules adjusted only if the nurse-init root cause requires it.
- **Tests**: vitest units for every new reducer/pure function (selection expansion, delete/regenerate pool return, upcoming-calls exclusion of cancelled, premise-switch from profile, PDF table ops); existing suite stays green.
- **No breaking changes.** Demo mode keeps working seed-identical; live mode gains listeners + callables additively.

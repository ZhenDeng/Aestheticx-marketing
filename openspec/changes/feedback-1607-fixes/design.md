# Design — 16/07 feedback fixes

## D1. Nurse-account init bug (root-cause split web/backend)

Observed mechanism (web side): every failed live mirror lands in `applyAndMirror`'s catch (`src/lib/demo/store.tsx:249-255`), which shows the `AppShell` banner and forces a rehydrate. The banner text is **hardcoded** ("A change could not be saved to the server, it will reconcile on refresh" — `src/components/app/AppShell.tsx:65-69`), so *any* recurring rejection — most plausibly Firestore rules rejecting the fresh nurse's writes because server-side initialisation is incomplete — reads as the same stuck toast, and refresh can't fix it because the root record is wrong, not stale.

Fix lands in two parts:
- **Backend repo**: make `createUser` initialise everything the rules require for the created role (claims/roles shape, users-doc fields, linkage docs) — exact fields per the backend diagnosis (see tasks 1.x). *(Filled in after diagnosis: see “Diagnosis outcome” below.)*
- **Web repo**: categorise the sync failure. `applyAndMirror` inspects the error (`permission-denied` / `unauthenticated` vs other) and stores a category; `AppShell` renders a permission-specific message ("Your account isn't allowed to make this change — contact your administrator" + code) instead of the misleading reconcile-on-refresh copy. This turns a silent lockout into a diagnosable state.

## D2. Live appointments listener

Mirror of `subscribeAuthRequests` (`src/lib/firebase/requestsLive.ts`): new `src/lib/firebase/appointmentsLive.ts` exporting `subscribeAppointments({ scopes }, { onAppointments, onScopeError })`, with one `onSnapshot` per readable scope reusing exactly the hydrate queries (`where("ownerId","==",scope)` and `where("bookedById","==",scope)` — `src/lib/firebase/hydrate.ts:364-369`). Results merge by doc id across scopes; the union replaces `state.appointments` the same way the requests listener replaces `state.requests`. Wired in the same store effect after hydrate, with its own catch so listener failure degrades to the one-shot snapshot. Scopes = each held identity's `appointmentOwnerScope` (user id; clinic id for clinic contexts), deduplicated. No rules change needed — hydrate already runs these exact queries.

## D3. Cancel confirmation

The codebase's established confirmation idiom is the inline two-step (`confirming` state → "Confirm / Keep" pair), used for account/patient/relationship deletes. Calendar cancel adopts the same: first tap flips the Cancel button into an explicit "Cancel appointment? Confirm / Keep" pair inside the appointment detail's actions row. No new modal primitive — consistent with the app's existing pattern, and keyboard/scrim behaviour of the detail dialog is preserved.

## D4. Dashboard "Mark completed"

`UpcomingAuthCalls` rows gain a right-aligned "Mark completed" button (doctor is always the owner of an authSlot; `markAppointment(id,"completed")` is already owner-gated in `backend.ts:1011-1023`). Uses the same inline confirm-less action as calendar Complete (non-destructive, reversible by re-book; errors surface inline).

## D5. Merged premises card (Profile)

For `holdsNurseRole` accounts:
- `ProfileFieldsEditor` hides its free-text Address block (non-nurse accounts keep it).
- `PremisesSection` becomes selection-first: a header block showing the ACTIVE premise (name + address, chevron affordance); clicking toggles the premise list open; each row is a radio-style select (same `premisesAfterSelect` the dashboard switcher uses — selecting persists `selectedPremiseId`).
- Row Edit/Delete stay per-row but visually secondary; **Add premise moves to the bottom** of the list (per ticket "action layout: bottom").
- The dashboard `PremiseSwitcher` stays (it is the working-context switcher); it now shares selection state with Profile by construction (same profile field).

## D6. Selective invoicing

`GeneratePanel` keeps script-grain rows (`scriptsFromBillable`) and adds `selected: Set<requestID>` state initialised to all. Checkbox list renders date — patient per script. `generate()` passes only member item ids of selected scripts (`scripts.filter(sel).flatMap(s => s.authIDs)`); the demo reducer's whole-script expansion (`backend.ts:2293`) keeps the request grain safe, and the live callable already accepts an explicit `authorisationIDs` subset. Preview totals compute from the selection. Generate disabled at zero selection.

## D7. Delete / regenerate invoices

New pure reducer `deleteInvoice(state, invoiceID, identity, now)` in `backend.ts`: doctor-only (issuer), removes the invoice from `state.invoices`, clears `invoiced` on every id in `invoice.authorisationIDs`, appends an `invoice_deleted` audit entry. Store method mirrors via new `deleteInvoice` callable (backend repo; invoice docs are Function-only) then relies on optimistic apply + rehydrate-on-error like `markInvoicePaid`. UI: a Delete button per invoice row using the inline confirming idiom; deleting a PAID invoice is allowed (corrections happen after settlement too) — the audit entry records prior paid state. "Regenerate" is the normal generate flow re-run over the returned pool (no bespoke clone action; the panel reopens with the returned scripts pre-selected).

## D8. Tax-invoice table layout

`DirectionWriter` (shared hand-rolled PDF writer) gains graphics ops alongside its text ops:
- `hline(x1, x2)` — stroke a horizontal rule at the current y;
- `rect(x, y, w, h)` — stroke a rectangle (borders/frames);
- `textAt(value, size, color, x, { width, align })` — absolutely positioned cell text with right-align support, not advancing `y` (caller advances per row).

`renderTaxInvoicePdf` re-architected: header block (TAX INVOICE, seller, ABN, bill-to, date, number) as today; then a full-width bordered table — header row (DESCRIPTION | QTY | UNIT | GST | TOTAL) on a tinted rule, one ruled row per line item with wrapped description constrained to its column, vertical column separators, outer frame; then a right-aligned totals block (Subtotal / GST 10% / TOTAL AMOUNT PAYABLE) framed, and the ATO statement line. Page-break: if the table body would overflow, break page and repeat the header row. Direction PDF (clause 68C) output stays byte-stable — new ops are additive.

Web billing page: invoice rows keep the list layout; the *generate preview* gains a mini table (columns mirroring the PDF) replacing the single-line totals text, so on-screen matches paper.

## Diagnosis outcome (filled after backend exploration)

_To be completed by tasks 1.1–1.2: exact createUser/rules deltas recorded here before backend implementation starts._

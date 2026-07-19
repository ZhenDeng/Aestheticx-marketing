# Design — platform-admin-feedback-1907

## Context

Two 19/07 platform-admin feedback items:

1. The Admin page (`/app/admin`, `AdminConsole.tsx`) stacks accounts, cooperation relationships, product catalog, and business entities on one page; the product catalog should be its own tab.
2. Clinic ↔ doctor linking (change `clinic-account-access-and-linking`, web #136 + backend #110) always grants the doctor an **employee** clinic membership (`users/{uid}.clinics` map → claims → "Practise as" identity). The owner wants two kinds at creation: *employee* (works at the clinic) vs *prescriber* (external doctor who authorises for the clinic, no membership).

Current plumbing (web): demo reducer `backend.setCooperationRelationship` → store `applyAndMirror`-style eager apply + `mirrorSetCooperationRelationship` callable in live; hydration decodes docs via `mapCooperationRelationship`; demo clinic identities are derived in `identity.ts` from active clinic relationships. Backend: `setCooperationRelationshipTx` persists the doc and `readClinicMembership`/`writeClinicMembership` grant/revoke the membership row + `users.clinics` claims inside the same transaction, then `syncClaimsFromUserProfile` converges Auth claims.

## Goals / Non-Goals

**Goals:**
- Products tab at `/app/admin/products` for super admins; Admin page drops the catalog section.
- `relationshipKind: 'employee' | 'prescriber'` on doctor↔clinic relationships, end-to-end (create form → demo reducer → callable → Firestore doc → hydration → row display), with membership sync keyed off it.
- Absent kind ⇒ `employee` everywhere (no migration; deploy-order safe).

**Non-Goals:**
- No change to the catalog editor's behaviour, product schema, or callables.
- No kind for nurse relationships; no new membership roles (the membership row keeps role `employee` for kind employee).
- No editing of kind via a dedicated control beyond the row's existing patch mechanism (a kind toggle on the row is included, matching the other row toggles).
- No iOS work (separate app; wire format is backwards-compatible).

## Decisions

1. **Default absent kind to `employee`** (decoder + backend). Every existing clinic relationship was created under grant-membership semantics; defaulting to `prescriber` would silently revoke live doctors' clinic identities on next edit. Backend deploys first: old web + new backend sends no kind ⇒ employee ⇒ today's behaviour. New web + old backend would drop the field and always grant membership — wrong for prescriber — hence the deploy order note in the proposal (same pattern as web #136/backend #110).
2. **Kind lives on the relationship doc, not a second collection.** It is an attribute of the same doctor↔clinic edge; the deterministic `cooperationDocId` upsert, audit trail, and remove path all stay single-doc. Alternative (separate "employments" collection) rejected: duplicates the gate and doubles the claim-sync surface.
3. **Membership reconciliation reuses the existing grant/revoke paths.** `writeClinicMembership` already handles grant (status active) and provenance-aware revoke (status inactive). Kind folds in as: grant iff `status === 'active' && kind === 'employee'`; otherwise run the revoke branch (which only touches memberships whose provenance is this relationship). `employee → prescriber` on an active relationship therefore behaves exactly like deactivation did for membership, and `prescriber → employee` like activation. `syncClaimsFromUserProfile` is unchanged and still runs for every clinic-counterparty call.
4. **Web types make the kind optional (`relationshipKind?: RelationshipKind`)** and treat `undefined` as employee for clinic rows at display/derivation sites via a tiny helper `effectiveRelationshipKind(rel)` in `types.ts` (returns `null` for nurse counterparties). Keeps nurse rows kind-free without a union explosion.
5. **Demo parity**: the demo reducer validates kind (clinic-only, employee|prescriber) and stores it; `identity.ts` grants the demo employee clinic identity only when the effective kind is employee. Audit summary strings include the kind for clinic relationships so history reads "created · employee · active · …".
6. **Products tab**: `ADMIN_NAV` gains `{ href: "/app/admin/products", label: "Products" }` after Admin. `ProductCatalogSection` (with `ProductRow`/`AddProductForm`) moves to `src/components/admin/ProductCatalog.tsx` (exported), imported by a new `src/app/app/admin/products/page.tsx` that mirrors the Admin page's guard (`identity.role === "superAdmin"`, loading state, header). `AdminConsole` stops rendering the section. Longest-prefix `activeNavHref` already highlights the more specific tab.

## Risks / Trade-offs

- [New web against old backend would grant membership for prescriber links] → Deploy backend Functions first; called out in proposal + PR body. Until then the web UI is also not deployed.
- [Kind toggle on an active employee relationship revokes a doctor's clinic identity immediately] → That is the intended admin action; the row shows the kind and the audit entry records it. Independently granted memberships are protected by the existing provenance check.
- [Docs written by the backfill (`backfillCooperationRelationships`) have no kind] → Decoder default (employee) matches the membership those backfills already reconciled.
- [`relationshipKind` sent for nurse counterparties by a buggy client] → Backend rejects with `invalid-argument` (spec scenario), demo reducer throws `validationFailed`.

## Migration Plan

1. Backend PR (branch off `~/Documents/AestheticX` main): callable + membership sync + tests. Deploy Functions (australia-southeast1).
2. Web PR (this repo): nav/tab extraction + kind end-to-end. Vercel auto-deploys on merge to main.
3. No data migration; rollback is reverting the web deploy (backend change is backwards-compatible with old web).

## Open Questions

- None blocking. (Membership row role stays `employee`; if the owner later wants a distinct visible "prescriber" badge on the doctor's profile, that is a separate change — prescriber links deliberately produce no profile surface.)

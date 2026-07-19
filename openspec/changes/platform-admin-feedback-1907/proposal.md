# platform-admin-feedback-1907

## Why

19/07 platform-admin feedback: the Admin tab has grown into one long page (accounts, cooperation relationships, product catalog, business entities), and the product catalog — a distinct, frequently-visited module — is buried at the bottom. Separately, linking a doctor to a clinic today always makes the doctor an *employee* of that clinic (clinic membership + clinic identity), but in reality a doctor may instead be an external *prescriber* who authorises for the clinic without working there; the admin needs to choose which kind of relationship they are creating.

## What Changes

- The product catalog editor moves out of the Admin tab into its own top-level **Products** nav tab for platform admins (`/app/admin/products`). The Admin page no longer renders the catalog section; behaviour of the editor itself (list, add, activate/deactivate) is unchanged.
- Doctor ↔ clinic cooperation relationships gain a **relationship kind**: `employee` or `prescriber`, chosen in the create form (clinic counterparties only) and shown on relationship rows.
  - `employee`: current behaviour — an active relationship grants the doctor an employee membership of the clinic (claims + "Practise as" identity), revoked with the relationship.
  - `prescriber`: the relationship gates authorisation requests and carries pricing/invoicing exactly as today, but grants **no** clinic membership or identity.
  - Editing a relationship's kind reconciles membership accordingly (employee→prescriber revokes only a relationship-granted membership; prescriber→employee grants one).
  - Existing stored relationships (no kind field) keep behaving as `employee` — no migration, no claim churn on deploy.
- Backend `setCooperationRelationship` callable accepts and persists `relationshipKind`, and the clinic-membership synchronisation keys off it. Deploy order: backend first (old web + new backend ⇒ kind absent ⇒ employee, today's behaviour).
- Doctor ↔ nurse relationships are unaffected (no kind).

## Capabilities

### New Capabilities

- `admin-product-catalog-tab`: the platform-admin Products tab — where the product catalog editor lives in the admin navigation.

### Modified Capabilities

- `cooperation-linking`: doctor ↔ clinic relationships carry a kind (employee | prescriber); membership/identity grant becomes conditional on kind `employee` instead of applying to every active clinic relationship.

## Impact

- **Web (this repo)**: `src/lib/demo/nav.ts` (new Products tab), new `src/app/app/admin/products/page.tsx`, `src/components/admin/AdminConsole.tsx` (extract ProductCatalogSection, kind picker in create form, kind on rows/patch), `src/lib/demo/types.ts`, `src/lib/demo/backend.ts` (demo reducer + validation + audit summary), `src/lib/demo/identity.ts` (demo employee-identity grant gated on kind), `src/lib/firebase/mappers.ts` (decode kind, default employee), `src/lib/firebase/mirror.ts` (send kind), admin console tests + nav test.
- **Backend (`~/Documents/AestheticX`, branch + PR)**: `backend/functions/src/cooperation.ts` (`SetRelationshipParams.relationshipKind`, persist on doc, `readClinicMembership`/`writeClinicMembership` gate on kind, audit summary), integration tests. `claims.ts` untouched (claims still derive from `users/{uid}.clinics`, which the relationship writer now only populates for employee kind).
- **Deploy order**: backend Functions deploy before the web deploy.

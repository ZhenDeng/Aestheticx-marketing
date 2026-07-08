# Cooperation Relationships — Design

**Goal:** Implement the constitution's §17 Cooperation Relationships in full: a doctor ↔ (nurse|clinic)
relationship that **gates** which doctors a nurse/clinic can request authorisation from, carries the
**pricing override** and **invoice-applies** flag (folding the separate `scriptPricing`), is **managed
by Platform Admin**, is **audited**, and is **backfilled** from existing data so no live workflow breaks.

Cross-repo (web `Aestheticx-marketing` + backend `~/Documents/AestheticX`), same demo-first + companion-
backend pattern used for emergency authorisations.

**Source of truth:** `core-architecture.docx` §17 (+ §11 doctor selection, §14 invoicing). The relationship
"defines: Doctor, Nurse-or-clinic, Status, Pricing override if any, whether authorisation requests are
allowed, whether invoice generation applies" and "history should be auditable." This capability does not
exist on iOS/web/backend today — net-new.

## Decisions (owner-confirmed 2026-07-08)
1. **Admin-only creation** (§17). Self-serve request/accept is explicitly **out of scope** (conflicts with
   the confirmed admin-managed model; a distinct feature — offered as a later follow-up).
2. **Backfill** initial *active* relationships from existing `authRequests` + patients'
   `prescribingDoctorIds` so currently-working pairs keep working; only new pairings need admin action.
3. **Gate at the data layer** — one eligibility source feeds every doctor picker.
4. **Full relationship shape now** (pricing override + invoice-applies folded in; owner asked to finish the
   deferred increments) + a **relationship-change audit log**.
5. **Seed demo relationships** (Sarah/Ruby ↔ Voss, clinic-lumiere ↔ Voss).

## Model

### Relationship
```ts
type CounterpartyType = "nurse" | "clinic";
type RelationshipStatus = "active" | "inactive";
interface CooperationRelationship {
  id: string;                 // `${doctorID}_${counterpartyType}_${counterpartyID}` (deterministic)
  doctorID: string;
  doctorName: string;         // denormalised for display
  counterpartyType: CounterpartyType;
  counterpartyID: string;     // nurse uid or clinic id
  counterpartyName: string;   // denormalised
  status: RelationshipStatus;
  authRequestsAllowed: boolean; // §17 "whether authorisation requests are allowed"
  invoiceApplies: boolean;      // §17 "whether invoice generation applies"
  priceCentsOverride: number | null; // §17 pricing override; null ⇒ DEFAULT_SCRIPT_PRICE_CENTS (2500)
  createdAt: number;
  updatedAt: number;
}
```
`DemoState` gains `cooperationRelationshipsByID: Record<string, CooperationRelationship>`; backend collection
`cooperationRelationships` (Function-only writes). **Gate predicate:** `status === "active" && authRequestsAllowed`.

The counterparty convention matches billing (`billableAuthorisations`: `a.clinicID ?? a.nurseID`, type
clinic-if-clinicID-else-nurse) so relationships key on the same `(doctor, counterparty)` pairs the invoice does.

### Audit
```ts
type RelationshipAction = "created" | "updated" | "removed";
interface RelationshipAuditEntry {
  id: string;
  relationshipID: string;
  actorID: string;   // the acting superAdmin
  actorName: string;
  action: RelationshipAction;
  summary: string;   // human-readable "activated · price $30 · invoicing on"
  at: number;
}
```
`DemoState` gains `relationshipAuditByID`; backend collection `relationshipAudit` (superAdmin-read, Function-write).

## The gate (core)
Pure `cooperatingDoctors(state, identity): { doctorId, doctorName }[]` — the active, request-allowed
relationships whose counterparty is the acting subject (`ownerFor(identity)`), sorted by name. This becomes the
**single eligibility source**:
- `request/page.tsx` doctor picker: switch `store.listDoctors()` → `store.cooperatingDoctors(identity)`, and the
  `.catch` demo fallback likewise (must not bypass the gate).
- `availability/page.tsx` BookConsult: `store.listAvailableDoctors()` intersect with `cooperatingDoctors`
  (a doctor must be BOTH available AND cooperating).
- The old all-doctors `store.listDoctors()` is retained **only** for the admin console (to create relationships).

**Empty-state safety:** a nurse/clinic with zero cooperating doctors sees *"No cooperating doctors yet — ask your
platform admin to add one"* rather than a silently-empty picker.

**Live:** a new `listCooperatingDoctors` callable (Admin SDK) returns the caller-subject's active doctors; demo
filters `state.cooperationRelationshipsByID`. Both surfaces route through the store so demo/live parity holds.

## Platform-Admin management
The superAdmin console (`/app/profile` `AdminConsole` / `LiveAdminConsole`) gains a **"Cooperation relationships"**
section after Accounts: list existing (grouped by doctor, showing counterparty, status, price, invoicing), **create**
(pick doctor from the full `listDoctors` + pick a nurse/clinic → active), **edit** (toggle status /
authRequestsAllowed / invoiceApplies, set price), **remove** (→ status inactive, preserved for history). Every
mutation records an audit entry and shows the relationship's audit history inline (collapsible).

Unlike user-creation (live-only), relationships are **demo-writable** (so the demo exercises the full flow); live
routes through callables.

## Pricing fold + invoice-applies
Fold the existing per-pair `scriptPricing` into the relationship's `priceCentsOverride`:
- **Price resolution** — a shared helper `priceForCounterparty(state, doctorID, counterpartyID)` resolves
  `relationship.priceCentsOverride ?? scriptPricing[key] ?? DEFAULT`. Applied at the 3 sites: `store.tsx` `scriptPrice`,
  `backend.ts` `generateInvoice`, `billing/page.tsx` preview. (`scriptPricing` stays as a fallback so nothing breaks
  before backfill migrates it; backfill copies existing `scriptPricing` values into `priceCentsOverride`.)
- **invoice-applies** — `billableAuthorisations` excludes authorisations whose `(doctor, counterparty)` relationship
  has `invoiceApplies === false`. Default true (no behaviour change for existing pairs).
- The billing UI's "set price" continues to work, now writing the relationship's `priceCentsOverride` (live: a
  callable; demo: state) — `scriptPricing` becomes legacy/read-fallback only.

## Backfill
Pure `deriveCooperationRelationships(requests, patients, scriptPricing)` → deterministic-id relationship set:
each `authRequests` doc → `(doctorId, billingCounterparty(request))`; each patient → `(prescribingDoctorId,
ownerType, ownerId)` for nurse/clinic owners; each `scriptPricing` doc → seeds `priceCentsOverride`. All **active**,
`authRequestsAllowed:true`, `invoiceApplies:true`. Idempotent (upsert on the deterministic id).
- **Live:** a superAdmin-gated `backfillCooperationRelationships` callable (run once, safe to re-run) via an
  extracted `backfillCooperationRelationshipsTx(db)` core (emulator-tested).
- **Demo:** seeded directly in `buildSeedState()`.

## Layers

### Backend (AestheticX)
- `domain.ts`: `CooperationRelationshipDoc`, `cooperationDocId`, `relationshipGatePasses`, and the pure
  `deriveCooperationRelationships(...)` reducer (reuse `billingCounterparty`). Unit-tested.
- New `cooperation.ts`: `listCooperatingDoctors` (nurse/clinic gate — Admin SDK query),
  `setCooperationRelationship` (superAdmin upsert + audit write) via `setCooperationRelationshipTx(db, params)`,
  `backfillCooperationRelationships` (superAdmin) via `backfillCooperationRelationshipsTx(db)`. Exported through
  `index.ts` (inherits australia-southeast1).
- `billingFn.ts`: `generateInvoice` price resolution reads the relationship (`priceCentsOverride`) and skips
  `invoiceApplies:false` pairs, falling back to `scriptPricing`/DEFAULT.
- `firestore.rules`: `cooperationRelationships` + `relationshipAudit` read rules (doctor/counterparty/superAdmin;
  superAdmin-only for audit), `write:false`. Modelled on `invoices`/`billingEvents`.
- Tests: `domain.test.ts` (pure), `cooperation.integration.ts` (backfill idempotency + derivation + set), rules-tests.
- No `firestore.indexes.json` change (single-field + multi-equality queries only).

### Web (marketing)
- `types.ts`: the two types + `DemoState` maps. `backend.ts`: `emptyState` init, pure `cooperatingDoctors`,
  `setCooperationRelationship`, `removeCooperationRelationship`, `priceForCounterparty`, `invoiceApplies`-aware
  `billableAuthorisations`, `relationshipAuditForRelationship`, and seed derivation.
- `store.tsx`: `cooperatingDoctors(identity)`, admin CRUD methods (demo-local / live-callable), and the gated
  `listDoctors`/`listAvailableDoctors` consumers switch to `cooperatingDoctors`.
- `mappers.ts` + `hydrate.ts`: `mapCooperationRelationship`/`mapRelationshipAudit`; superAdmin whole-collection
  read + normal-path scoped read (counterpartyId==uid / clinic / doctorId==uid) via `runQuerySafe` (deploy-order-safe).
- `mirror.ts` + `firebase/*`: `listCooperatingDoctors`, `setCooperationRelationship`, `backfillCooperationRelationships`.
- UI: gated pickers (`request/page.tsx`, `availability/page.tsx`) + admin section (`profile/page.tsx`).
- `seed.ts`: demo relationships + audit.
- Tests: Vitest (pure + mapper/hydrate + store) + preview QA.

## Testing (TDD)
- Pure: `cooperatingDoctors` (active+allowed only, counterparty scoping), `priceForCounterparty` (override→scriptPricing→
  default precedence), `billableAuthorisations` (invoiceApplies:false excluded), `deriveCooperationRelationships`
  (requests+patients+scriptPricing → dedup active set), `setCooperationRelationship`/`remove` (immutable upsert + audit).
- Live: mapper + assembleState (both maps), rules-tests (read audience), backend integration (backfill idempotent + derive).
- Preview QA: demo nurse sees only cooperating doctors; admin creates/edits/removes a relationship (gate + audit update);
  pricing override flows into an invoice; invoiceApplies:false excludes a counterparty.

## Out of scope (deliberate)
- **Self-serve relationship requests** (nurse-requests / doctor-accepts) — conflicts with the confirmed admin-only
  model (§17); a separate feature.
- The broader §21 audit log for non-relationship actions (auth lifecycle, PDF gen, admin patient access) — this
  increment audits **relationship changes** only.
- Removing `scriptPricing` entirely — kept as a read-fallback this increment; a later cleanup can drop it once all
  pricing lives on relationships.

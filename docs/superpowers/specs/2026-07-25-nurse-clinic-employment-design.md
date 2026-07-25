# Nurse clinic employment + invoicing

**Date:** 2026-07-25
**Status:** Approved (brainstorming), pending implementation plan

## Feedback

1. A nurse can be a clinic's employee as well (not only doctors).
2. A nurse who is a clinic's employee can invoice that clinic.

## Background: what already exists

A nurse being a clinic employee is a **membership** concept, not a doctor-style
cooperation relationship. Cooperation relationships are strictly doctor↔counterparty
(`doctorID` + prescribing semantics: price override, auth-requests-allowed, invoiceApplies);
they do not model a nurse working at a clinic.

- **Live:** membership is a claim `clinics: { [clinicId]: "admin" | "employee" | "contractor" }`.
  `identitiesFromClaims` (`src/lib/firebase/identity.ts`) turns any `"employee"` clinic
  membership into a clinic-context identity for the account's clinical role — so a nurse
  with an `"employee"` clinic claim already gets a clinic nurse identity (workspace +
  clinic patient book). `createServiceInvoice` (deployed, backend PR #115) already lets a
  clinic **member** invoice their clinic. `selfHeal` already propagates membership-claim
  changes to the target's ID token.
- **Demo:** the same membership is baked into a nurse's identities (demo nurses Sarah and
  Ruby hold a Lumière clinic nurse identity). There is no way to grant it dynamically.

Both consumers of nurse membership read `accountsByID[nurseID].clinicIDs`:
- the admin **Employment view** (`RelationshipsSection.tsx`) lists nurse "Member accounts"
  from `clinicIDs` (currently read-only), and
- `createServiceInvoice` gates on `memberByClaims = clinicIDs.includes(clinicID)`.

**Conclusion:** both feedback points collapse to one missing capability — *let an admin
employ a nurse at a clinic* (grant/revoke the membership). Invoicing and workspace access
then follow from existing code.

## Decisions

- **A1 — model it as clinic membership**, separate from the doctor-centric cooperation
  model (no prescribing fields that do not apply to a nurse). Rejected A2 (generalizing
  cooperation relationships to a nurse "subject") as high-blast-radius — every relationship
  is keyed on `doctorID` and the Prescribing view iterates all relationships.
- **B1 — manage it in the Relationships → Employment view**, which already answers "who
  works at this clinic." Rejected B2 (create-user form only) as not helping existing nurses.
- **Employee scope = full clinic workspace** (confirmed): a granted nurse gets a clinic
  identity → "Practise as" the clinic, the clinic patient book, and the ability to invoice
  the clinic. Full parity with a doctor-employee.
- **Web/demo lands now; the live claim-write is a small backend-repo follow-up.** The web
  layer wires the live call; demo works end-to-end.

## Design

### Data model (demo)

New membership record on `DemoState`:

```
ClinicEmployment = {
  id: `${nurseID}_${clinicID}`,   // deterministic, idempotent grant key
  nurseID, nurseName,
  clinicID, clinicName,
  grantedAt,
}
```

- Stored as `DemoState.clinicEmployments: ClinicEmployment[]` — active grants only; a
  revoke removes the record.
- Granting also folds `clinicID` into `accountsByID[nurseID].clinicIDs`; revoking removes
  it. That single derived-field change lights up the two existing consumers (Employment
  view + `createServiceInvoice`) with no further change to them.
- Seed leaves `clinicEmployments` empty. Baked seed memberships (Sarah/Ruby) are **not**
  migrated into grants — they remain read-only fixtures (see Scope guard).

### Backend reducer + store API

- `setClinicEmployment(state, input, actor, now)` in `backend.ts`, where
  `input = { nurseID, nurseName, clinicID, clinicName, employed: boolean }`.
  - Guards: actor role is `superAdmin`; target account exists and includes role `nurse`;
    clinic exists in the directory. Throw `BackendError("notPermitted")` /
    `BackendError("validationFailed")` consistent with existing reducers.
  - `employed: true` upserts the grant on `id` (idempotent) + adds the `clinicID` to the
    nurse's `clinicIDs`. `employed: false` removes the grant + the `clinicID`.
  - Append a **platform** audit entry via `appendAuditEntry` (not the separate
    relationship-audit stream — clinic employment is not a cooperation relationship): add
    `clinic_employment_granted` / `clinic_employment_revoked` to the `AuditAction` union in
    `types.ts`; use `targetType: "account"` (free string), target the nurse, summary naming
    clinic + nurse.
- Store surface (mirrors `cooperationRelationships` / `setCooperationRelationship`):
  - `store.clinicEmployments(): ClinicEmployment[]` accessor.
  - `store.setClinicEmployment(input, actor): void` — eager demo apply via the reducer,
    then best-effort live mirror.

### Identity derivation

Extend `heldIdentities(active, available, demoRelationships = [], clinicEmployments = [])`
(`src/lib/demo/identity.ts`):

- For the **active nurse**, derive a `{ user, role: "nurse", context: { kind: "clinic",
  clinic: { id, name } } }` identity from each active `ClinicEmployment` where
  `nurseID === active.user.id`, **deduped** against identities already present (mirrors the
  existing doctor-employee derivation block).
- Live path is unaffected: when `available.length` is non-empty it is returned as-is (the
  `"employee"` claim already yields the identity).
- Pass the new argument from:
  - the **profile identity switcher** (`src/app/app/profile/page.tsx`) — so the nurse can
    "Practise as" the clinic, and
  - **`ServiceInvoiceComposer`** (`src/components/app/ServiceInvoiceComposer.tsx`) — so the
    clinic appears in the "Invoice the clinic" picker.
  Doctor-only callers (`prescriberIdentity(heldIdentities(...))` in dashboard,
  authorisations, ConsultCall) pass nothing new and are unaffected.

### Admin UI — Employment view (`RelationshipsSection.tsx`)

- Each clinic card gains an **"Add employee"** control: a nurse picker listing nurses not
  already employed at that clinic (from `store.accounts()` filtered to role `nurse`, minus
  current members), then `setClinicEmployment({ ..., employed: true }, identity)`.
- Nurse rows backed by a grant get a **Remove** action → `setClinicEmployment({ ...,
  employed: false }, identity)` with an inline confirm (match the existing relationship-row
  remove affordance).
- Baked seed memberships (no backing grant) keep the read-only "Member account" pill,
  exactly as today.
- Errors surface inline (reuse the row error pattern); no thrown error is swallowed.

### Live path (backend follow-up — specified, not built in this repo)

- The web `store.setClinicEmployment` live branch calls a new callable
  `setClinicMembership({ userId, clinicId, kind: "employee" | null })`:
  - `kind: "employee"` sets `clinics[clinicId] = "employee"` on the nurse's claims + user
    doc; `null` removes it.
  - superAdmin-gated; validates the target is a nurse and the clinic exists.
- No other backend work is required: `identitiesFromClaims`, `selfHeal`, and
  `createServiceInvoice` already handle the downstream behaviour.

### Tests

- **Reducer** (`__tests__/`): grant adds `clinicID` + emits audit; revoke reverses both;
  guards reject a non-superAdmin actor, a non-nurse target, and a missing clinic; a repeat
  grant is idempotent (no duplicate, no double clinicID).
- **`heldIdentities`**: an active nurse with a grant gains exactly one deduped clinic nurse
  identity; a grant for a different nurse does not leak; empty grants → unchanged output.
- **Employment view**: "Add employee" grants and the new row renders; Remove revokes;
  baked members stay read-only.
- **`ServiceInvoiceComposer`**: a granted nurse sees the clinic in the picker and can issue
  a service invoice (asserts `createServiceInvoice` succeeds for that clinic).

## Scope guard

Doctor-employees, the Prescribing view, cooperation relationships, and their reducers/rules
are untouched. Baked seed nurse memberships are not migrated. Live claim-writing is a
separate backend-repo change; this repo ships the web/demo feature and the live call site.

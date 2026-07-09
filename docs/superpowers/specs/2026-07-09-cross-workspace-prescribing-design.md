# Cross-workspace prescribing — doctor approval is always-on

**Date:** 2026-07-09
**Branch:** `feat/cross-workspace-prescribing`
**Tier:** Core-architecture audit **Tier 2**, item 1 ("doctor prescribing not always-on across workspaces").

## Problem

An account can hold several identities — e.g. a **doctor** (independent) *and* a **clinicAdmin**
(clinic). The auth context tracks one *active* identity plus the full `availableIdentities` set. But
the doctor's authorisation-approval capability is gated on the **selected** identity's role, not on
whether the account **holds** a doctor identity:

- `src/app/app/authorisations/page.tsx:42` — the review inbox renders only `if (identity.role === "doctor")`; a clinicAdmin/superAdmin selection falls to a "admins don't raise requests" message with **no inbox**.
- `src/app/app/dashboard/page.tsx:25,41` — the "Requests awaiting your review" tile + count are gated the same way.
- `src/lib/demo/backend.ts:388,478` — `approveRequest`/`requireEdit` reject unless `identity.role === "doctor"` (and `identity.user.id === request.doctorID`).

So a **doctor+clinicAdmin**, the moment they switch to the clinicAdmin workspace, **loses their
approval inbox and the ability to approve / require-edit** — even though, as a doctor, they should
be able to prescribe from any workspace. This contradicts the constitution's "prescribing is
always-on" principle.

The codebase already has the *held-roles* pattern — but only for AHPRA
(`src/app/app/profile/page.tsx:74`, `identities.some((i) => i.role === "doctor" || …)`). Prescribing
doesn't use it.

## Key insight: act under the account's doctor identity, not the selected one

The fix is presentation-layer: **resolve the account's doctor identity from `availableIdentities`
and use it to render the inbox and to call approve / require-edit** — regardless of which workspace
is currently active. Because the actions then carry a `role === "doctor"` identity whose
`user.id === request.doctorID`, the existing **backend gate passes unchanged**. No `backend.ts`
change, no Cloud Function change; the strict "the approver presents a doctor identity" invariant is
preserved (a pure clinicAdmin's uid never equals a `request.doctorID`, so nothing is loosened).

## Design

### Pure helper (`src/lib/demo/identity.ts`, new)
```ts
/** The account's doctor identity, if it holds one — the identity all prescribing/approval
 *  actions run under, regardless of the currently-selected workspace. */
export function prescriberIdentity(identities: Identity[]): Identity | null {
  return identities.find((i) => i.role === "doctor") ?? null;
}
```
Pure, no React — unit-testable. (Natural home for future held-role helpers; the profile page's
`holdsClinicalRole` could migrate here later, out of scope now.)

### Authorisations page (`src/app/app/authorisations/page.tsx`)
Restructure from an exclusive `if (identity.role === …)` chain into a **composition** driven by held
roles + selected identity, so multi-role accounts see every section they're entitled to:

```
const asDoctor = prescriberIdentity(availableIdentities);
- if asDoctor           → <DoctorReviewInbox identity={asDoctor} />       // always-on
- if identity.role==="nurse" → <NurseRequests identity={identity} />      // the nurse's own raised requests
- if !asDoctor && identity.role is admin → <AdminNoRequests />            // unchanged message
```

Behaviour by account:
| Account | Selected | Renders |
|---|---|---|
| doctor | doctor | inbox (unchanged) |
| nurse | nurse | nurse requests (unchanged) |
| clinicAdmin | clinicAdmin | admin message (unchanged) |
| **doctor+clinicAdmin** | **clinicAdmin** | **inbox** ← the fix |
| doctor+clinicAdmin | doctor | inbox |
| doctor+nurse | nurse | inbox + nurse requests |

`DoctorReviewInbox` uses `asDoctor` for `pendingRequestsForDoctor(asDoctor.user.id)` and passes
`asDoctor` to `store.approveRequest` / `store.requireEdit`. The existing inbox markup (review card,
items, Approve / Require edit / Start consult) is extracted verbatim into the sub-component.

### Dashboard (`src/app/app/dashboard/page.tsx`)
```
const asDoctor = prescriberIdentity(availableIdentities);
const pending = asDoctor ? store.pendingRequestsForDoctor(asDoctor.user.id) : [];
… {asDoctor && <Link>…{pending.length} Requests awaiting your review</Link>}
```
The "Acting as {role}" line stays keyed on the *selected* identity (it correctly names the current
workspace).

### Backend — unchanged
No change to `approveRequest`/`requireEdit`. The UI passing the doctor identity satisfies the gate.

## Test plan (TDD)

**Unit — `src/lib/demo/__tests__/identity.test.ts`:**
- `prescriberIdentity` returns the doctor identity from a `[clinicAdmin, doctor]` set; `null` for a
  clinicAdmin-only or nurse-only set; the doctor for a `[doctor]` set.

**Component — `src/app/app/authorisations/__tests__/authorisations-cross-workspace.test.tsx`:**
- `availableIdentities = [doctorIdentity, clinicAdminIdentity]`, **selected `identity` = clinicAdmin**
  → the review inbox ("Review requests" + the pending request) renders, and Approve calls
  `store.approveRequest(req.id, doctorIdentity)` (the *doctor* identity, not the selected one).
- clinicAdmin-only account still shows the "admins don't raise requests" message.

**Update existing `authorisations-doctor-view.test.tsx`:** the `useDemoAuth` mock must now also
return `availableIdentities: [doctorIdentity]` (the page reads it). Assertions unchanged.

**Update any dashboard test** mocking `useDemoAuth` similarly (add `availableIdentities`).

## QA
No demo account holds both roles, and adding one would ripple into `demoDoctorRefs` (the doctor
picker) and seeded request counts (`store-sync.test.tsx` pins `DEMO_ACCOUNTS[2]`). So the demo cast
stays unchanged; correctness is proven by the unit/component tests above, and browser QA is done
with a **temporary** dual-role account (a second `clinicAdmin` identity added to Dr Voss in
`accounts.ts`), verified, then **reverted before commit** — the documented precedent for
cross-identity flows.

## Non-goals / deferred
- **Availability publishing** (`availability/page.tsx:39`, doctor → `DoctorAvailability`) and the
  profile "Approvals" labelling are other selected-role-gated doctor surfaces, but are separate
  capabilities from the audited approval-inbox gap. Out of scope; note for a follow-up if the owner
  wants full always-on across every doctor surface.
- **A permanent demonstrable multi-role demo persona** (with a seeded request) — deliberately not
  added here to keep the increment focused and avoid demo-cast ripple; a separate demo-enhancement.
- **Live consult-call role checks** from the inbox — unchanged; out of scope.

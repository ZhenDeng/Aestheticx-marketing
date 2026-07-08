# Emergency Authorisations — Design

**Goal:** Every approved authorisation automatically **creates or refreshes** an Adrenaline
emergency authorisation, and filler (HA) authorisations additionally create or refresh a
Hyaluronidase/Hylase emergency authorisation — with **no repeated doctor work**. Emergency
authorisations are part of the authorisation record but are shown quietly at the end of the
patient's authorisation section, not in the main workflow.

This is the **web demo + design** increment. The live write-side (create/refresh on approval)
is a companion `~/Documents/AestheticX` backend PR to the `approveRequest` Cloud Function; the
web app hydrates and displays the resulting records in live mode. Same demo-first pattern used
for every prior increment (build web demo + design now; backend companion lights up on deploy).

**Source of truth:** `~/Downloads/core-architecture.docx` — *Core Architecture v1.0*, §12
(Emergency Authorisation Rules) + Rule 6:
- "Every new approved authorisation must create or refresh an Adrenaline emergency authorisation.
  If a new authorisation is approved, the existing Adrenaline emergency authorisation expiry
  should be refreshed rather than creating unnecessary duplicates."
- "For filler-related authorisations, the system must also create or refresh a
  Hyaluronidase / Hylase emergency authorisation."
- "Emergency authorisations should appear at the end of the larger Authorisation section …
  part of the authorisation record, but should not clutter the main workflow."

This capability does **not** exist on iOS or in the backend yet — it is net-new, not a port.

## Decisions (owner-confirmed 2026-07-08)
1. **Scope** — one record per **patient + prescribing doctor + kind**. "The existing one" to
   refresh is keyed on `(patientID, doctorID, kind)`; a new approval by that doctor refreshes
   theirs. Mirrors how normal authorisations attach to a doctor.
2. **Hyaluronidase trigger** — **HA fillers only** (`ProductCategory === "haFiller"`).
   Hyaluronidase reverses HA fillers only, not biostimulators (Sculptra/Radiesse/Ellansé,
   which are `collagenStimulator`) or skin boosters — so the existing taxonomy is the correct
   discriminator, clinically stricter than the doc's looser "filler-related" wording.
3. **Expiry** — fixed **12 months** from the last refresh (`EMERGENCY_VALIDITY_MONTHS = 12`).
   Distinct from the regular `VALIDITY_MONTHS = 6`.
4. **Manual/compounded products** — the "Other / compounded" free-text line gains a single
   "HA filler?" toggle so a manually entered HA filler can trigger hyaluronidase (Rule 5 / §15
   requires manual products be classifiable filler vs non-filler *for exactly this logic*).
5. **Live parity** — web demo + design now; the `approveRequest` write-side is a companion
   AestheticX PR (separate branch + deploy). Web hydrates/display in live mode meanwhile.

## Approach — separate object, not a flag on `Authorisation`
A distinct `EmergencyAuthorisation` type in its own `DemoState` map, **not** a field on
`Authorisation`. Emergency authorisations are not billable, have no repeats, and must not
appear in the "Active authorisations" list — a separate type keeps them out of
`billableAuthorisations` (`backend.ts`), the repeats/invoicing path, and the active-auth list
with zero new filters in those consumers. Reusing `Authorisation` would leak emergency records
into every one of those and require defensive filters throughout.

## Model (`types.ts` + `DemoState`)

```ts
export type EmergencyKind = "adrenaline" | "hyaluronidase";

export interface EmergencyAuthorisation {
  id: string;              // `${patientID}_${doctorID}_${kind}` — deterministic ⇒ upsert = refresh, not duplicate
  patientID: string;
  doctorID: string;
  doctorName: string;      // denormalised at issue for display
  kind: EmergencyKind;
  createdAt: number;       // first issued (preserved across refreshes)
  refreshedAt: number;     // last approval that refreshed it
  expiresAt: number;       // refreshedAt + 12 months (EMERGENCY_VALIDITY_MONTHS)
  sourceAuthorisationIDs: string[]; // audit trail of the authorisations that triggered/refreshed it
}
```

`DemoState` gains `emergencyAuthorisationsByID: Record<string, EmergencyAuthorisation>`,
following the existing `Record<string, X>`-by-id convention (e.g. `authorisations`). Keying by
the deterministic `(patient, doctor, kind)` id makes "create or refresh" a plain upsert.

## Layers

### Domain (pure — new module `src/lib/demo/emergency.ts`, TDD)
- `EMERGENCY_VALIDITY_MONTHS = 12`.
- `isReversibleFiller(item: MedicationItem): boolean` → `item.category === "haFiller"`.
- `emergencyKindsFor(items: MedicationItem[]): EmergencyKind[]` → always `["adrenaline"]`;
  append `"hyaluronidase"` when any item `isReversibleFiller`. Deterministic order
  (adrenaline first).
- `applyEmergencyAuthorisations(existing, args): Record<string, EmergencyAuthorisation>` where
  `args = { patientID, doctorID, doctorName, kinds, sourceAuthIDs, now }`. Pure upsert: for each
  kind, compute id `${patientID}_${doctorID}_${kind}`; if present preserve `createdAt` and
  union `sourceAuthorisationIDs`, else `createdAt = now`; always set `refreshedAt = now`,
  `expiresAt = now + 12mo`, `doctorName = args.doctorName`. Immutable (returns a new map).
- `activeEmergencyAuthorisationsForPatient(state, patientID, now): EmergencyAuthorisation[]` →
  records for the patient with `expiresAt > now`, sorted adrenaline-first then by doctorName.

Uses the existing `addMonthsUTC` helper (`backend.ts:288`) for the 12-month expiry, kept UTC to
match `VALIDITY_MONTHS` handling.

### Wiring into approval (`backend.ts` `approveRequest`, `:366`)
After `granted`/`authorisations` are built and before assembling the returned state, compute
`emergencyKindsFor(request.items)` and fold `applyEmergencyAuthorisations` into
`emergencyAuthorisationsByID`. `doctorID = request.doctorID`,
`doctorName = identity.user.name` (the approver **is** the addressed doctor — already asserted
at `:374`), `sourceAuthIDs = granted.map(a => a.id)`, `now` = the passed `now`. Nothing else in
the approval path changes; the return shape (`{ state, granted }`) is unchanged.

### Store (`store.tsx`)
- Selector `activeEmergencyAuthorisations(patientID)` →
  `emergency.activeEmergencyAuthorisationsForPatient(state, patientID, now)`.
- No new mutator: emergency records are a side effect of `approveRequest`, whose existing
  `applyAndMirror(... mirrorApproveRequest ...)` wiring is untouched. In demo mode the pure
  `approveRequest` now also returns the emergency records in state; in live mode the backend
  writes them and hydrate reads them.

### Live parity
- `mappers.ts`: `mapEmergencyAuthorisation(doc)` ↔ the Firestore doc shape
  (`emergencyAuthorisations/{patientId}_{doctorId}_{kind}` — final path decided with the
  backend PR; a per-patient subcollection is the likely shape). Millis in/out like the other
  time fields.
- `hydrate.ts`: for each visible patient, read their emergency-authorisation docs and populate
  `emergencyAuthorisationsByID`. Rules give the same read audience as the authorisation list
  (owner + prescribing doctors + reviewers) — no new client rule beyond what the backend PR adds.
- **No web mirror write** — creation/refresh is server-side in `approveRequest`. The web PR is
  self-contained (demo fully exercises the logic; live displays whatever the backend has
  written). Live automation activates when the companion AestheticX PR deploys.

### UI (`src/app/app/patients/[id]/page.tsx`, authorisation aside `:264`)
A quiet **"Emergency authorisations"** subsection at the **end** of the Active-authorisations
card. Per record: kind label ("Adrenaline — anaphylaxis" / "Hyaluronidase / Hylase"),
authorising doctor, and refreshed + expiry dates, in muted styling (reuses the card's `micro` /
`text-ink-soft` tokens). Read-only. Empty → the subsection is omitted (no "None" noise). Same
viewers as the authorisation list (anyone with `patientPermissions(...).canView`, which already
gates the whole aside).

### Manual/compounded HA-filler toggle (`request/page.tsx` `OtherLineEditor`, `:37`)
Add a checkbox *"This is an HA (hyaluronic acid) filler"* under the medication name. Checked →
`onChange({ ...item, category: "haFiller" })`; unchecked → `category: "other"`. `unit` stays
`"freeText"` so the item is still a manual/compounded entry; only the emergency discriminator
changes. `emptyOtherItem()` default stays `"other"`.

## Testing (TDD)

`src/lib/demo/__tests__/emergency.test.ts` (pure):
- `emergencyKindsFor`: neurotoxin-only ⇒ `["adrenaline"]`; a `haFiller` item ⇒
  `["adrenaline", "hyaluronidase"]`; `collagenStimulator`/`skinBooster`/`other` ⇒ adrenaline
  only (no hyaluronidase); mixed list with one HA filler ⇒ both.
- `applyEmergencyAuthorisations`: first call creates with `createdAt === now`; a later call
  refreshes the same id (createdAt preserved, refreshedAt/expiresAt bumped, sources unioned, no
  duplicate key); a different `doctorID` creates a separate record; expiry === `now + 12mo`.
- `activeEmergencyAuthorisationsForPatient`: filters out `expiresAt <= now`; adrenaline-first order.

`src/lib/demo/__tests__/backend.test.ts` (or the auth test file):
- Approving a neurotoxin request creates exactly one `adrenaline` emergency auth for
  `(patient, doctor)`; no hyaluronidase.
- Approving an HA-filler request creates `adrenaline` + `hyaluronidase`.
- Re-approving another request for the same patient by the same doctor **refreshes** (still one
  adrenaline record, later expiry) — no duplicate.
- A second doctor approving for the same patient gets their **own** adrenaline record.
- A manual "Other" item with `category: "haFiller"` (via the toggle) triggers hyaluronidase.
- Emergency records are absent from `billableAuthorisations` / `activeAuthorisations`.

## Out of scope (deliberate)
- Emergency-authorisation **references inside the authorisation-document PDF** — belongs to the
  separate "full audit-ready Authorisation Document" increment (Tier 2 of the audit).
- A static anaphylaxis first-aid text block.
- Any change to the regular authorisation lifecycle, repeats, or invoicing.

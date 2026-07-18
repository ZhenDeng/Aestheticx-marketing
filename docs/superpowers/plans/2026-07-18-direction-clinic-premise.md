# Clinic Premises on the Clause 68C Direction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "Premises of administration" resolve for a clinic-context authorisation in live, so a clinician stops retyping the clinic's street address onto every Clause 68C direction.

**Architecture:** `approveRequest` reads `clinics/{clinicId}` inside its existing transaction and **stamps** the clinic's premises onto every authorisation it writes. The web maps that stamp and `premiseForCapture` reads it from the authorisation instead of from the originating request. A stamp rather than a client-side lookup because `/clinics` is readable only by `inClinic || isSuperAdmin`, while `/authorisations` is readable by nurse, doctor, clinic members and super admin — so a lookup would work for a clinic nurse and permission-deny an independent cooperating doctor exporting the same direction.

**Tech Stack:** TypeScript, Firebase Cloud Functions (firebase-admin, firebase-functions v7), Next.js 15 / React, Vitest, Testing Library.

**Design doc:** `docs/superpowers/specs/2026-07-18-direction-clinic-premise-design.md`

## Global Constraints

- **Two repos, two PRs.** Backend is `~/Documents/AestheticX/backend/functions`; web is `~/Documents/Aestheticx-marketing`. Never mix them in one commit.
- **Base branches.** Web: branch off **`main`** — `fix/direction-form-autofill` landed as PR #117 (`6b3f1fd`) and was archived as `openspec/changes/archive/2026-07-18-direction-capture-autofill`, so `premiseForCapture` is on `main`. Backend: branch off **`fix/direction-party-names`**, which is still unmerged and local-only. **Verify before starting** (Task 0).
- **Backend commit style:** plain conventional commits, no openspec in that repo.
- **Backend indentation/style:** 2-space, **no semicolons**, single quotes. Web: 2-space, **semicolons**, double quotes. Match the file you are editing.
- **TDD, strictly.** Every task writes the failing test first and runs it to see it fail before implementing.
- **No backfill.** Nothing in this plan writes to existing authorisation documents. Stamps apply to future approvals only.
- **No `firestore.rules` change.** `authorisations` is already `allow write: if false` (Function-only) and its read audience already covers every exporter.
- **Omit, never blank.** An unresolvable stamp omits its key rather than writing `""` or `null`, so a reader can tell *never stamped* from *stamped empty* and pre-stamp documents keep behaving exactly as today.

---

### Task 0: Confirm the base branches

**Files:** none (verification only)

- [ ] **Step 1: Check the backend base contains the party-names work**

```bash
cd ~/Documents/AestheticX && git log --oneline -1 && grep -n "directionPartyNames" backend/functions/src/index.ts
```

Expected: at least one match in `index.ts`. If there are no matches, stop — check out `fix/direction-party-names` (or a `main` that has merged it) before continuing.

- [ ] **Step 2: Check the web base contains the autofill work**

```bash
cd ~/Documents/Aestheticx-marketing && git checkout main && git pull && grep -n "export function premiseForCapture" src/lib/demo/direction.ts
```

Expected: one match (it landed as PR #117, `6b3f1fd`). If there are no matches, stop — you are not on a `main` that has merged it.

- [ ] **Step 3: Create the two working branches**

```bash
cd ~/Documents/AestheticX && git checkout -b fix/direction-clinic-premise
cd ~/Documents/Aestheticx-marketing && git checkout -b fix/direction-clinic-premise
```

---

## Repo A — backend (`~/Documents/AestheticX/backend/functions`)

### Task 1: `clinicPremiseStamp` pure helper

The only logic worth testing is the coercion of untrusted Firestore data into a premise. It goes in `domain.ts` (thoroughly unit-tested) rather than `index.ts` (no unit tests), matching `directionPartyNames` and `prescriberContact`.

**Files:**
- Modify: `src/domain.ts` (add the field to `AuthorisationDoc` at `:87-106`; add the helper after `directionPartyNames`, which ends at `:165`)
- Test: `src/domain.test.ts`

**Interfaces:**
- Consumes: `PremiseStamp` (`domain.ts:50` — `{ id: string; name: string; address: string }`)
- Produces: `clinicPremiseStamp(clinicId: string | null | undefined, clinic: Record<string, unknown> | null): { clinicPremise?: PremiseStamp }` — an object to spread at a write site, used by Task 2.

- [ ] **Step 1: Write the failing tests**

Add to `src/domain.test.ts`, after the closing `})` of the `directionPartyNames` describe block (ends at `:227`):

```ts
// The clinic's street address lives only on clinics/{id}, which firestore.rules makes readable
// to clinic members alone — so an independent cooperating doctor exporting this direction could
// not resolve it client-side. Stamping at approval reaches every exporter (the authorisation's
// read audience is strictly wider) and snapshots the address as at authorisation, which is what
// a legal document should record.
describe('clinicPremiseStamp (Clause 68C premises of administration)', () => {
  it('stamps the clinic id, name and address, trimmed', () => {
    expect(clinicPremiseStamp('clinic-lumiere', {
      name: '  Lumière Clinic  ',
      address: '  2 Notts Ave, Bondi Beach NSW 2026  ',
    })).toEqual({
      clinicPremise: {
        id: 'clinic-lumiere',
        name: 'Lumière Clinic',
        address: '2 Notts Ave, Bondi Beach NSW 2026',
      },
    })
  })

  it('OMITS the stamp for an independent authorisation', () => {
    expect(clinicPremiseStamp(null, null)).not.toHaveProperty('clinicPremise')
    expect(clinicPremiseStamp(undefined, { name: 'X', address: '1 St' })).not.toHaveProperty('clinicPremise')
    expect(clinicPremiseStamp('   ', { name: 'X', address: '1 St' })).not.toHaveProperty('clinicPremise')
  })

  it('OMITS the stamp when the clinic doc is missing or carries no usable address', () => {
    expect(clinicPremiseStamp('clinic-lumiere', null)).not.toHaveProperty('clinicPremise')
    expect(clinicPremiseStamp('clinic-lumiere', {})).not.toHaveProperty('clinicPremise')
    expect(clinicPremiseStamp('clinic-lumiere', { address: '   ' })).not.toHaveProperty('clinicPremise')
    expect(clinicPremiseStamp('clinic-lumiere', { address: 42 })).not.toHaveProperty('clinicPremise')
  })

  // Unlike a PARTY name, which must fail closed, the Clause 68C field is "premises of
  // administration" — an address alone satisfies it, and premiseDisplayLine already renders
  // address-only when the name is blank. A named premises is better; an unnamed one is correct.
  it('stamps an address with a blank name rather than omitting the premises entirely', () => {
    expect(clinicPremiseStamp('clinic-lumiere', { address: '2 Notts Ave' }))
      .toEqual({ clinicPremise: { id: 'clinic-lumiere', name: '', address: '2 Notts Ave' } })
  })
})
```

Add `clinicPremiseStamp` to the existing import list from `'./domain'` at the top of the file (alphabetically it sits just after `canUse` on `:6`).

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd ~/Documents/AestheticX/backend/functions && npx vitest run src/domain.test.ts -t clinicPremiseStamp
```

Expected: FAIL — `clinicPremiseStamp is not a function` (or a TS error that it is not exported).

- [ ] **Step 3: Add the field to `AuthorisationDoc`**

In `src/domain.ts`, inside `export interface AuthorisationDoc` (`:87`), after the `nurseName?: string` line (`:105`):

```ts
  /** The clinic's premises, stamped at approval (2026-07-18) — the Clause 68C "premises of
   *  administration" for a clinic authorisation. Absent for independent authorisations, when the
   *  clinic doc carries no usable address, and on authorisations approved before the stamp
   *  existed. The direction is rendered client-side, where clinics/{id} is not readable by every
   *  exporter, so it cannot be looked up at render time. */
  clinicPremise?: PremiseStamp
```

- [ ] **Step 4: Write the helper**

In `src/domain.ts`, immediately after `directionPartyNames` closes (`:165`):

```ts
/**
 * The clinic's premises to stamp onto each authorisation at approval (2026-07-18) — the Clause
 * 68C "premises of administration" for a clinic authorisation.
 *
 * Stamped rather than resolved at render time for two reasons. firestore.rules makes
 * clinics/{id} readable only to clinic members, so an independent cooperating doctor exporting
 * the direction could not read it — a lookup would render one document for the nurse and
 * permission-deny the doctor. And a legal document should record the premises as they were when
 * administration was authorised, not as they are today.
 *
 * The stamp is OMITTED when there is no clinic, no clinic doc, or no usable address, so a reader
 * can tell "never stamped" from "stamped empty" and pre-stamp authorisations keep falling back.
 * A blank NAME does not suppress it: an address alone locates the premises, and the fail-closed
 * rule governs party lines (who), not the location (where).
 */
export function clinicPremiseStamp(
  clinicId: string | null | undefined,
  clinic: Record<string, unknown> | null,
): { clinicPremise?: PremiseStamp } {
  // Firestore data is untrusted here: a legacy or hand-written doc may hold a missing, blank or
  // non-string value.
  const usable = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')
  const id = usable(clinicId)
  if (!id || !clinic) return {}
  const address = usable(clinic.address)
  if (!address) return {}
  return { clinicPremise: { id, name: usable(clinic.name), address } }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd ~/Documents/AestheticX/backend/functions && npx vitest run src/domain.test.ts -t clinicPremiseStamp
```

Expected: PASS, 4 tests.

- [ ] **Step 6: Run the full backend suite and the type check**

```bash
cd ~/Documents/AestheticX/backend/functions && npm test && npm run build
```

Expected: all tests pass; `tsc` exits 0.

- [ ] **Step 7: Commit**

```bash
cd ~/Documents/AestheticX && git add backend/functions/src/domain.ts backend/functions/src/domain.test.ts
git commit -m "feat(direction): add clinicPremiseStamp for the Clause 68C premises of administration"
```

---

### Task 2: Stamp it in `approveRequest`

**Files:**
- Modify: `src/index.ts` (import; one read beside `doctorSnap` at `~:177`; one spread beside `partyNames` at `~:193`)

**Interfaces:**
- Consumes: `clinicPremiseStamp` from Task 1.
- Produces: authorisation documents carrying an optional `clinicPremise` field — consumed by Task 3 in the web repo.

- [ ] **Step 1: Import the helper**

In `src/index.ts`, add `clinicPremiseStamp` to the existing import list from `'./domain'` (it sits alphabetically near `billingCounterparty` / `computeExpiryMillis`).

- [ ] **Step 2: Read the clinic doc in the transaction's READ phase**

Firestore transactions require **every read before any write**. Place this beside the existing `doctorSnap` read, immediately after the `const doctorSnap = await tx.get(...)` line and before `const partyNames = ...`:

```ts
    // Clause 68C premises of administration (2026-07-18) — the clinic's address is stamped here
    // because the direction is rendered client-side, where clinics/{id} is readable only to
    // clinic members. Conditional: independent approvals add no read at all.
    const clinicSnap = request.clinicId
      ? await tx.get(db.collection('clinics').doc(request.clinicId))
      : null
```

- [ ] **Step 3: Spread the stamp at the write site**

In the same function, inside `authorisations.forEach(...)`, add one line to the `tx.set` payload directly after `...partyNames,`:

```ts
        ...clinicPremiseStamp(request.clinicId, clinicSnap?.data() ?? null),
```

The payload now reads:

```ts
      tx.set(db.collection('authorisations').doc(`${requestId}-${index}`), {
        ...authorisation,
        ...partyNames,
        ...clinicPremiseStamp(request.clinicId, clinicSnap?.data() ?? null),
        counterpartyId,
        patientName,
        invoiced: false,
        status: 'approved',
        createdAt: FieldValue.serverTimestamp(),
      })
```

- [ ] **Step 4: Run the full suite and the type check**

```bash
cd ~/Documents/AestheticX/backend/functions && npm test && npm run build
```

Expected: all tests pass; `tsc` exits 0. `index.ts` has no unit tests — the type check plus Task 1's helper coverage is the gate here, which is the same standard `partyNames` was held to.

- [ ] **Step 5: Verify the read stayed in the read phase**

```bash
cd ~/Documents/AestheticX/backend/functions && grep -n "tx.get\|tx.set" src/index.ts | sed -n '1,20p'
```

Expected: every `tx.get` line number for `approveRequest` is **lower** than its first `tx.set`. If a `tx.get` appears after a `tx.set`, move it up — Firestore throws at runtime otherwise, and no unit test would catch it.

- [ ] **Step 6: Commit**

```bash
cd ~/Documents/AestheticX && git add backend/functions/src/index.ts
git commit -m "feat(direction): stamp the clinic's premises onto authorisations at approval"
```

---

## Repo B — web (`~/Documents/Aestheticx-marketing`)

### Task 3: Map the stamp, and fail the clinic name closed

Two changes in one task because they are one contract: the direction stops reading the clinic off the request and starts reading it off the authorisation, so the request's synthesised clinic name must stop being a raw id at the same moment.

**Files:**
- Modify: `src/lib/demo/types.ts:166-183` (`Authorisation`)
- Modify: `src/lib/firebase/mappers.ts:139-158` (`mapAuthorisation`), `:280` (`mapAuthRequest`)
- Test: `src/lib/firebase/__tests__/mappers.test.ts`

**Interfaces:**
- Consumes: the backend `clinicPremise` field from Task 2; existing `mapPremise` (`mappers.ts:132`), which returns `null` unless `address` is a non-empty string.
- Produces: `Authorisation.clinicPremise?: Premise` — consumed by Task 5.

- [ ] **Step 1: Write the failing tests**

In `src/lib/firebase/__tests__/mappers.test.ts`, add inside the existing `describe("mapAuthorisation", ...)` block (`:144-156`), after the existing `it`:

```ts
  it("carries the clinic premises stamp, and omits it when absent or address-less", () => {
    const base = {
      requestId: "r1", patientId: "p1", doctorId: "u-voss", nurseId: "u-sarah",
      clinicId: "clinic-lumiere", repeatsRemaining: 5, expiresAtMillis: 1800000000000,
      medication: { name: "Letybo", dosage: "16", category: "neurotoxin", unit: "units", areas: ["Forehead"] },
    };
    const stamped = mapAuthorisation("a1", {
      ...base,
      clinicPremise: { id: "clinic-lumiere", name: "Lumière Clinic", address: "2 Notts Ave, Bondi Beach NSW 2026" },
    });
    expect(stamped.clinicPremise).toEqual({
      id: "clinic-lumiere", name: "Lumière Clinic", address: "2 Notts Ave, Bondi Beach NSW 2026",
    });

    // No backfill: an authorisation approved before the stamp existed carries none, and must
    // stay distinguishable from one stamped empty so the capture dialog still prompts.
    expect(mapAuthorisation("a2", base).clinicPremise).toBeUndefined();
    expect(mapAuthorisation("a3", { ...base, clinicPremise: { id: "c", name: "n", address: "  " } }).clinicPremise)
      .toBeUndefined();
  });
```

And inside the existing `describe("mapAuthRequest", ...)` block (`:158`), after the existing `it`:

```ts
  it("fails closed on the clinic name rather than passing off the raw clinic id", () => {
    // An id is a non-empty string, so a raw id sitting in `name` would print onto the Clause 68C
    // direction AND satisfy the missingDirectionFields gate that exists to block exactly that —
    // the same defect class as the raw-uid prescriber name. The direction takes the clinic's
    // premises from the authorisation's clinicPremise stamp instead.
    const r = mapAuthRequest("r1", {
      patientId: "p1", nurseId: "u-sarah", nurseName: "Sarah Chen", doctorId: "u-voss",
      clinicId: "clinic-lumiere", status: "pending", createdAt: 1750000000000, items: [],
    });
    expect(r.context).toEqual({ kind: "clinic", clinic: { id: "clinic-lumiere", name: "" } });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd ~/Documents/Aestheticx-marketing && npx vitest run src/lib/firebase/__tests__/mappers.test.ts
```

Expected: FAIL — `clinicPremise` is `undefined` on the stamped case, and the clinic name is `"clinic-lumiere"` rather than `""`.

- [ ] **Step 3: Add the field to `Authorisation`**

In `src/lib/demo/types.ts`, inside `export interface Authorisation` (`:166`), after the `premise?: Premise | null;` line (`:182`):

```ts
  /** The clinic's premises, stamped at approval (2026-07-18) — the Clause 68C "premises of
   *  administration" for a clinic authorisation. Stamped rather than looked up because
   *  clinics/{id} is readable only to clinic members, so an independent cooperating doctor
   *  exporting this direction could not resolve it. Absent for independent authorisations and on
   *  authorisations approved before the stamp existed. */
  clinicPremise?: Premise;
```

- [ ] **Step 4: Map it**

In `src/lib/firebase/mappers.ts`, in `mapAuthorisation` (`:139`), add a line beside the existing `premise` local:

```ts
  const premise = mapPremise(data.premise);
  const clinicPremise = mapPremise(data.clinicPremise);
```

and a line in the returned object, directly after `...(premise ? { premise } : {}),`:

```ts
    ...(clinicPremise ? { clinicPremise } : {}),
```

`mapPremise` already returns `null` unless `address` is a non-empty string, so a blank-addressed stamp maps to absent with no new code.

- [ ] **Step 5: Fail the clinic name closed**

In `src/lib/firebase/mappers.ts`, replace the `context:` line in `mapAuthRequest` (`:280`):

```ts
    // The clinic's NAME is not on the request doc, and an id is a non-empty string — passing one
    // off as a name would print onto the Clause 68C direction AND satisfy missingDirectionFields.
    // Fail closed. The direction reads the clinic's premises from the authorisation's
    // clinicPremise stamp (approveRequest), not from here.
    context: clinicId ? { kind: "clinic", clinic: { id: clinicId, name: "" } } : { kind: "independent" },
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
cd ~/Documents/Aestheticx-marketing && npx vitest run src/lib/firebase/__tests__/mappers.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd ~/Documents/Aestheticx-marketing
git add src/lib/demo/types.ts src/lib/firebase/mappers.ts src/lib/firebase/__tests__/mappers.test.ts
git commit -m "feat(direction): map the clinic premises stamp and fail the clinic name closed"
```

---

### Task 4: Demo `approveRequest` stamps the same field

Without this, demo would resolve the premises by a *different route* than live and the resolver's clinic branch would only ever be exercised in live. This lands before Task 5 so the demo app is never broken between commits.

**Files:**
- Modify: `src/lib/demo/backend.ts:449-466` (`approveRequest`)
- Test: `src/lib/demo/__tests__/premises.test.ts` (the `describe("approval stamps (round 6)")` block at `:149`)

**Interfaces:**
- Consumes: `Authorisation.clinicPremise` from Task 3; `AuthorisationRequest.context` (`ClinicRef` carries `address` in demo).
- Produces: demo authorisations carrying `clinicPremise`, matching the live shape — consumed by Task 5.

- [ ] **Step 1: Write the failing test**

In `src/lib/demo/__tests__/premises.test.ts`, add inside `describe("approval stamps (round 6)", ...)` (`:149`), after the existing `it`:

```ts
  it("stamps the clinic's premises onto a clinic authorisation, mirroring the Cloud Function", () => {
    // A clinic request stamps premise: null deliberately ("use the clinic's address"). The
    // clinic's address must therefore ride onto the authorisation itself, or the client-rendered
    // Clause 68C direction has nowhere to read it from.
    const state = buildSeedState();
    const clinicPatient = Object.values(state.patients).find((p) => p.owner.kind === "clinic");
    if (!clinicPatient) throw new Error("seed has no clinic patient");
    const submitted = submitRequest(
      state,
      { patientID: clinicPatient.id, doctorID: voss.user.id, items: [botox], identity: sarahClinic },
      SEED_NOW,
    );
    const { granted } = approveRequest(submitted.state, submitted.request.id, voss, SEED_NOW + 86_400_000);
    expect(granted[0].premise).toBeNull();
    expect(granted[0].clinicPremise).toEqual({
      id: LUMIERE.id, name: LUMIERE.name, address: LUMIERE.address,
    });
  });

  it("stamps no clinic premises on an independent authorisation", () => {
    const state = buildSeedState();
    const own = Object.values(state.patients).find(
      (p) => p.owner.kind === "nurse" && p.owner.id === sarahIndependent.user.id,
    );
    if (!own) throw new Error("no independent patient in seed");
    const submitted = submitRequest(
      state,
      { patientID: own.id, doctorID: voss.user.id, items: [botox], identity: sarahIndependent },
      SEED_NOW,
    );
    const { granted } = approveRequest(submitted.state, submitted.request.id, voss, SEED_NOW + 86_400_000);
    expect(granted[0].clinicPremise).toBeUndefined();
  });
```

`buildSeedState`, `submitRequest`, `approveRequest`, `SEED_NOW`, `LUMIERE`, `voss`, `botox`, `sarahClinic` and `sarahIndependent` are all already imported in this file.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd ~/Documents/Aestheticx-marketing && npx vitest run src/lib/demo/__tests__/premises.test.ts -t "approval stamps"
```

Expected: FAIL — `granted[0].clinicPremise` is `undefined` on the clinic case.

- [ ] **Step 3: Stamp it**

In `src/lib/demo/backend.ts`, in `approveRequest`, immediately after the existing `const clinicID = ...` line (`:449`):

```ts
  // Mirrors the Cloud Function's clinicPremiseStamp: the clinic's premises ride onto every
  // authorisation so the client-rendered Clause 68C direction can print them. Omitted (not
  // blanked) when there is no usable address, so the capture dialog still prompts.
  const clinicAddress = request.context.kind === "clinic" ? (request.context.clinic.address ?? "").trim() : "";
  const clinicPremise = request.context.kind === "clinic" && clinicAddress !== ""
    ? { id: request.context.clinic.id, name: request.context.clinic.name, address: clinicAddress }
    : null;
```

Then add one line to the mapped authorisation object, directly after `premise: request.premise ?? null,`:

```ts
    ...(clinicPremise ? { clinicPremise } : {}),
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd ~/Documents/Aestheticx-marketing && npx vitest run src/lib/demo/__tests__/premises.test.ts
```

Expected: PASS, whole file.

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/Aestheticx-marketing
git add src/lib/demo/backend.ts src/lib/demo/__tests__/premises.test.ts
git commit -m "feat(direction): stamp the clinic premises on demo approvals too"
```

---

### Task 5: `premiseForCapture` and `DirectionDialog` read the stamp

The resolver's signature change and its single caller land together — splitting them would leave `tsc` red between commits, and a reviewer would judge them as one behaviour change anyway.

**Files:**
- Modify: `src/lib/demo/direction.ts:9` (import), `:147-160` (`premiseForCapture`)
- Modify: `src/components/app/DirectionDialog.tsx:42-62` (the `useState` initialiser)
- Test: `src/lib/demo/__tests__/direction-capture-prefill.test.ts`
- Test: `src/components/app/__tests__/DirectionDialog-prefill.test.tsx`

**Interfaces:**
- Consumes: `Authorisation.clinicPremise` (Task 3), stamped by Tasks 2 and 4.
- Produces: `premiseForCapture(input: { stamped: Premise | null | undefined; clinicID: string | null; clinicPremise: Premise | null | undefined; actingPremise: Premise | null }): string` — replaces the `clinic: ClinicRef | null` parameter.

- [ ] **Step 1: Update the resolver's unit tests**

In `src/lib/demo/__tests__/direction-capture-prefill.test.ts`:

**(a)** Change `LUMIERE_REF`'s declaration to a `Premise` (it already has the right shape):

```ts
const LUMIERE_PREMISE: Premise = { id: "clinic-lumiere", name: "Lumière Clinic", address: "2 Notts Ave, Bondi Beach NSW 2026" };
```

**(b)** In every existing `premiseForCapture({ ... })` call, rename the `clinic:` key to `clinicPremise:` and replace `LUMIERE_REF` with `LUMIERE_PREMISE`. The four independent-context tests pass `clinic: null` → `clinicPremise: null`. In the clinic-context block, `clinicID: LUMIERE_REF.id` becomes `clinicID: LUMIERE_PREMISE.id`.

**(c)** Replace the test named `"yields blank when the clinic carries no address (the live shape)"` — the gap it pinned is the one this change closes — with:

```ts
  it("yields blank for a clinic authorisation approved before the stamp existed", () => {
    // No backfill: authorisations approved before approveRequest stamped clinicPremise carry
    // none. They must keep prompting rather than reaching for the acting nurse's private
    // practice — the misattribution this precedence exists to prevent.
    expect(premiseForCapture({
      stamped: null, clinicID: "clinic-lumiere", clinicPremise: undefined, actingPremise: BONDI,
    })).toBe("");
  });

  it("uses a stamped clinic premises that carries no name, address-only", () => {
    // clinicPremiseStamp deliberately allows a blank name: an address alone locates the
    // premises, and the fail-closed rule governs party lines, not the location.
    expect(premiseForCapture({
      stamped: null,
      clinicID: "clinic-lumiere",
      clinicPremise: { id: "clinic-lumiere", name: "", address: "2 Notts Ave, Bondi Beach NSW 2026" },
      actingPremise: BONDI,
    })).toBe("2 Notts Ave, Bondi Beach NSW 2026");
  });
```

**(d)** Rename the two tests mentioning "when the clinic cannot be resolved" to say "when the clinic premises are not stamped" — the mechanism has changed, and the names should not describe a request lookup that no longer happens. Their bodies keep `clinicPremise: null` and their existing assertions unchanged.

- [ ] **Step 2: Update the component tests**

In `src/components/app/__tests__/DirectionDialog-prefill.test.tsx`:

**(a)** Replace the body of the test named `"uses the clinic's address for a clinic authorisation, never the nurse's own premises"` — the clinic now comes from the authorisation, not the request context:

```ts
  it("uses the clinic's address for a clinic authorisation, never the nurse's own premises", () => {
    open(authorisation({
      clinicID: "clinic-lumiere",
      premise: null,
      clinicPremise: { id: "clinic-lumiere", name: "Lumière Clinic", address: "2 Notts Ave, Bondi Beach NSW 2026" },
    }));

    const v = field(/premises of administration/i).value;
    expect(v).toBe("Lumière Clinic, 2 Notts Ave, Bondi Beach NSW 2026");
    expect(v).not.toContain("Sarah Chen Aesthetics");
  });
```

**(b)** Replace the test named `"leaves premises blank for a clinic authorisation whose request is not loaded"` — the request is no longer what supplies the clinic:

```ts
  it("leaves premises blank for a clinic authorisation carrying no premises stamp", () => {
    // Pre-stamp authorisations (no backfill). Blank prompts the clinician; falling through to
    // the acting nurse's private practice would misattribute a clinic patient's legal document.
    open(authorisation({ clinicID: "clinic-lumiere", premise: null }));
    expect(field(/premises of administration/i).value).toBe("");
  });
```

**(c)** Leave the `requests = {}` Route tests alone — `routeForCapture` still reads the originating request.

- [ ] **Step 3: Run both test files to verify they fail**

```bash
cd ~/Documents/Aestheticx-marketing && npx vitest run \
  src/lib/demo/__tests__/direction-capture-prefill.test.ts \
  src/components/app/__tests__/DirectionDialog-prefill.test.tsx
```

Expected: FAIL — `premiseForCapture` does not accept a `clinicPremise` key (TS error), and the component still reads the clinic off the request.

- [ ] **Step 4: Change the resolver**

In `src/lib/demo/direction.ts`, replace the signature and clinic branch of `premiseForCapture` (`:147-160`):

```ts
export function premiseForCapture(input: {
  stamped: Premise | null | undefined;
  clinicID: string | null;
  clinicPremise: Premise | null | undefined;
  actingPremise: Premise | null;
}): string {
  if (input.clinicID) {
    return premiseDisplayLine(input.clinicPremise) ?? premiseDisplayLine(input.stamped) ?? "";
  }
  return premiseDisplayLine(input.stamped) ?? premiseDisplayLine(input.actingPremise) ?? "";
}
```

Update the JSDoc paragraph above it that explains where the clinic comes from, replacing the sentence about the originating request with:

```
 * The clinic's premises are STAMPED onto the authorisation at approval (approveRequest), not
 * looked up: firestore.rules makes clinics/{id} readable only to clinic members, so an
 * independent cooperating doctor exporting this same direction could not resolve them, and a
 * lookup would also show today's address on a months-old authorisation.
```

Then drop `ClinicRef` from the type import on `:9` — this was its only use in the file:

```ts
import type { AuthorisationRequest, DateOfBirth, EmergencyAuthorisation, EmergencyKind, MedicationItem, Premise } from "./types";
```

- [ ] **Step 5: Rewire the dialog**

In `src/components/app/DirectionDialog.tsx`, delete the `clinicContext` local (`:49`) and change the `premisesOfAdministration` prefill:

```tsx
      premisesOfAdministration: premiseForCapture({
        stamped: authorisation.premise,
        // A clinic authorisation must print the CLINIC's premises, never the acting nurse's own.
        // They are stamped at approval because clinics/{id} is readable only to clinic members —
        // an independent cooperating doctor exporting this direction could not read them.
        clinicID: authorisation.clinicID,
        clinicPremise: authorisation.clinicPremise,
        actingPremise: activePremise(actingProfile),
      }),
```

Keep the `const request = store.state.requests[authorisation.requestID];` line — `routeForCapture` still needs it — but update the comment above it, which currently claims the request carries the practice context, to mention only the line-item routes.

- [ ] **Step 6: Run both test files to verify they pass**

```bash
cd ~/Documents/Aestheticx-marketing && npx vitest run \
  src/lib/demo/__tests__/direction-capture-prefill.test.ts \
  src/components/app/__tests__/DirectionDialog-prefill.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Run the full web suite, lint and type check**

```bash
cd ~/Documents/Aestheticx-marketing && npm test && npx tsc --noEmit && npm run lint
```

Expected: all pass. If any other file still calls `premiseForCapture` with a `clinic:` key, `tsc` names it — fix it there.

- [ ] **Step 8: Commit**

```bash
cd ~/Documents/Aestheticx-marketing
git add src/lib/demo/direction.ts src/components/app/DirectionDialog.tsx \
  src/lib/demo/__tests__/direction-capture-prefill.test.ts \
  src/components/app/__tests__/DirectionDialog-prefill.test.tsx
git commit -m "fix(direction): read the clinic's premises from the authorisation stamp"
```

---

### Task 6: OpenSpec change + close the design caveat

**Files:**
- Create: `openspec/changes/direction-clinic-premise/proposal.md`
- Create: `openspec/changes/direction-clinic-premise/design.md`
- Create: `openspec/changes/direction-clinic-premise/tasks.md`
- Create: `openspec/changes/direction-clinic-premise/specs/direction-capture/spec.md`

- [ ] **Step 1: Write `proposal.md`**

The `direction-capture` capability already exists in `openspec/specs/direction-capture/spec.md` (synced when `direction-capture-autofill` was archived), so this is a **Modified** capability, not a new one.

```markdown
## Why

`direction-capture-autofill` made Premises of administration follow "clinic → stamped → acting
user", and filed a caveat against itself: in live the clinic branch resolves to nothing. The
clinic's street address lives only on `clinics/{clinicId}`, and no code in this repo reads that
collection — `mapAuthRequest` builds `{id, name}` with the name set to the raw clinic id, and
`ClinicRef.address` is documented as demo-only. So every live clinic export falls through to a
blank and the clinician retypes the clinic's address onto a legal document.

The approval PDF is unaffected because a Cloud Function renders it and resolves the clinic doc
server-side. The Clause 68C direction is rendered entirely client-side, so it has no such route.

A client-side read cannot close it. `firestore.rules` makes `clinics/{id}` readable only to
clinic members, but an **independent cooperating doctor** approving a clinic nurse's request is
not one — and doctors export directions too. A lookup would render the premises for the nurse
and permission-deny the doctor, producing two different legal documents for one authorisation.

## What Changes

- `approveRequest` (Cloud Functions repo) SHALL stamp the clinic's premises — id, name and
  address from `clinics/{clinicId}` — onto every authorisation it writes, as `clinicPremise`.
  The stamp is OMITTED when there is no clinic, no clinic doc, or no usable address.
- The capture dialog SHALL resolve a clinic authorisation's Premises of administration from that
  stamp instead of from the originating request's practice context.
- `mapAuthRequest` SHALL stop passing the raw clinic id off as the clinic's name. An id is a
  non-empty string, so it would print onto the direction AND satisfy the `missingDirectionFields`
  gate — the same defect class as the raw-uid prescriber name.
- An authorisation carrying no stamp SHALL keep leaving the field blank and gated. **No backfill:**
  writing today's clinic address onto a months-old authorisation would fake the snapshot the
  stamp exists to record.

## Capabilities

### Modified Capabilities
- `direction-capture`: the clinic branch of the Premises of administration precedence now names
  the authorisation's stamped clinic premises as its source, and pins the unstamped case.

### New Capabilities
<!-- None. -->

## Impact

- `src/lib/demo/types.ts` — `Authorisation.clinicPremise?: Premise`.
- `src/lib/firebase/mappers.ts` — `mapAuthorisation` maps the stamp; `mapAuthRequest` fails the
  clinic name closed.
- `src/lib/demo/direction.ts` — `premiseForCapture` takes `clinicPremise` in place of a `ClinicRef`.
- `src/lib/demo/backend.ts` — demo `approveRequest` stamps the same field, so demo and live
  resolve by one route.
- `src/components/app/DirectionDialog.tsx` — reads the stamp.
- **Requires a Cloud Functions change** (`domain.ts` + `index.ts`), shipped as its own PR. Safe in
  either merge order: an unstamped authorisation is indistinguishable from a pre-stamp one, so
  web-first is exactly today's behaviour.
- No `firestore.rules` change — `authorisations` is already `allow write: if false` and its read
  audience already covers every exporter. No PDF layout change.
```

- [ ] **Step 2: Write `specs/direction-capture/spec.md`**

A `MODIFIED` requirement must restate the requirement **in full** — the delta replaces it, so scenarios omitted here are dropped from the main spec.

```markdown
## MODIFIED Requirements

### Requirement: Premises of administration follows clinic, then stamp, then the acting user

The direction capture dialog SHALL resolve Premises of administration by the same precedence the
approval document uses: the clinic's premises when the authorisation has a clinic context, else
the premise stamped on the authorisation, else the acting user's currently selected premise
(selected → default → first). When the authorisation has a clinic context the acting user's own
premises SHALL NEVER be used. The clinic's premises SHALL be read from the stamp written onto the
authorisation at approval, never looked up at render time. The field SHALL remain editable.

#### Scenario: Clinic authorisation uses the stamped clinic premises

- **WHEN** a direction is captured for an authorisation with a clinic context
- **AND** the authorisation carries a stamped clinic premises
- **THEN** Premises of administration shows that clinic's name and address
- **AND** it does not show the acting clinician's own premises

#### Scenario: A stamped clinic premises with no name shows its address

- **WHEN** the stamped clinic premises carries an address but no name
- **THEN** Premises of administration shows the address alone

#### Scenario: Clinic authorisation with no stamped premises is left blank

- **WHEN** the authorisation has a clinic context but carries no stamped clinic premises
- **THEN** Premises of administration is blank and is reported as still needed
- **AND** the acting clinician's own premises are not substituted

#### Scenario: The clinic's identifier is never shown as its name

- **WHEN** the clinic's name cannot be resolved
- **THEN** the clinic identifier SHALL NOT be shown in its place on the direction

#### Scenario: Stamped premise wins for an independent authorisation

- **WHEN** a direction is captured for an independent authorisation with a stamped premise
- **THEN** Premises of administration shows that premise, not the acting user's selection

#### Scenario: Falls back to the acting user's selected premise

- **WHEN** a direction is captured for an independent authorisation with no stamped premise
- **AND** the acting user has a selected premise
- **THEN** Premises of administration shows that premise

#### Scenario: Falls back through default to first

- **WHEN** the acting user has no selected premise, or the selection names a premise that no
  longer exists
- **THEN** the default premise is used, and failing that the first premise on file

#### Scenario: Blank when nothing is available

- **WHEN** an independent authorisation has no stamped premise and the acting user has no
  premises
- **THEN** Premises of administration is blank and is reported as still needed
```

- [ ] **Step 3: Write `design.md` and `tasks.md`**

`design.md` may point at `docs/superpowers/specs/2026-07-18-direction-clinic-premise-design.md` for the full argument rather than restating it, but must carry the three decisions in its own words: stamp-not-lookup and why (the rules asymmetry plus snapshot semantics); the `Premise`-shaped field reusing `mapPremise`'s fail-closed behaviour; and no backfill.

`tasks.md` mirrors Tasks 1–5 of this plan as checked-off items, in the same `## N. Heading` / `- [x] N.1 …` style as the archived change.

**Leave the archived `direction-capture-autofill` alone** — its "Live caveat" stays accurate about *its* scope. This change closes it; it does not rewrite its history.

- [ ] **Step 4: Validate**

```bash
cd ~/Documents/Aestheticx-marketing && npx openspec validate direction-clinic-premise --strict
```

Expected: passes. If `openspec` is not on PATH, skip this step and check the file layout matches `openspec/changes/archive/2026-07-18-direction-capture-autofill/` exactly.

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/Aestheticx-marketing && git add openspec/changes/direction-clinic-premise
git commit -m "docs: openspec change for the clinic premises stamp"
```

---

### Task 7: Verify end to end in the demo, then open both PRs

**Files:** none (verification + delivery)

- [ ] **Step 1: Run the demo and check a clinic direction renders the premises**

```bash
cd ~/Documents/Aestheticx-marketing && npm run dev
```

Sign in at `/demo` as the Lumière clinic nurse, open a clinic patient with an approved authorisation, press Export direction, and confirm **Premises of administration** is prefilled `Lumière Clinic, 2 Notts Ave, Bondi Beach NSW 2026` and that "Still needed" does not list it. Confirm an independent authorisation still shows the nurse's own premise.

- [ ] **Step 2: Run the E2E suite**

```bash
cd ~/Documents/Aestheticx-marketing && npm run test:e2e
```

Expected: pass. The authorisation round-trip journeys cover the export path.

- [ ] **Step 3: Push and open the backend PR first**

```bash
cd ~/Documents/AestheticX && git push -u origin fix/direction-clinic-premise
gh pr create --title "feat(direction): stamp the clinic's premises onto authorisations" --body "$(cat <<'EOF'
## Summary

`approveRequest` now stamps the clinic's premises (`{id, name, address}` from `clinics/{clinicId}`) onto every authorisation it writes, as `clinicPremise`.

The NSW Clause 68C direction is rendered **client-side**, and `firestore.rules` makes `clinics/{id}` readable only to clinic members — so an independent cooperating doctor exporting the direction cannot resolve the clinic's address, while the requesting nurse can. Stamping reaches every exporter, because `/authorisations`' read audience is strictly wider, and it snapshots the address as at authorisation, which is what a legal document should record.

Mirrors the existing `directionPartyNames` stamp at the same write site, and the approval-PDF function which already reads the same clinic doc.

## Changes

- `domain.ts` — `AuthorisationDoc.clinicPremise?`, and a pure `clinicPremiseStamp` helper that omits the stamp when there is no clinic, no clinic doc, or no usable address.
- `index.ts` — one conditional read in the transaction's existing READ phase, one spread at the write site.

No `firestore.rules` change (`authorisations` is already `allow write: if false`). No backfill — future approvals only.

## Test plan

- [x] `clinicPremiseStamp` unit tests: trimmed stamp; omitted for no clinic / missing doc / blank / whitespace / non-string address; address-only stamp when the name is blank.
- [x] `npm test` and `npm run build` green.
- [ ] After deploy: approve a clinic request and confirm the authorisation doc carries `clinicPremise`.
EOF
)"
```

- [ ] **Step 4: Push and open the web PR**

```bash
cd ~/Documents/Aestheticx-marketing && git push -u origin fix/direction-clinic-premise
gh pr create --title "fix(direction): use the clinic's stamped premises on the Clause 68C direction" --body "$(cat <<'EOF'
## Summary

Closes the "Live caveat" that `direction-capture-autofill`'s Decision 1 filed against itself: in live, a clinic authorisation left **Premises of administration** blank, so the clinician retyped the clinic's address onto every direction.

The clinic's premises are now read from the `clinicPremise` stamp on the authorisation (written by the backend PR) instead of from the originating request, which never carried an address in live.

Also fails the clinic NAME closed. `mapAuthRequest` was passing the raw clinic id off as the clinic's name. That is invisible today only because the blank address suppresses rendering — adding an address without this would start printing `xY3kf9…, 12 Hall St Bondi` on a legal document, the same defect class as the raw-uid prescriber name.

## Changes

- `types.ts` / `mappers.ts` — `Authorisation.clinicPremise?: Premise`, mapped via the existing `mapPremise` (which already fails closed on a blank address); `mapAuthRequest` yields `name: ""` rather than the id.
- `direction.ts` — `premiseForCapture` takes `clinicPremise` instead of a `ClinicRef`. The precedence rule is unchanged: when `clinicID` is set the acting user's premises are never consulted, so an unstamped clinic authorisation stays blank rather than misattributing the nurse's private practice.
- `backend.ts` — demo `approveRequest` stamps the same field, so demo and live resolve by the same route.
- `DirectionDialog.tsx` — reads the stamp.

No backfill: pre-stamp authorisations behave exactly as today (blank and gated), pinned by a test.

## Test plan

- [x] `mapAuthorisation` carries / omits the stamp; `mapAuthRequest` clinic name is `""`.
- [x] `premiseForCapture`: stamped clinic renders "Name, Address"; address-only stamp renders the address; unstamped clinic authorisation yields blank; the clinic branch never consults `actingPremise`.
- [x] `DirectionDialog` prefills the premises for a stamped clinic authorisation and blanks an unstamped one.
- [x] Demo `approveRequest` stamps `clinicPremise` for clinic requests and omits it for independent ones.
- [x] `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run test:e2e` green.
- [x] Manually verified in the demo as the Lumière clinic nurse.

Depends on the backend PR for live behaviour; safe to merge in either order (unstamped is indistinguishable from pre-stamp, so web-first is exactly today's behaviour).
EOF
)"
```

---

## Notes for the reviewer

- **Task 2 has no unit test.** `index.ts` has none in this repo; the wiring is one read and one spread, and the logic it wires is fully covered in `domain.test.ts`. This is the same standard `directionPartyNames` and `patientName` were held to. Step 5 of that task exists because the read/write ordering is the one thing a type check cannot catch.
- **A clinic that relocates mid-authorisation** keeps the address as at approval on repeat administrations. This is the intended snapshot semantics, but it is a real clinical situation — confirm the expectation is "reissue after a move" rather than "the document tracks the clinic".
- **Out of scope, filed in the design:** `identitiesFromClaims` also sets the acting identity's clinic `name` to the raw clinic id, and unlike the request's copy that one *is* rendered — `dashboard/page.tsx:172` shows a live clinic user "Acting as nurse · `<rawClinicId>`". Separate fix, separate mechanism (a `clinics/{id}` read on hydrate, which the rules do permit for your own clinic).

# Direction Prescriber Contact Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stamp the prescriber's phone and principal place of practice onto every authorisation at approval, so a **nurse** exporting an NSW Clause 68C direction gets both fields prefilled instead of blank.

**Architecture:** `approveRequest` already reads the approving doctor's `users/{uid}` doc inside its approval transaction, and already spreads two sibling stamp helpers onto each authorisation it writes. This change adds a third peer helper and a third spread — no new read, no new write site. The web maps the new fields and prefers them over its existing profile lookup, falling back when unstamped.

**Tech Stack:** TypeScript, Firebase Cloud Functions (Admin SDK, Firestore transactions), vitest, Next.js/React, Testing Library.

## Global Constraints

- **Two repos.** Backend: `~/Documents/AestheticX` (git root is the iOS monorepo; sources under `backend/functions/`). Web: `/Users/zhendeng/Documents/Aestheticx-marketing`.
- **Backend branches off `fix/direction-clinic-premise`** (`e72ea1c`), which already carries `fix/direction-party-names` (`6605280`). Both siblings are committed. Branching off `main` or off party-names alone conflicts at the shared `tx.set`.
- **Web branches off `fix/direction-form-autofill`**, never `main` — that branch rewrites the `useState` initialiser Task 5 edits.
- **Follow the sibling shape:** one narrowly-named helper per Clause 68C concern, spread separately at the write site. Do not merge into, rename, or otherwise edit `directionPartyNames` or `clinicPremiseStamp`.
- **A stamp OMITS an unresolvable value, never defaults it.** The web reader treats any non-empty stamp as authoritative, so a placeholder would print onto the direction *and* pass the `missingDirectionFields` gate that exists to block exactly that.
- **No backfill.** Future approvals only. Existing authorisations keep today's behaviour.
- **Contact only.** Do not touch `directionPrescriberName` or `directionResponsibleProvider` — the prescriber *name* belongs to the party-names story. Do not touch `premiseForCapture` — premises belong to the clinic-premise story.
- **No `firestore.rules` change.** `authorisations` is already `allow write: if false`.
- Design doc: `docs/superpowers/specs/2026-07-18-direction-prescriber-contact-design.md`.

---

### Task 1: Backend — stamp prescriber contact at approval

**Files:**
- Modify: `backend/functions/src/domain.ts`, `backend/functions/src/index.ts`
- Test: `backend/functions/src/domain.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks. Sits beside `directionPartyNames(doctor, request)` and `clinicPremiseStamp(clinicId, clinic)`, already on the base branch.
- Produces: `prescriberContactStamp(doctor: Record<string, unknown>): { prescriberPhone?: string; prescriberPrincipalPlace?: string }`, and `AuthorisationDoc.prescriberPhone?` / `.prescriberPrincipalPlace?`. Tasks 3-5 consume the two Firestore field names.

- [ ] **Step 1: Create the branch off the sibling stack**

```bash
cd ~/Documents/AestheticX
git checkout fix/direction-clinic-premise && git status --short
git checkout -b fix/direction-prescriber-contact
git log --oneline -3
```

Expected: clean status; the three sibling commits `e72ea1c`, `41b54f2`, `6605280` at the tip. If `6605280` is missing you are on the wrong base — **stop**.

- [ ] **Step 2: Write the failing tests**

Add to `backend/functions/src/domain.test.ts`, after the existing `describe('directionPartyNames (Clause 68C stamps)', ...)` block. Add `prescriberContactStamp` to the import list from `./domain` at the top of the file.

```typescript
// Clause 68C prescriber contact (2026-07-18). Phone and principal place are stamped for the same
// reason as the party names: a nurse exporting the direction cannot read the doctor's users doc,
// so there is no render-time lookup available to them. Blank is OMITTED, never stamped empty —
// the web reader treats any non-empty stamp as authoritative and would stop there.
describe('prescriberContactStamp (Clause 68C)', () => {
  it('stamps the phone and principal place, trimmed', () => {
    expect(prescriberContactStamp({
      name: 'Dr Mia Chen',
      phone: '  02 9555 0100  ',
      principalPlace: '  88 Oxford St, Paddington NSW 2021  ',
    })).toEqual({
      prescriberPhone: '02 9555 0100',
      prescriberPrincipalPlace: '88 Oxford St, Paddington NSW 2021',
    })
  })

  // The two resolve INDEPENDENTLY: userAdmin requires principalPlace only of doctors NOT on a
  // clinic account, so a clinic-account doctor legitimately has none — and that must not
  // suppress a perfectly usable phone.
  it('omits each field independently when unusable', () => {
    const clinicDoctor = prescriberContactStamp({ name: 'Dr Mia Chen', phone: '02 9555 0100' })
    expect(clinicDoctor.prescriberPhone).toBe('02 9555 0100')
    expect(clinicDoctor).not.toHaveProperty('prescriberPrincipalPlace')

    const unusable = prescriberContactStamp({ phone: '   ', principalPlace: 42 })
    expect(unusable).not.toHaveProperty('prescriberPhone')
    expect(unusable).not.toHaveProperty('prescriberPrincipalPlace')
  })

  it('returns an empty object for a doctor doc with neither field', () => {
    expect(prescriberContactStamp({})).toEqual({})
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd ~/Documents/AestheticX/backend/functions && npx vitest run src/domain.test.ts
```

Expected: FAIL — `prescriberContactStamp is not a function`. Existing cases still pass.

- [ ] **Step 4: Add the two fields to `AuthorisationDoc`**

In `backend/functions/src/domain.ts`, inside `AuthorisationDoc`, after the sibling stamp fields:

```typescript
  /** Prescriber contact stamped at approval (2026-07-18) for the Clause 68C direction — a nurse
   *  exporting one cannot read the doctor's users doc, so it must be snapshotted here. Either is
   *  absent when the profile field is blank, and on authorisations approved before the stamp. */
  prescriberPhone?: string
  prescriberPrincipalPlace?: string
```

- [ ] **Step 5: Add the helper**

In the same file, immediately after `clinicPremiseStamp`:

```typescript
/**
 * The prescriber's contact details to stamp onto each authorisation at approval (2026-07-18) —
 * the Clause 68C "prescriber phone" and "principal place of practice".
 *
 * Stamped rather than resolved at render time because hydrate loads only the caller's own
 * users doc: a nurse exporting the direction has never loaded the prescriber's profile, and
 * neither listDoctors nor the request carries the contact. A legal document should also record
 * the prescriber as they were when the direction was authorised, not as they are today.
 *
 * Each field is OMITTED independently when unusable, never stamped empty. The web reader treats
 * any non-empty stamp as authoritative and stops there, so an empty stamp would both blank the
 * field on the document and satisfy the missingDirectionFields gate that exists to catch it.
 * Omitting instead lets the reader fall back to the prescriber's profile. Independence matters:
 * userAdmin requires principalPlace only of doctors NOT on a clinic account, so a clinic-account
 * doctor legitimately has none and must still stamp a usable phone.
 */
export function prescriberContactStamp(
  doctor: Record<string, unknown>,
): { prescriberPhone?: string; prescriberPrincipalPlace?: string } {
  // Firestore data is untrusted here: a legacy doc may hold a missing, blank or non-string value.
  const usable = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')
  const prescriberPhone = usable(doctor.phone)
  const prescriberPrincipalPlace = usable(doctor.principalPlace)
  return {
    ...(prescriberPhone ? { prescriberPhone } : {}),
    ...(prescriberPrincipalPlace ? { prescriberPrincipalPlace } : {}),
  }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
cd ~/Documents/AestheticX/backend/functions && npx vitest run src/domain.test.ts
```

Expected: PASS, all cases including the siblings'.

- [ ] **Step 7: Wire it into `approveRequest`**

In `backend/functions/src/index.ts`, add `prescriberContactStamp` to the existing import from `./domain`. That block is alphabetical, so it goes between `monthKey` and `sanitizeNoteAttachments`:

```typescript
  monthKey,
  prescriberContactStamp,
  sanitizeNoteAttachments,
```

Then add one spread in the `tx.set` inside `authorisations.forEach`, directly after the `clinicPremiseStamp` line:

```typescript
        ...prescriberContactStamp(doctorSnap.data() ?? {}),
```

`doctorSnap` is already read above for `directionPartyNames`, so this adds no read and does not disturb the transaction's read-before-write ordering.

- [ ] **Step 8: Verify the whole suite and the build**

```bash
cd ~/Documents/AestheticX/backend/functions && npm test && npm run build
```

Expected: all tests pass; `tsc` exits 0 with no output.

- [ ] **Step 9: Commit**

```bash
cd ~/Documents/AestheticX
git add backend/functions/src/domain.ts backend/functions/src/domain.test.ts backend/functions/src/index.ts
git commit -m "feat(direction): stamp prescriber phone and principal place at approval

A nurse exporting a Clause 68C direction cannot read the prescriber's
users doc — hydrate loads only the caller's own — so Prescriber phone and
Principal place of practice were blank in live and the export gate blocked
on them.

approveRequest now stamps both onto every authorisation it writes, beside
the party-name and clinic-premise stamps, snapshotting the prescriber as
they were when the direction was authorised. The doctor snapshot is
already read for the party names, so this adds no read.

Each field is omitted independently when unusable, so a clinic-account
doctor with no principal place still stamps a usable phone."
```

---

### Task 2: Web — openspec change proposal

**Files:**
- Create: `openspec/changes/direction-prescriber-contact/.openspec.yaml`
- Create: `openspec/changes/direction-prescriber-contact/proposal.md`
- Create: `openspec/changes/direction-prescriber-contact/specs/direction-capture/spec.md`
- Create: `openspec/changes/direction-prescriber-contact/tasks.md`

- [ ] **Step 1: Create the branch**

All remaining tasks run in the **web** repo. Branch off `fix/direction-form-autofill`, not `main`:

```bash
cd /Users/zhendeng/Documents/Aestheticx-marketing
git checkout -b fix/direction-prescriber-contact fix/direction-form-autofill
git log --oneline -1
```

Expected: the tip is `caf3be9 docs: sync direction-capture into the main specs` or a later commit on that branch. If it reads `f57f1e9` you branched off `main` — **stop and redo**.

- [ ] **Step 2: Write `.openspec.yaml`**

```yaml
schema: spec-driven
created: 2026-07-18
```

- [ ] **Step 3: Write `proposal.md`**

```markdown
## Why

`direction-capture-autofill` fixed three of the five blank capture fields and declared two an
explicit non-goal: **Prescriber phone** and **Principal place of practice** could not be fixed
in this repo. A nurse exporting a Clause 68C direction got both blank, because `hydrate.ts`
loads only the caller's own `users/{uid}` doc — the nurse never holds the prescriber's profile,
and neither `listDoctors` nor the authorisation document carried the contact.

The backend now closes that: `approveRequest` stamps `prescriberPhone` and
`prescriberPrincipalPlace` onto every authorisation it writes, snapshotting the prescriber as
they were when the direction was authorised. This change consumes the stamp.

## What Changes

- `mapAuthorisation` SHALL map `prescriberPhone` and `prescriberPrincipalPlace` when present.
- The capture dialog SHALL prefill both from the stamp, falling back to the prescriber's profile
  when unstamped — which live means only when the DOCTOR exports their own direction.
- The two fields SHALL resolve independently: a stamped phone with no stamped principal place
  yields the stamped phone and the profile's principal place.
- Both remain editable, and `missingDirectionFields` still gates export when both are blank.

## Capabilities

### Modified Capabilities
- `direction-capture`: prescriber phone and principal place gain a prefill source.

## Non-Goals

The prescriber **name** and its raw-uid defect are the party-names story, which owns its own
precedence chain (stamp → cooperation directory → demo accounts → `""`). The stamped clinic
premise is the clinic-premise story. Neither is touched here.

No backfill: authorisations approved before the stamp shipped keep today's behaviour.
```

- [ ] **Step 4: Write the delta spec `specs/direction-capture/spec.md`**

```markdown
## ADDED Requirements

### Requirement: Prescriber phone and principal place prefill from the approval stamp

The direction capture dialog SHALL prefill Prescriber phone and Principal place of practice from
the values stamped on the authorisation at approval. When a value is not stamped, it SHALL fall
back to the prescriber's profile. The two fields SHALL resolve independently, and both SHALL
remain editable.

#### Scenario: Stamped contact wins over the profile

- **WHEN** a direction is captured for an authorisation carrying stamped prescriber contact
- **THEN** Phone and Principal place of practice show the stamped values

#### Scenario: A nurse sees the stamped contact

- **WHEN** a nurse captures a direction and the prescriber's profile is not loaded
- **AND** the authorisation carries stamped prescriber contact
- **THEN** both fields are prefilled rather than blank

#### Scenario: Falls back to the prescriber profile when unstamped

- **WHEN** a direction is captured for an authorisation approved before the stamp shipped
- **AND** the prescriber's profile is loaded
- **THEN** both fields show the profile values, as they did before

#### Scenario: The two fields resolve independently

- **WHEN** the authorisation carries a stamped phone but no stamped principal place
- **THEN** Phone shows the stamp and Principal place of practice falls back to the profile

#### Scenario: Blank when neither source has a value

- **WHEN** nothing is stamped and the prescriber's profile is not loaded
- **THEN** both fields are blank and `missingDirectionFields` reports them, blocking export
```

- [ ] **Step 5: Write `tasks.md`**

```markdown
## 1. Consume the stamp

- [ ] 1.1 `Authorisation` gains `prescriberPhone?` / `prescriberPrincipalPlace?`
- [ ] 1.2 `mapAuthorisation` maps both, absent stamps staying absent
- [ ] 1.3 `prescriberContactForCapture` resolves stamp → profile, per field
- [ ] 1.4 `DirectionDialog` prefills from the resolver

## 2. Verify

- [ ] 2.1 Unit tests: mapper, resolver, dialog prefill for a nurse
- [ ] 2.2 `npm test` and `npm run lint` clean
```

- [ ] **Step 6: Commit**

```bash
git add openspec/changes/direction-prescriber-contact
git commit -m "docs: propose direction-prescriber-contact

Closes the phone / principal-place half of the non-goal that
direction-capture-autofill declared, now that approveRequest stamps
prescriber contact onto each authorisation at approval."
```

---

### Task 3: Web — map the stamped fields

**Files:**
- Modify: `src/lib/demo/types.ts:166`, `src/lib/firebase/mappers.ts:139`
- Test: `src/lib/firebase/__tests__/mappers.test.ts`

**Interfaces:**
- Consumes: the Firestore field names `prescriberPhone` / `prescriberPrincipalPlace` written by Task 1.
- Produces: `Authorisation.prescriberPhone?: string`, `Authorisation.prescriberPrincipalPlace?: string`, populated by `mapAuthorisation`. Tasks 4 and 5 depend on both.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/firebase/__tests__/mappers.test.ts`, inside the existing `describe("mapAuthorisation", ...)` block:

```typescript
  // Stamped by approveRequest so a nurse — who cannot read the prescriber's users doc — can
  // still render the Clause 68C contact lines. Absent stamps must stay absent, not become "".
  it("carries the stamped prescriber contact", () => {
    const a = mapAuthorisation("a1", {
      requestId: "r1", patientId: "p1", doctorId: "u-voss", nurseId: "u-sarah",
      clinicId: null, repeatsRemaining: 5, expiresAtMillis: 1800000000000,
      medication: { name: "Botox", dosage: "20", category: "neurotoxin", unit: "units", areas: ["Glabella"] },
      prescriberPhone: "02 9555 0100",
      prescriberPrincipalPlace: "88 Oxford St, Paddington NSW 2021",
    });
    expect(a.prescriberPhone).toBe("02 9555 0100");
    expect(a.prescriberPrincipalPlace).toBe("88 Oxford St, Paddington NSW 2021");
  });

  it("leaves prescriber contact absent on an unstamped authorisation", () => {
    const a = mapAuthorisation("a1", {
      requestId: "r1", patientId: "p1", doctorId: "u-voss", nurseId: "u-sarah",
      clinicId: null, repeatsRemaining: 5, expiresAtMillis: 1800000000000,
      medication: { name: "Botox", dosage: "20", category: "neurotoxin", unit: "units", areas: ["Glabella"] },
    });
    expect(a).not.toHaveProperty("prescriberPhone");
    expect(a).not.toHaveProperty("prescriberPrincipalPlace");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/lib/firebase/__tests__/mappers.test.ts
```

Expected: FAIL — `prescriberPhone` is `undefined`, and the type does not exist.

- [ ] **Step 3: Add the fields to the `Authorisation` type**

In `src/lib/demo/types.ts`, inside `interface Authorisation`, after the `premise?: Premise | null;` line:

```typescript
  /** Prescriber contact stamped at approval by approveRequest (Clause 68C direction). Absent on
   *  authorisations approved before the stamp shipped, and when the profile field was blank. */
  prescriberPhone?: string;
  prescriberPrincipalPlace?: string;
```

- [ ] **Step 4: Map them**

In `src/lib/firebase/mappers.ts`, inside `mapAuthorisation`, after the `const premise = mapPremise(data.premise);` line:

```typescript
  const prescriberPhone = str(data.prescriberPhone);
  const prescriberPrincipalPlace = str(data.prescriberPrincipalPlace);
```

and in the returned object, after the `...(premise ? { premise } : {}),` line:

```typescript
    ...(prescriberPhone ? { prescriberPhone } : {}),
    ...(prescriberPrincipalPlace ? { prescriberPrincipalPlace } : {}),
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx vitest run src/lib/firebase/__tests__/mappers.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/demo/types.ts src/lib/firebase/mappers.ts src/lib/firebase/__tests__/mappers.test.ts
git commit -m "feat(direction): map stamped prescriber contact onto Authorisation

approveRequest now stamps prescriberPhone and prescriberPrincipalPlace at
approval. Map both, keeping absent stamps absent so a reader can tell
never-stamped from stamped-blank and fall back accordingly."
```

---

### Task 4: Web — the capture resolver

**Files:**
- Modify: `src/lib/demo/direction.ts`
- Test: `src/lib/demo/__tests__/direction.test.ts`

**Interfaces:**
- Consumes: `Authorisation.prescriberPhone` / `.prescriberPrincipalPlace` from Task 3.
- Produces: `prescriberContactForCapture(authorisation, prescriberProfile): { prescriberPhone: string; prescriberPrincipalPlace: string }`. Task 5 spreads this return directly into the captured-fields state.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/demo/__tests__/direction.test.ts`, and add `prescriberContactForCapture` to the existing import from `@/lib/demo/direction` at the top of that file:

```typescript
describe("prescriberContactForCapture", () => {
  const profile = {
    ahpra: "", abn: "", phone: "0412 000 111", address: "",
    principalPlace: "Profile Rooms, 1 Profile St", premises: [],
  };
  const blankProfile = { ...profile, phone: "", principalPlace: "" };

  it("prefers the stamp so every export of the direction reads alike", () => {
    expect(prescriberContactForCapture(
      { prescriberPhone: "02 9555 0100", prescriberPrincipalPlace: "88 Oxford St" },
      profile,
    )).toEqual({ prescriberPhone: "02 9555 0100", prescriberPrincipalPlace: "88 Oxford St" });
  });

  // A nurse in live holds no prescriber profile — the stamp is the only source.
  it("uses the stamp when the prescriber profile is blank", () => {
    expect(prescriberContactForCapture(
      { prescriberPhone: "02 9555 0100", prescriberPrincipalPlace: "88 Oxford St" },
      blankProfile,
    )).toEqual({ prescriberPhone: "02 9555 0100", prescriberPrincipalPlace: "88 Oxford St" });
  });

  it("falls back to the profile on an authorisation approved before the stamp", () => {
    expect(prescriberContactForCapture({}, profile)).toEqual({
      prescriberPhone: "0412 000 111",
      prescriberPrincipalPlace: "Profile Rooms, 1 Profile St",
    });
  });

  // A clinic-account doctor has no principalPlace to stamp; that must not suppress the phone.
  it("resolves the two fields independently", () => {
    expect(prescriberContactForCapture({ prescriberPhone: "02 9555 0100" }, profile)).toEqual({
      prescriberPhone: "02 9555 0100",
      prescriberPrincipalPlace: "Profile Rooms, 1 Profile St",
    });
  });

  it("returns blanks when neither source has a value, so the export gate still reports", () => {
    expect(prescriberContactForCapture({}, blankProfile)).toEqual({
      prescriberPhone: "", prescriberPrincipalPlace: "",
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/lib/demo/__tests__/direction.test.ts
```

Expected: FAIL with `prescriberContactForCapture is not a function`.

- [ ] **Step 3: Implement the resolver**

In `src/lib/demo/direction.ts`, add `Authorisation` to the existing `import type { ... } from "./types";` list, then add this function immediately after `premiseForCapture`:

```typescript
/**
 * Prescriber contact for the capture dialog: the value STAMPED on the authorisation at approval
 * (approveRequest snapshots the prescriber's profile), else the prescriber's profile when it
 * happens to be loaded — which live means only when the DOCTOR exports their own direction.
 *
 * The stamp wins so every export of the same direction reads alike, whoever runs it. The two
 * fields resolve independently: a clinic-account doctor has no principal place to stamp, and
 * that must not drag the stamped phone back to the profile. Both blank leaves the fields empty
 * and missingDirectionFields blocks the export — the correct failure on a legal document.
 */
export function prescriberContactForCapture(
  authorisation: Pick<Authorisation, "prescriberPhone" | "prescriberPrincipalPlace">,
  prescriberProfile: UserProfile,
): { prescriberPhone: string; prescriberPrincipalPlace: string } {
  return {
    prescriberPhone: authorisation.prescriberPhone?.trim() || prescriberProfile.phone,
    prescriberPrincipalPlace:
      authorisation.prescriberPrincipalPlace?.trim() || prescriberProfile.principalPlace,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/lib/demo/__tests__/direction.test.ts
```

Expected: PASS, all five cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/demo/direction.ts src/lib/demo/__tests__/direction.test.ts
git commit -m "feat(direction): resolve prescriber contact from the stamp, then the profile

The stamp wins so the same direction reads alike whoever exports it, and
the two fields resolve independently so a clinic-account doctor's stamped
phone survives having no stamped principal place."
```

---

### Task 5: Web — prefill the capture dialog from the resolver

**Files:**
- Modify: `src/components/app/DirectionDialog.tsx:33-53`
- Test: `src/components/app/__tests__/DirectionDialog-prefill.test.tsx`

**Interfaces:**
- Consumes: `prescriberContactForCapture` from Task 4.

- [ ] **Step 1: Write the failing test**

Add to `src/components/app/__tests__/DirectionDialog-prefill.test.tsx`, inside `describe("DirectionDialog prefills", ...)`. The mocked identity is already a nurse and `profiles` holds no `u-voss` entry, so this reproduces the live nurse case exactly:

```typescript
  // The reported defect: a nurse holds no prescriber profile, so both Clause 68C contact fields
  // were blank and the export gate blocked. The approval stamp is now their source.
  it("prefills prescriber contact from the stamp when the nurse has no prescriber profile", () => {
    open(authorisation({
      prescriberPhone: "02 9555 0100",
      prescriberPrincipalPlace: "88 Oxford St, Paddington NSW 2021",
    }));
    expect(field("Phone").value).toBe("02 9555 0100");
    expect(field("Principal place of practice").value).toBe("88 Oxford St, Paddington NSW 2021");
  });

  it("falls back to the prescriber profile when the authorisation is unstamped", () => {
    profiles["u-voss"] = {
      ahpra: "", abn: "", phone: "0412 000 111", address: "",
      principalPlace: "Profile Rooms, 1 Profile St", premises: [],
    };
    open(authorisation());
    expect(field("Phone").value).toBe("0412 000 111");
    expect(field("Principal place of practice").value).toBe("Profile Rooms, 1 Profile St");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/components/app/__tests__/DirectionDialog-prefill.test.tsx
```

Expected: FAIL — the first case reports `""` for both fields. The second already passes (it is the existing behaviour, pinned so the fallback is not lost).

- [ ] **Step 3: Wire the resolver in**

In `src/components/app/DirectionDialog.tsx`, add `prescriberContactForCapture` to the import list from `@/lib/demo/direction`, then replace the comment block and `useState` initialiser (lines 33-53) with:

```typescript
  // Capture fields prefill from data the app already holds, so the clinician doesn't retype it
  // onto a legal document. All stay editable.
  //
  // prescriberPhone / prescriberPrincipalPlace come from the stamp approveRequest writes at
  // approval, falling back to the prescriber's profile — which live resolves only when the
  // DOCTOR exports their own direction, since hydrate loads just the caller's own users doc.
  // Authorisations approved before the stamp shipped therefore behave exactly as they did.
  const [captured, setCaptured] = useState<CapturedDirectionFields>(() => {
    const actingProfile = store.profileForUser(identity?.user.id ?? "");
    return {
      ...DEFAULT_CAPTURED_FIELDS,
      ...prescriberContactForCapture(authorisation, store.profileForUser(authorisation.doctorID)),
      // Stamped premise, else where the acting user is currently practising.
      premisesOfAdministration: premiseForCapture(authorisation.premise, actingProfile),
      // The route was chosen per line item at request time — recover it rather than ask again.
      route: routeForCapture(authorisation.medication, store.state.requests[authorisation.requestID]),
    };
  });
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/components/app/__tests__/DirectionDialog-prefill.test.tsx
```

Expected: PASS, including the pre-existing premise, route and PRN cases.

- [ ] **Step 5: Run the full suite and the linter**

```bash
npm test && npm run lint
```

Expected: all tests pass; eslint reports no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/app/DirectionDialog.tsx src/components/app/__tests__/DirectionDialog-prefill.test.tsx
git commit -m "fix(direction): prefill prescriber contact for a nurse exporting a direction

A nurse held no prescriber profile, so Prescriber phone and Principal
place of practice were blank in live and missingDirectionFields blocked
the export. Both now read the approval stamp first, falling back to the
profile so the doctor's own export and pre-stamp authorisations are
unchanged.

Closes the phone / principal-place non-goal declared by
direction-capture-autofill."
```

---

## Done when

- Backend: `prescriberContactStamp` is unit-tested and spread at the authorisation write site beside its two siblings; `npm test` and `npm run build` clean.
- Web: a nurse opening the capture dialog on a stamped authorisation sees both Clause 68C contact fields prefilled; unstamped authorisations fall back to the profile; `npm test` and `npm run lint` clean.

## Open items

- **Landing order.** The three backend stamp branches are a stack — party names, clinic premise, then this. They must land in that order; each adds a spread to the same `tx.set`.
- **No backend openspec entry.** Neither sibling created one, though `~/Documents/AestheticX/openspec/changes` exists and is used elsewhere. This plan follows that precedent. If either sibling adds one before landing, extend it rather than leaving this undocumented.

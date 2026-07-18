# Direction Prescriber Contact Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stamp the prescriber's phone and principal place of practice onto every authorisation at approval, so a **nurse** exporting an NSW Clause 68C direction gets both fields prefilled instead of blank.

**Architecture:** `approveRequest` already reads the approving doctor's `users/{uid}` doc inside its approval transaction, and a sibling change already spreads a pure helper's output onto each authorisation it writes. This change extends that helper with two more fields — no new read, no new write site. The web maps the new fields and prefers them over its existing profile lookup, falling back when unstamped.

**Tech Stack:** TypeScript, Firebase Cloud Functions (Admin SDK, Firestore transactions), vitest, Next.js/React, Testing Library.

## Global Constraints

- **Hard precondition:** branch `fix/direction-party-names` in `~/Documents/AestheticX` must be **committed and landed** before Task 1 starts. It is uncommitted WIP as of 2026-07-18. Do not edit its working tree.
- **Two repos.** Backend: `~/Documents/AestheticX` (git root; sources under `backend/functions/`). Web: this repo.
- **Web branches off `fix/direction-form-autofill`**, never `main` — that branch rewrites the `useState` initialiser Task 6 edits.
- **A stamp OMITS an unresolvable value, never defaults it.** The web reader treats any non-empty stamp as authoritative, so a placeholder would print onto the direction *and* pass the `missingDirectionFields` gate that exists to block exactly that.
- **No backfill.** Future approvals only. Existing authorisations keep today's behaviour.
- **Contact only.** Do not touch `directionPrescriberName` or `directionResponsibleProvider` — the prescriber *name* belongs to the party-names story.
- **No `firestore.rules` change.** `authorisations` is already `allow write: if false`.
- Design doc: `docs/superpowers/specs/2026-07-18-direction-prescriber-contact-design.md`.

---

### Task 1: Backend — extend the stamp helper with prescriber contact

The existing `...partyNames` spread in `approveRequest` spreads the **whole** returned object, so extending the helper needs no `index.ts` change at all.

**Files:**
- Modify: `backend/functions/src/domain.ts`
- Test: `backend/functions/src/domain.test.ts`

**Interfaces:**
- Consumes: `directionPartyNames(doctor, request)` from `fix/direction-party-names`, and its private `usable()` coercion.
- Produces: `directionPartyNames` additionally returns `prescriberPhone?: string` and `prescriberPrincipalPlace?: string`. `AuthorisationDoc` gains both as optional fields.

- [ ] **Step 1: Verify the precondition**

```bash
cd ~/Documents/AestheticX
git log --oneline -5 | grep -i "party names" || echo "NOT LANDED — STOP"
git status --short backend/functions
```

Expected: the party-names work is committed (a matching log line, clean status). If it is still uncommitted, **stop and report** — do not proceed.

- [ ] **Step 2: Create the branch**

```bash
cd ~/Documents/AestheticX
git checkout -b fix/direction-prescriber-contact
```

- [ ] **Step 3: Write the failing tests**

Add these two cases inside the existing `describe('directionPartyNames (Clause 68C stamps)', ...)` block in `backend/functions/src/domain.test.ts`, after the last existing case:

```typescript
  // Prescriber contact rides on the same stamp: a nurse exporting the direction cannot read the
  // doctor's users doc, so phone and principal place must be snapshotted at approval too.
  it('stamps the prescriber phone and principal place, trimmed', () => {
    expect(directionPartyNames(
      {
        name: 'Dr Mia Chen',
        phone: '  02 9555 0100  ',
        principalPlace: '  88 Oxford St, Paddington NSW 2021  ',
      },
      {},
    )).toMatchObject({
      prescriberPhone: '02 9555 0100',
      prescriberPrincipalPlace: '88 Oxford St, Paddington NSW 2021',
    })
  })

  // The two resolve INDEPENDENTLY: a clinic-account doctor has no principalPlace to stamp
  // (userAdmin requires it only of non-clinic doctors), and that must not suppress the phone.
  it('omits each contact field independently when unusable', () => {
    const clinicDoctor = directionPartyNames({ name: 'Dr Mia Chen', phone: '02 9555 0100' }, {})
    expect(clinicDoctor.prescriberPhone).toBe('02 9555 0100')
    expect(clinicDoctor).not.toHaveProperty('prescriberPrincipalPlace')

    const unusable = directionPartyNames({ phone: '   ', principalPlace: 42 }, {})
    expect(unusable).not.toHaveProperty('prescriberPhone')
    expect(unusable).not.toHaveProperty('prescriberPrincipalPlace')
  })
```

- [ ] **Step 4: Run the tests to verify they fail**

```bash
cd ~/Documents/AestheticX/backend/functions && npx vitest run src/domain.test.ts
```

Expected: FAIL — the two new cases report `prescriberPhone: undefined` / missing properties present. The existing party-name cases still pass.

- [ ] **Step 5: Add the two fields to `AuthorisationDoc`**

In `backend/functions/src/domain.ts`, immediately after the `nurseName?: string` line inside `AuthorisationDoc`:

```typescript
  /** Prescriber contact stamped at approval (2026-07-18) for the Clause 68C direction — a nurse
   *  exporting one cannot read the doctor's users doc, so it must be snapshotted here. Either is
   *  absent when the profile field is blank, and on authorisations approved before the stamp. */
  prescriberPhone?: string
  prescriberPrincipalPlace?: string
```

- [ ] **Step 6: Extend the helper**

In the same file, widen `directionPartyNames`'s return type and body. Replace the signature and `return` statement with:

```typescript
export function directionPartyNames(
  doctor: Record<string, unknown>,
  request: { nurseName?: unknown },
): {
  doctorName?: string; nurseName?: string
  prescriberPhone?: string; prescriberPrincipalPlace?: string
} {
  // Firestore data is untrusted here: a legacy doc may hold a missing, blank or non-string value.
  const usable = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')
  const doctorName = usable(doctor.businessName) || usable(doctor.name)
  const nurseName = usable(request.nurseName)
  const prescriberPhone = usable(doctor.phone)
  const prescriberPrincipalPlace = usable(doctor.principalPlace)
  return {
    ...(doctorName ? { doctorName } : {}),
    ...(nurseName ? { nurseName } : {}),
    ...(prescriberPhone ? { prescriberPhone } : {}),
    ...(prescriberPrincipalPlace ? { prescriberPrincipalPlace } : {}),
  }
}
```

Then extend its doc comment — append this paragraph before the closing `*/`:

```
 * Prescriber phone and principal place ride along for the same reason: they are Clause 68C
 * fields the nurse cannot look up at export time. Each is omitted independently, so a
 * clinic-account doctor with no principal place still stamps a usable phone.
```

- [ ] **Step 7: Run the tests to verify they pass**

```bash
cd ~/Documents/AestheticX/backend/functions && npx vitest run src/domain.test.ts
```

Expected: PASS, all cases including the pre-existing party-name ones.

- [ ] **Step 8: Verify the whole suite and the build**

```bash
cd ~/Documents/AestheticX/backend/functions && npm test && npm run build
```

Expected: all tests pass; `tsc` exits 0 with no output.

- [ ] **Step 9: Commit**

```bash
cd ~/Documents/AestheticX
git add backend/functions/src/domain.ts backend/functions/src/domain.test.ts
git commit -m "feat(direction): stamp prescriber phone and principal place at approval

A nurse exporting a Clause 68C direction cannot read the prescriber's
users doc — hydrate loads only the caller's own — so Prescriber phone and
Principal place of practice were blank in live and the export gate blocked
on them.

Both now ride on the approval stamp beside the party names, snapshotting
the prescriber as they were when the direction was authorised. Each is
omitted independently when unusable, so a clinic-account doctor with no
principal place still stamps a usable phone.

approveRequest already spreads the helper's whole return, so the write
site is unchanged."
```

---

### Task 2: Backend — rename `directionPartyNames` to `clause68CStamps`

Now that the helper returns contact details, its name is inaccurate. Mechanical rename, tests stay green.

**Files:**
- Modify: `backend/functions/src/domain.ts`, `backend/functions/src/index.ts`
- Test: `backend/functions/src/domain.test.ts`

**Interfaces:**
- Consumes: `directionPartyNames` from Task 1.
- Produces: `clause68CStamps(doctor, request)` — same signature and return type. No other module may reference the old name after this task.

- [ ] **Step 1: Rename every occurrence**

```bash
cd ~/Documents/AestheticX/backend/functions
grep -rl 'directionPartyNames' src | xargs sed -i '' 's/directionPartyNames/clause68CStamps/g'
grep -rn 'directionPartyNames' src || echo "clean"
```

Expected: `clean`.

- [ ] **Step 2: Rename the local variable in `approveRequest`**

`sed` renamed the function but not the local. In `backend/functions/src/index.ts`, replace the three `partyNames` references:

```typescript
    const stamps = clause68CStamps(doctorSnap.data() ?? {}, request)
    // The emergency-authorisation card and the audit actor badge are display surfaces, not
    // Clause 68C party lines, so they keep the generic placeholder rather than showing nothing.
    const doctorName = stamps.doctorName ?? 'Doctor'
```

and in the `tx.set` call:

```typescript
        ...stamps,
```

- [ ] **Step 3: Update the helper's doc comment heading**

In `backend/functions/src/domain.ts`, the comment opens by describing party names only. Replace its first sentence with:

```
 * Everything approveRequest stamps onto an authorisation for the Clause 68C direction: the
 * approving doctor (the PRESCRIBER) and requesting nurse (the RESPONSIBLE PROVIDER) by name,
 * plus the prescriber's phone and principal place of practice.
```

- [ ] **Step 4: Run the tests and the build**

```bash
cd ~/Documents/AestheticX/backend/functions && npm test && npm run build
```

Expected: all tests pass; `tsc` exits 0. No behaviour changed.

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/AestheticX
git add backend/functions/src/domain.ts backend/functions/src/domain.test.ts backend/functions/src/index.ts
git commit -m "refactor(direction): rename directionPartyNames to clause68CStamps

The helper now returns prescriber phone and principal place as well as
the party names, so its name no longer describes it. clause68CStamps
names the responsibility: the fields approveRequest stamps onto an
authorisation for the Clause 68C direction.

Pure rename — no behaviour change."
```

- [ ] **Step 6: Update the memory file**

`~/.claude/projects/-Users-zhendeng-Documents-Aestheticx-marketing/memory/clause-68c-party-names.md` names `directionPartyNames(doctorDoc, request)` as the backend helper. Update that sentence to `clause68CStamps(doctorDoc, request)` and note it now also carries `prescriberPhone` / `prescriberPrincipalPlace`. Leave the rest of the file unchanged.

---

### Task 3: Web — openspec change proposal

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
precedence chain (stamp → cooperation directory → demo accounts → `""`). Untouched here.

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

### Task 4: Web — map the stamped fields

**Files:**
- Modify: `src/lib/demo/types.ts:166`, `src/lib/firebase/mappers.ts:139`
- Test: `src/lib/firebase/__tests__/mappers.test.ts`

**Interfaces:**
- Produces: `Authorisation.prescriberPhone?: string`, `Authorisation.prescriberPrincipalPlace?: string`, populated by `mapAuthorisation`. Tasks 5 and 6 depend on both.

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

### Task 5: Web — the capture resolver

**Files:**
- Modify: `src/lib/demo/direction.ts`
- Test: `src/lib/demo/__tests__/direction.test.ts`

**Interfaces:**
- Consumes: `Authorisation.prescriberPhone` / `.prescriberPrincipalPlace` from Task 4.
- Produces: `prescriberContactForCapture(authorisation, prescriberProfile): { prescriberPhone: string; prescriberPrincipalPlace: string }`. Task 6 spreads this return directly into the captured-fields state.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/demo/__tests__/direction.test.ts`:

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

Add `prescriberContactForCapture` to the existing import from `@/lib/demo/direction` at the top of that file.

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

### Task 6: Web — prefill the capture dialog from the resolver

**Files:**
- Modify: `src/components/app/DirectionDialog.tsx:33-53`
- Test: `src/components/app/__tests__/DirectionDialog-prefill.test.tsx`

**Interfaces:**
- Consumes: `prescriberContactForCapture` from Task 5.

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

- Backend: `clause68CStamps` returns four fields, unit-tested; `approveRequest` stamps them; `npm test` and `npm run build` clean.
- Web: a nurse opening the capture dialog on a stamped authorisation sees both Clause 68C contact fields prefilled; unstamped authorisations fall back to the profile; `npm test` and `npm run lint` clean.
- The `clause-68c-party-names` memory names `clause68CStamps`.

## Open item

The sibling `fix/direction-party-names` change created **no** openspec entry in the AestheticX monorepo, though that repo does use openspec (`~/Documents/AestheticX/openspec/changes`). This plan follows that precedent and adds none for the backend either. If the party-names story adds one before landing, extend it rather than leaving this undocumented.

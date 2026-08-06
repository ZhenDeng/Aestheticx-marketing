# Request Location Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an independent nurse choose which premise of administration is stamped on an authorisation request, on the request form itself, instead of inheriting a selection made earlier on another page.

**Architecture:** An optional `premiseId` threads through the existing store → backend reducer path. The reducer resolves it against the caller's profile and stamps the full `{id, name, address}`; when absent, behaviour is byte-for-byte today's `activePremise()`. The web already writes the `authRequests` document itself, so no Cloud Function changes — but `firestore.rules` currently freezes `premise` after creation, so the edit/resubmit branches must be widened (with the create-path guards ported onto them) and deployed before the web change merges.

**Tech Stack:** Next.js (App Router) + React 19, TypeScript, Vitest + Testing Library (web); Firestore security rules + `@firebase/rules-unit-testing` under `firebase emulators:exec` (backend).

## Global Constraints

- **Two repos, fixed order.** Backend (`/Users/zhendeng/Documents/AestheticX/backend`) rules change deploys FIRST; web (`/Users/zhendeng/Documents/Aestheticx-marketing`) merges after. Web-first makes live "Save changes" fail with permission-denied while demo mode keeps working and hides it.
- **Clinic context always stamps `null`.** A clinic-context request signals "use the clinic's address" by carrying no premise. A supplied `premiseId` must be ignored there, in the reducer AND in the rules.
- **Never stamp a blank address.** An unknown/deleted `premiseId` falls back to `activePremise(profile)`; a missing address blocks the direction export downstream.
- **Premise shape is exactly `{id, name, address}`, all strings.** No extra keys — `requestPremiseShapeOK()` enforces it and must now also guard updates.
- **Independent nurse only.** The picker renders only for `role === "nurse"` && `context.kind === "independent"`.
- Spec: `docs/superpowers/specs/2026-08-06-request-location-picker-design.md`.

---

### Task 1: Widen the rules so a nurse may re-stamp her own open request (BACKEND REPO)

Repo: `/Users/zhendeng/Documents/AestheticX/backend`

**Files:**
- Modify: `firestore.rules:319-334` (the two nurse `allow update` branches on `authRequests`)
- Test: `rules-tests/firestore.rules.test.js:660-700` (the `authRequests stamped premise` describe block)

**Interfaces:**
- Consumes: existing rule helpers `requestPremiseShapeOK()` (line 271) and `clinicRequestCarriesNoPremise()` (line 289) — both currently used on `allow create` only.
- Produces: nothing importable; Task 4's live edit path depends on this being deployed.

- [ ] **Step 1: Rewrite the premise-immutability tests to the new contract**

In `rules-tests/firestore.rules.test.js`, replace the two immutability tests with re-stamp tests and add the guard tests. Replace this block:

```js
  it('premise is immutable on resubmit (needsEdit → pending)', () =>
    assertFails(updateDoc(doc(ctx('sarah'), 'authRequests/prem-edit'),
      { items: [{ name: 'Botox' }], status: 'pending', premise: REWRITTEN })))

  it('premise is immutable on an in-place items edit', () =>
    assertFails(updateDoc(doc(ctx('sarah'), 'authRequests/prem-pending'),
      { items: [{ name: 'Botox' }], premise: REWRITTEN })))
```

with:

```js
  // 2026-08-06: the raising nurse may RE-STAMP the premise while the request is still hers
  // to edit (pending / needsEdit). Round 6's intent is preserved — a later premise edit or
  // delete in the profile still cannot rewrite an issued request, because profile writes
  // never touch request docs and an approved request fails the status precondition.
  it('nurse re-stamps the premise on her own needsEdit request (resubmit)', () =>
    assertSucceeds(updateDoc(doc(ctx('sarah'), 'authRequests/prem-edit'),
      { items: [{ name: 'Botox', route: 'intramuscular' }], status: 'pending', premise: REWRITTEN })))

  it('nurse re-stamps the premise on her own pending request (edit in place)', () =>
    assertSucceeds(updateDoc(doc(ctx('sarah'), 'authRequests/prem-pending'),
      { items: [{ name: 'Botox', route: 'intramuscular' }], premise: REWRITTEN })))

  it('the re-stamp is shape-guarded like the create path', async () => {
    await assertFails(updateDoc(doc(ctx('sarah'), 'authRequests/prem-pending'),
      { items: [{ name: 'Botox' }], premise: 'not-a-map' }))
    await assertFails(updateDoc(doc(ctx('sarah'), 'authRequests/prem-pending'),
      { items: [{ name: 'Botox' }], premise: { id: 'p-2', name: 'No address' } }))
    await assertFails(updateDoc(doc(ctx('sarah'), 'authRequests/prem-pending'),
      { items: [{ name: 'Botox' }], premise: { ...REWRITTEN, sneaky: true } }))
  })

  it('another nurse still cannot re-stamp my request', () =>
    assertFails(updateDoc(doc(ctx('ruby'), 'authRequests/prem-pending'),
      { items: [{ name: 'Botox' }], premise: REWRITTEN })))
```

Keep the existing `premise is immutable on withdraw` and `a premise cannot be removed after create either` tests exactly as they are — withdraw stays status-only and removal stays forbidden.

- [ ] **Step 2: Add the clinic-context re-stamp test**

Append inside the same `describe` block:

```js
  // A clinic-context request must never gain the nurse's private premise, on update either —
  // clinicRequestCarriesNoPremise() has to guard the update branches, not just create.
  it('a clinic-context request cannot gain a private premise on edit', async () => {
    await assertSucceeds(setDoc(doc(ctx('sarahAtClinic'), 'authRequests/prem-clinic'),
      { ...ok, nurseId: 'sarahAtClinic', clinicId: 'clinic-lumiere', patientId: 'p-clinic' }))
    await assertFails(updateDoc(doc(ctx('sarahAtClinic'), 'authRequests/prem-clinic'),
      { items: [{ name: 'Botox' }], premise: REWRITTEN }))
  })
```

- [ ] **Step 3: Run the rules tests to verify they fail**

Run: `cd /Users/zhendeng/Documents/AestheticX/backend && npx firebase emulators:exec --only firestore "npx vitest run rules-tests/firestore.rules.test.js"`
Expected: FAIL — the two re-stamp tests fail because `hasOnly` excludes `premise`.

- [ ] **Step 4: Widen the two update branches**

In `firestore.rules`, in the resubmit branch (currently line 319-323), add the two guards and admit `premise`:

```
      // Nurse resubmits after require-edit; approve/requireEdit are Function-only.
      // 2026-08-06: 'premise' joins the writable set so the raising nurse can correct the
      // location on a request the doctor has not yet acted on. The create-path guards come
      // with it — without them this branch would admit a junk shape or let a clinic request
      // gain a private premise, reopening what round 6 closed.
      allow update: if hasRole('nurse')
        && requestPremiseShapeOK()
        && clinicRequestCarriesNoPremise()
        && resource.data.nurseId == uid()
        && resource.data.status == 'needsEdit'
        && request.resource.data.status == 'pending'
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['items', 'status', 'premise']);
```

And in the edit-in-place branch (currently line 330-334):

```
      allow update: if hasRole('nurse')
        && requestPremiseShapeOK()
        && clinicRequestCarriesNoPremise()
        && resource.data.nurseId == uid()
        && resource.data.status == 'pending'
        && request.resource.data.status == 'pending'
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['items', 'premise']);
```

Note `clinicRequestCarriesNoPremise()` reads `request.resource.data.clinicId`, which on an update is the merged document, so it correctly sees the request's existing `clinicId`.

- [ ] **Step 5: Run the rules tests to verify they pass**

Run: `cd /Users/zhendeng/Documents/AestheticX/backend && npx firebase emulators:exec --only firestore "npx vitest run rules-tests/firestore.rules.test.js"`
Expected: PASS — all tests in the file, including the untouched withdraw/removal ones.

- [ ] **Step 6: Commit**

```bash
cd /Users/zhendeng/Documents/AestheticX/backend
git add firestore.rules rules-tests/firestore.rules.test.js
git commit -m "feat(rules): let the raising nurse re-stamp the premise on her own open request

The location printed on an authorisation came from a global selection made on
another page, so the web is gaining a per-request picker. Round 6 froze
'premise' after creation; that stays true for approved requests, withdraw and
field removal, but the raising nurse may now correct it while the request is
still pending or needs-edit.

The create-path guards move onto both update branches with it —
requestPremiseShapeOK() and clinicRequestCarriesNoPremise() — so the widened
key set cannot admit a junk shape or give a clinic request a private premise."
```

---

### Task 2: `resolvePremise` + optional `premiseId` on the three reducers (WEB REPO)

Repo: `/Users/zhendeng/Documents/Aestheticx-marketing` (worktree `.claude/worktrees/consent-response-pdf-fixes-d1b18e`, branch `claude/request-location-picker`)

**Files:**
- Modify: `src/lib/demo/backend.ts` — `SubmitRequestInput` (line 402), `submitRequest` (line 451), `ResubmitRequestInput` (line 714), `resubmitRequest` (line 724), `editPendingRequest` (line 750), and a new `resolvePremise` beside `activePremise` (line 1418)
- Test: `src/lib/demo/__tests__/request-premise-choice.test.ts` (create)

**Interfaces:**
- Consumes: `activePremise(profile: UserProfile): Premise | null`, `profileForUser(state, userID): UserProfile`.
- Produces:
  - `resolvePremise(profile: UserProfile, premiseId: string | undefined): Premise | null` — the premise with that id, else `null`.
  - `SubmitRequestInput` and `ResubmitRequestInput` each gain optional `premiseId?: string`.
  - Stamping rule used by all three reducers: `identity.context.kind === "independent" ? (resolvePremise(profile, premiseId) ?? activePremise(profile)) : null`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/demo/__tests__/request-premise-choice.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { emptyState, submitRequest, editPendingRequest, resubmitRequest, updateProfile } from "@/lib/demo/backend";
import { LUMIERE } from "@/lib/demo/accounts";
import type { DemoState, Identity, MedicationItem, Patient } from "@/lib/demo/types";

// Owner feedback 06/08: the premise stamped on a request came from a global selection made
// on another page. The request form now chooses it per request; these lock the reducer half.

const HOME = { id: "p-home", name: "Home rooms", address: "1 Home St, Sydney NSW 2000" };
const CITY = { id: "p-city", name: "City rooms", address: "2 City Rd, Sydney NSW 2000" };

const nurse: Identity = { user: { id: "u-n", name: "Nurse" }, role: "nurse", context: { kind: "independent" } };
const nurseAtClinic: Identity = { user: { id: "u-n", name: "Nurse" }, role: "nurse", context: { kind: "clinic", clinic: LUMIERE } };

const patient: Patient = {
  id: "p-1", givenName: "Ann", lastName: "Lee",
  dateOfBirth: { year: 1990, month: 1, day: 1 }, gender: "Female",
  address: "", phone: "", email: "", allergies: "", currentMedications: "",
  owner: { kind: "nurse", id: "u-n" }, prescribingDoctorIDs: [], openReviewerDoctorIDs: [],
};
const clinicPatient: Patient = { ...patient, id: "p-2", owner: { kind: "clinic", id: LUMIERE.id } };

const items: MedicationItem[] = [
  { name: "Letybo", dosage: "20", unit: "units", route: "intramuscular", category: "neurotoxin", area: "", areas: [], brand: null, timing: null },
];

/** A nurse with two premises, HOME selected — so "the active premise" is unambiguous. */
function base(): DemoState {
  const s = emptyState();
  const seeded: DemoState = { ...s, patients: { [patient.id]: patient, [clinicPatient.id]: clinicPatient } };
  return updateProfile(seeded, { premises: [HOME, CITY], defaultPremiseId: HOME.id, selectedPremiseId: HOME.id }, nurse);
}

const NOW = Date.parse("2026-08-06T00:00:00Z");

describe("submitRequest — chosen premise", () => {
  it("stamps the chosen premise, not the active one", () => {
    const { request } = submitRequest(base(), { patientID: "p-1", doctorID: "u-d", items, identity: nurse, premiseId: CITY.id }, NOW);
    expect(request.premise).toEqual(CITY);
  });

  it("stamps the active premise when no choice is passed (today's behaviour)", () => {
    const { request } = submitRequest(base(), { patientID: "p-1", doctorID: "u-d", items, identity: nurse }, NOW);
    expect(request.premise).toEqual(HOME);
  });

  it("falls back to the active premise when the chosen id no longer exists", () => {
    const { request } = submitRequest(base(), { patientID: "p-1", doctorID: "u-d", items, identity: nurse, premiseId: "p-deleted" }, NOW);
    expect(request.premise).toEqual(HOME);
  });

  it("a clinic-context request ignores the choice and stamps null", () => {
    const { request } = submitRequest(base(), { patientID: "p-2", doctorID: "u-d", items, identity: nurseAtClinic, premiseId: CITY.id }, NOW);
    expect(request.premise).toBeNull();
  });
});

describe("editPendingRequest / resubmitRequest — re-stamp", () => {
  it("edit in place re-stamps the chosen premise", () => {
    const first = submitRequest(base(), { patientID: "p-1", doctorID: "u-d", items, identity: nurse }, NOW);
    const next = editPendingRequest(first.state, { requestID: first.request.id, items, identity: nurse, premiseId: CITY.id });
    expect(next.requests[first.request.id].premise).toEqual(CITY);
  });

  it("edit in place leaves the stamp alone when no choice is passed", () => {
    const first = submitRequest(base(), { patientID: "p-1", doctorID: "u-d", items, identity: nurse }, NOW);
    const next = editPendingRequest(first.state, { requestID: first.request.id, items, identity: nurse });
    expect(next.requests[first.request.id].premise).toEqual(HOME);
  });

  it("resubmit re-stamps the chosen premise", () => {
    const first = submitRequest(base(), { patientID: "p-1", doctorID: "u-d", items, identity: nurse }, NOW);
    const returned: DemoState = {
      ...first.state,
      requests: { ...first.state.requests, [first.request.id]: { ...first.request, status: "needsEdit" } },
    };
    const next = resubmitRequest(returned, { requestID: first.request.id, items, identity: nurse, premiseId: CITY.id });
    expect(next.requests[first.request.id].premise).toEqual(CITY);
    expect(next.requests[first.request.id].status).toBe("pending");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/demo/__tests__/request-premise-choice.test.ts`
Expected: FAIL — TypeScript rejects `premiseId` on the input types, and the chosen-premise assertions fail.

- [ ] **Step 3: Add `resolvePremise` beside `activePremise`**

In `src/lib/demo/backend.ts`, immediately after `activePremise` (line 1421):

```ts
/**
 * The premise with this id, or null when the id is absent/unknown — e.g. the premise was
 * deleted in another tab between the request form loading and submitting. Callers fall back
 * to activePremise() rather than stamping nothing: a blank address blocks the direction
 * export downstream, so "no premise" is a worse outcome than "the previously active one".
 */
export function resolvePremise(profile: UserProfile, premiseId: string | undefined): Premise | null {
  if (!premiseId) return null;
  return profile.premises.find((p) => p.id === premiseId) ?? null;
}
```

- [ ] **Step 4: Thread `premiseId` through the three reducers**

In `src/lib/demo/backend.ts`, add the field to `SubmitRequestInput` (line 402):

```ts
export interface SubmitRequestInput {
  patientID: string;
  doctorID: string;
  items: MedicationItem[];
  identity: Identity;
  /** Premise chosen ON THE REQUEST FORM (owner feedback 06/08). Absent → the profile's
   *  active premise, i.e. the pre-06/08 behaviour. Ignored under a clinic identity. */
  premiseId?: string;
}
```

and to `ResubmitRequestInput` (line 714):

```ts
export interface ResubmitRequestInput {
  requestID: string;
  items: MedicationItem[];
  identity: Identity;
  /** Re-stamp the premise (owner feedback 06/08). Absent → the existing stamp is kept. */
  premiseId?: string;
}
```

In `submitRequest`, replace the premise computation (line 464-466):

```ts
  const premise = input.identity.context.kind === "independent"
    ? (resolvePremise(profileForUser(state, input.identity.user.id), input.premiseId)
       ?? activePremise(profileForUser(state, input.identity.user.id)))
    : null;
```

In `resubmitRequest`, replace the returned request (line 738) so a supplied id re-stamps and an absent one keeps the existing stamp:

```ts
      [input.requestID]: { ...request, items: input.items, status: "pending", ...premisePatch(state, request, input) },
```

In `editPendingRequest`, replace the returned request (line 764):

```ts
      [input.requestID]: { ...request, items: input.items, ...premisePatch(state, request, input) },
```

and add this helper directly above `resubmitRequest` (line 724):

```ts
/** Re-stamp patch shared by the two edit paths: only when the caller passed a choice, and
 *  never under a clinic identity (a clinic request's null premise means "use the clinic's
 *  address" — see premiseForCapture). An unknown id falls back to the active premise rather
 *  than blanking a stamp the request already carries. */
function premisePatch(state: DemoState, request: AuthorisationRequest, input: ResubmitRequestInput): { premise?: Premise | null } {
  if (!input.premiseId || request.context.kind !== "independent") return {};
  const profile = profileForUser(state, input.identity.user.id);
  return { premise: resolvePremise(profile, input.premiseId) ?? activePremise(profile) };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/demo/__tests__/request-premise-choice.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 6: Run the full suite — the stamping path is shared with the PDF and direction tests**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all pass, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/demo/backend.ts src/lib/demo/__tests__/request-premise-choice.test.ts
git commit -m "feat(requests): reducers accept a chosen premise for the stamp

submitRequest/editPendingRequest/resubmitRequest take an optional premiseId and
stamp that premise instead of the profile's active one. Absent premiseId keeps
the previous behaviour exactly; a clinic identity still stamps null; an unknown
id falls back to the active premise rather than blanking the address."
```

---

### Task 3: Carry the re-stamp through the store and the live mirror (WEB REPO)

**Files:**
- Modify: `src/lib/demo/store.tsx` — the three method types (lines 43, 46, 47) and their implementations (lines 601-607, 619-623, 629-635)
- Modify: `src/lib/firebase/mirror.ts` — `mirrorResubmitRequest` (line 121), `mirrorEditPendingRequest` (line 132)
- Test: `src/lib/firebase/__tests__/request-premise-mirror.test.ts` (create)

**Interfaces:**
- Consumes: Task 2's `premiseId` on `SubmitRequestInput` / `ResubmitRequestInput`; existing `encodeAuthRequest` (already encodes `premise`, `src/lib/firebase/mappers.ts:463`).
- Produces:
  - store methods `submitRequest` / `editPendingRequest` / `resubmitRequest` each accept `premiseId?: string`.
  - `mirrorResubmitRequest(requestId, items, premise?)` and `mirrorEditPendingRequest(requestId, items, premise?)` where `premise?: Premise | null` — when supplied, it is written alongside `items`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/firebase/__tests__/request-premise-mirror.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// The live edit path writes authRequests directly (updateDoc). firestore.rules admits
// 'premise' in the affected keys only after the 06/08 rules deploy, so the mirror must send
// it ONLY when the caller re-stamped — an unconditional write would touch the field on every
// items-only edit and fail for anyone on the old rules.

const updateDoc = vi.fn();
vi.mock("firebase/firestore", () => ({
  updateDoc: (...a: unknown[]) => updateDoc(...a),
  doc: (_db: unknown, coll: string, id: string) => `${coll}/${id}`,
  setDoc: vi.fn(),
}));
vi.mock("@/lib/firebase/client", () => ({ firestore: () => ({}), functions: () => ({}) }));

import { mirrorEditPendingRequest, mirrorResubmitRequest } from "@/lib/firebase/mirror";

const items = [{ name: "Letybo", dosage: "20", unit: "units", route: "intramuscular", category: "neurotoxin", area: "", areas: [], brand: null, timing: null }] as never;
const PREMISE = { id: "p-city", name: "City rooms", address: "2 City Rd, Sydney NSW 2000" };

beforeEach(() => updateDoc.mockReset());

describe("live edit paths carry a re-stamped premise", () => {
  it("edit-in-place writes the premise when one is supplied", async () => {
    await mirrorEditPendingRequest("r-1", items, PREMISE);
    expect(updateDoc.mock.calls[0][1]).toMatchObject({ premise: PREMISE });
  });

  it("edit-in-place omits the premise key entirely when none is supplied", async () => {
    await mirrorEditPendingRequest("r-1", items);
    expect(updateDoc.mock.calls[0][1]).not.toHaveProperty("premise");
  });

  it("resubmit writes the premise alongside the status flip", async () => {
    await mirrorResubmitRequest("r-1", items, PREMISE);
    expect(updateDoc.mock.calls[0][1]).toMatchObject({ status: "pending", premise: PREMISE });
  });

  it("resubmit omits the premise key when none is supplied", async () => {
    await mirrorResubmitRequest("r-1", items);
    expect(updateDoc.mock.calls[0][1]).not.toHaveProperty("premise");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/firebase/__tests__/request-premise-mirror.test.ts`
Expected: FAIL — the mirrors take two arguments and never write `premise`.

- [ ] **Step 3: Widen the two mirrors**

In `src/lib/firebase/mirror.ts`, replace `mirrorResubmitRequest` (line 121) and `mirrorEditPendingRequest` (line 132):

```ts
// 06/08: `premise` joins the writable field set (firestore.rules, deployed first) so the
// raising nurse can correct the location while the request is still hers to edit. Sent ONLY
// when the caller re-stamped — writing it unconditionally would put it in affectedKeys on
// every items-only edit, which the pre-06/08 rules reject.
export async function mirrorResubmitRequest(requestId: string, items: MedicationItem[], premise?: Premise | null): Promise<void> {
  await updateDoc(doc(firestore(), "authRequests", requestId), {
    items: items.map(encodeMedication),
    status: "pending",
    ...(premise !== undefined ? { premise: premise ? { id: premise.id, name: premise.name, address: premise.address } : null } : {}),
  });
}

export async function mirrorEditPendingRequest(requestId: string, items: MedicationItem[], premise?: Premise | null): Promise<void> {
  await updateDoc(doc(firestore(), "authRequests", requestId), {
    items: items.map(encodeMedication),
    ...(premise !== undefined ? { premise: premise ? { id: premise.id, name: premise.name, address: premise.address } : null } : {}),
  });
}
```

Add `Premise` to the type import at the top of the file if it is not already imported.

- [ ] **Step 4: Thread `premiseId` through the store**

In `src/lib/demo/store.tsx`, update the three signatures (lines 43, 46, 47):

```ts
  submitRequest: (input: { patientID: string; doctorID: string; items: MedicationItem[]; identity: Identity; premiseId?: string }) => void;
  resubmitRequest: (input: { requestID: string; items: MedicationItem[]; identity: Identity; premiseId?: string }) => void;
  editPendingRequest: (input: { requestID: string; items: MedicationItem[]; identity: Identity; premiseId?: string }) => void;
```

`submitRequest`'s implementation (line 601-607) needs no change — it forwards `input` wholesale and mirrors the built `request`, whose `premise` is already encoded by `encodeAuthRequest`.

Replace `resubmitRequest` (line 619-623) and `editPendingRequest` (line 629-635) so the mirror receives the freshly stamped premise read back from the reducer's own result — never recomputed, so the local copy and the mirrored doc cannot diverge:

```ts
      resubmitRequest: (input) =>
        applyAndMirror(
          (s) => backend.resubmitRequest(s, input),
          (m) => m.mirrorResubmitRequest(
            input.requestID, input.items,
            input.premiseId ? backend.resubmitRequest(state, input).requests[input.requestID].premise ?? null : undefined,
          ),
        ),
```

```ts
      editPendingRequest: (input) => {
        backend.editPendingRequest(state, input); // eager validate — throws synchronously if actioned elsewhere
        applyAndMirror(
          (s) => backend.editPendingRequest(s, input),
          (m) => m.mirrorEditPendingRequest(
            input.requestID, input.items,
            input.premiseId ? backend.editPendingRequest(state, input).requests[input.requestID].premise ?? null : undefined,
          ),
        );
      },
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/firebase/__tests__/request-premise-mirror.test.ts src/lib/demo/__tests__/request-premise-choice.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/demo/store.tsx src/lib/firebase/mirror.ts src/lib/firebase/__tests__/request-premise-mirror.test.ts
git commit -m "feat(requests): store and live mirror carry the chosen premise

The two edit mirrors send 'premise' only when the caller re-stamped, so an
items-only edit keeps its old affected-key set and still works for a session
that has not picked up the widened rules."
```

---

### Task 4: The Location field on the request form (WEB REPO)

**Files:**
- Modify: `src/app/app/patients/[id]/request/page.tsx` — add state near the other `useState` calls, render the field above the submit row (line 386-403 area), pass `premiseId` in `submit()` (line 274-290)
- Test: `src/app/app/patients/[id]/__tests__/request-location-picker.test.tsx` (create)

**Interfaces:**
- Consumes: Task 2's `resolvePremise` / `activePremise` from `@/lib/demo/backend`; Task 3's store signatures; existing page locals `me`, `editing`, `editRequest`.
- Produces: no exports — this is the leaf.

- [ ] **Step 1: Write the failing test**

Create `src/app/app/patients/[id]/__tests__/request-location-picker.test.tsx`:

```tsx
// Owner feedback 06/08: the premise stamped on an authorisation came from a global selection
// made on another page, so working elsewhere without switching first printed the wrong address.
// The form now shows and chooses it, per request.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Suspense } from "react";
import { emptyState, updateProfile, patientPermissions } from "@/lib/demo/backend";
import { LUMIERE } from "@/lib/demo/accounts";
import type { DemoState, Identity, Patient } from "@/lib/demo/types";

const HOME = { id: "p-home", name: "Home rooms", address: "1 Home St, Sydney NSW 2000" };
const CITY = { id: "p-city", name: "City rooms", address: "2 City Rd, Sydney NSW 2000" };

const nurse: Identity = { user: { id: "u-n", name: "Nurse" }, role: "nurse", context: { kind: "independent" } };
const nurseAtClinic: Identity = { user: { id: "u-n", name: "Nurse" }, role: "nurse", context: { kind: "clinic", clinic: LUMIERE } };

const patient: Patient = {
  id: "p-1", givenName: "Ann", lastName: "Lee",
  dateOfBirth: { year: 1990, month: 1, day: 1 }, gender: "Female",
  address: "", phone: "", email: "", allergies: "", currentMedications: "",
  owner: { kind: "nurse", id: "u-n" }, prescribingDoctorIDs: ["u-d"], openReviewerDoctorIDs: [],
};

let identity: Identity;
let premises: { id: string; name: string; address: string }[];
const submitRequest = vi.fn();

function state(): DemoState {
  const s = emptyState();
  const seeded: DemoState = { ...s, patients: { [patient.id]: { ...patient, owner: identity.context.kind === "clinic" ? { kind: "clinic", id: LUMIERE.id } : { kind: "nurse", id: "u-n" } } } };
  return updateProfile(seeded, { premises, defaultPremiseId: HOME.id, selectedPremiseId: HOME.id }, nurse);
}

vi.mock("next/navigation", () => ({
  usePathname: () => "/app", useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/demo/auth", () => ({ useDemoAuth: () => ({ identity }) }));
vi.mock("@/lib/demo/store", () => ({
  useDemoStore: () => ({
    status: "demo" as const, now: Date.parse("2026-08-06T00:00:00Z"), state: state(),
    profileForUser: () => state().profileByUser["u-n"],
    submitRequest, editPendingRequest: vi.fn(), resubmitRequest: vi.fn(),
    cooperatingDoctors: () => [{ doctorId: "u-d", doctorName: "Dr Who" }],
    patientAccess: (p: Patient, i: Identity) => patientPermissions(i, p),
  }),
}));

import RequestPage from "@/app/app/patients/[id]/request/page";

async function renderPage() {
  await act(async () => {
    render(<Suspense fallback={null}><RequestPage params={Promise.resolve({ id: "p-1" })} /></Suspense>);
    await Promise.resolve();
  });
}

beforeEach(() => { submitRequest.mockReset(); identity = nurse; premises = [HOME, CITY]; });

describe("request form — Location", () => {
  it("shows a Location select defaulting to the profile's current premise", async () => {
    await renderPage();
    const select = screen.getByLabelText(/location/i) as HTMLSelectElement;
    expect(select.value).toBe(HOME.id);
    expect(screen.getByText(new RegExp(CITY.address))).toBeInTheDocument();
  });

  it("passes the chosen premise id to submitRequest", async () => {
    await renderPage();
    await userEvent.selectOptions(screen.getByLabelText(/location/i), CITY.id);
    await userEvent.click(screen.getByRole("button", { name: /submit request/i }));
    expect(submitRequest.mock.calls[0][0]).toMatchObject({ premiseId: CITY.id });
  });

  it("renders a read-only line, not a select, when there is only one premise", async () => {
    premises = [HOME];
    await renderPage();
    expect(screen.queryByLabelText(/location/i)).not.toBeInTheDocument();
    expect(screen.getByText(new RegExp(HOME.address))).toBeInTheDocument();
  });

  it("is absent under a clinic identity — the clinic's own address is stamped", async () => {
    identity = nurseAtClinic;
    await renderPage();
    expect(screen.queryByLabelText(/location/i)).not.toBeInTheDocument();
    expect(screen.queryByText(new RegExp(HOME.address))).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run "src/app/app/patients/[id]/__tests__/request-location-picker.test.tsx"`
Expected: FAIL — no Location control exists.

- [ ] **Step 3: Add the state and the default**

In `src/app/app/patients/[id]/request/page.tsx`, import the helpers alongside the existing backend imports:

```ts
import { activePremise, resolvePremise } from "@/lib/demo/backend";
```

Add state beside the other `useState` calls (near `doctorId`):

```tsx
  const [premiseId, setPremiseId] = useState<string | null>(null);
```

After `const me = identity;` (line 236), resolve what the form should show. Editing preselects the stamp the request already carries; otherwise the profile's active premise:

```tsx
  // Owner feedback 06/08: the stamped location is chosen HERE, not inherited from a selection
  // made earlier on the dashboard/profile. Independent identities only — a clinic-context
  // request deliberately stamps null so the document prints the CLINIC's premises.
  const profile = store.profileForUser(me.user.id);
  const picksPremise = me.context.kind === "independent" && profile.premises.length > 0;
  const defaultPremiseId =
    (editing ? editRequest?.premise?.id : undefined) ?? activePremise(profile)?.id ?? "";
  const chosenPremiseId = premiseId ?? defaultPremiseId;
  const chosenPremise = resolvePremise(profile, chosenPremiseId) ?? activePremise(profile);
```

- [ ] **Step 4: Pass the choice on submit**

In `submit()` (line 274-290), add `premiseId` to all three calls:

```tsx
    if (editing && editRequest) {
      if (editRequest.status === "pending") {
        store.editPendingRequest({ requestID: editRequest.id, items, identity: me, ...(picksPremise ? { premiseId: chosenPremiseId } : {}) });
      } else {
        store.resubmitRequest({ requestID: editRequest.id, items, identity: me, ...(picksPremise ? { premiseId: chosenPremiseId } : {}) });
      }
    } else {
      store.submitRequest({ patientID: id, doctorID: chosenDoctor, items, identity: me, ...(picksPremise ? { premiseId: chosenPremiseId } : {}) });
    }
```

- [ ] **Step 5: Render the field**

Immediately after the Prescribing doctor `</label>` (line 403) and before the submit row:

```tsx
      {picksPremise && (
        <div className="mt-4 max-w-md">
          {profile.premises.length > 1 ? (
            <label className="block">
              <span className="micro">Location</span>
              <select
                aria-label="Location"
                value={chosenPremiseId}
                onChange={(e) => setPremiseId(e.target.value)}
                className="mt-1 w-full rounded-field border border-line bg-card px-3 py-2 text-ink"
              >
                {profile.premises.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} — {p.address}</option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <span className="micro">Location</span>
              <p className="mt-1 text-sm text-ink">{chosenPremise?.name} — {chosenPremise?.address}</p>
            </>
          )}
          <p className="mt-1 text-xs text-ink-faint">
            Printed on the authorisation as the premises of administration.
          </p>
        </div>
      )}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run "src/app/app/patients/[id]/__tests__/request-location-picker.test.tsx"`
Expected: PASS (4 tests)

- [ ] **Step 7: Run the full suite, types and lint**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all tests pass, no type errors, no new lint errors (7 pre-existing warnings are fine).

- [ ] **Step 8: Verify in the browser at both widths**

Start the preview (`web` config, port 3000), enter the demo as **Sarah Chen — Nurse** (she holds an independent identity with premises), open a patient → Raise authorisation request. Confirm: the Location field shows above Submit with her current premise preselected; switching it and submitting stamps the chosen one (the patient file's request shows the new address); at 375px the field and its hint do not overflow. Then switch to her Lumière identity and confirm the field is absent.

- [ ] **Step 9: Commit**

```bash
git add "src/app/app/patients/[id]/request/page.tsx" "src/app/app/patients/[id]/__tests__/request-location-picker.test.tsx"
git commit -m "feat(requests): choose the location on the authorisation request form

An independent nurse picks the premise of administration on the request itself,
defaulting to her current one and shown directly above Submit, so the address
that will print is visible before submitting instead of inherited from a
selection made earlier on another page. Editing preselects the stamp the
request already carries. Absent for clinic identities, which stamp the clinic's
own premises."
```

---

### Task 5: Ship

**Files:** none (process task)

- [ ] **Step 1: Open the backend PR first**

```bash
cd /Users/zhendeng/Documents/AestheticX/backend
git push -u origin HEAD
gh pr create --title "feat(rules): Let the raising nurse re-stamp a request's premise" --body "Widens the two nurse authRequests update branches to admit 'premise', with requestPremiseShapeOK() and clinicRequestCarriesNoPremise() ported onto them. Approved requests, withdraw and field removal stay frozen. Pairs with the web Location picker, which must merge only after this deploys."
```

- [ ] **Step 2: Deploy the rules after the backend PR merges**

Run: `cd /Users/zhendeng/Documents/AestheticX/backend && npx firebase deploy --only firestore:rules`
Expected: "Deploy complete!". Verify in the console that the `authRequests` update branches show `hasOnly(['items', 'premise'])`.

- [ ] **Step 3: Only then open and merge the web PR**

```bash
cd /Users/zhendeng/Documents/Aestheticx-marketing/.claude/worktrees/consent-response-pdf-fixes-d1b18e
git push -u origin HEAD
gh pr create --title "feat(requests): Choose the location when raising an authorisation request"
```

- [ ] **Step 4: Live smoke test**

Signed in as a real independent nurse account, raise a request with the non-default location, then edit it and switch the location back. Both must save without a sync-error banner; the second one is what proves the rules deploy landed.

## Self-review notes

- Spec coverage: UI (Task 4), data flow (Tasks 2-3), edit flow (Tasks 2-4), stale-id and clinic-context error handling (Task 2), rules constraint and deploy order (Tasks 1, 5), tests (all tasks).
- The `premiseId` name is used identically in every task; the reducers' shared helper is `premisePatch`, the pure lookup is `resolvePremise`.
- Task 3 sends `premise` to the mirrors only when the caller re-stamped, which is what keeps an items-only edit compatible with a session still on the old rules.

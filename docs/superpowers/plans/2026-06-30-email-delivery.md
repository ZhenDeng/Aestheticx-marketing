# Email Delivery Implementation Plan (delivery status on aftercare records, web)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show aftercare-email delivery status (Queued/Delivered/Failed) on the send-record note and make failed sends retryable — demo runs the full lifecycle; live is display-only and forward-compatible.

**Architecture:** Web `Note` gains `deliveryStatus` + `aftercareCategories` (iOS parity, round-tripped by the mapper); `recordAftercareSend` sets `queued` + categories; a pure `setNoteDeliveryStatus`; a demo `retryAftercare` store action; a delivery badge + demo-gated Retry on the patient note stream; a seeded failed send.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest.

**Source of truth:** iOS `AXDomain/Notes.swift` (`DeliveryStatus`, `Note.deliveryStatus`, `Note.aftercareCategories`). Design: `docs/superpowers/specs/2026-06-30-email-delivery-design.md`. The live mirror-back + retry-by-note is a separate backend task (`AestheticX/backend/functions`).

**Key facts:**
- `recordAftercareSend(state, input, now)` builds the `aftercareRecord` note; `input` is `{patientID, content, medications, identity}`.
- `Note` builders that must stay valid: `saveGeneralNote`, `saveTreatmentNote` (leave the new optional fields unset).
- `mapNote`/`encodeNote` are in `mappers.ts`; `str`/`strArray` helpers exist there; `AFTERCARE_CATEGORIES`/`AftercareCategory` already imported there (from the note-templates work).
- Note stream rows are in `src/app/app/patients/[id]/page.tsx` (the `n.kind !== "general"` badge + the `isOpen` expanded block).
- `AftercareForm` has `selected: AftercareCategory[]`; its `send()` calls `store.sendAftercare`.

---

## File Structure
- Modify `src/lib/demo/types.ts` — `DeliveryStatus` + two optional `Note` fields.
- Modify `src/lib/firebase/mappers.ts` — round-trip them in `mapNote`/`encodeNote`.
- Modify `src/lib/demo/backend.ts` — `recordAftercareSend` (categories + queued) + `setNoteDeliveryStatus`.
- Modify `src/lib/demo/store.tsx` — `sendAftercare` carries categories + `retryAftercare` action.
- Modify `src/components/app/AftercareForm.tsx` — pass `selected` categories.
- Modify `src/lib/demo/seed.ts` — seed a failed aftercare note.
- Modify `src/app/app/patients/[id]/page.tsx` — delivery badge + demo-gated Retry.
- Tests: `src/lib/demo/__tests__/email-delivery.test.ts`.

---

## Task 1: Model + mapper round-trip (TDD)

**Files:** Modify `src/lib/demo/types.ts`, `src/lib/firebase/mappers.ts`; Test `src/lib/demo/__tests__/email-delivery.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { mapNote, encodeNote } from "@/lib/firebase/mappers";
import type { Note } from "@/lib/demo/types";

const base: Note = {
  id: "n1", patientID: "p1", kind: "aftercareRecord", title: "Aftercare sent", body: "Body",
  createdAt: 1000, authorID: "u-voss", authorBadge: "Dr Voss", consumedAuthorisationIDs: [], medications: [],
  deliveryStatus: "failed", aftercareCategories: ["antiwrinkle"],
};

describe("note delivery-status mapper", () => {
  it("round-trips deliveryStatus + aftercareCategories", () => {
    const doc = encodeNote(base);
    expect(doc).toMatchObject({ deliveryStatus: "failed", aftercareCategories: ["antiwrinkle"] });
    const mapped = mapNote("n1", "p1", doc);
    expect(mapped.deliveryStatus).toBe("failed");
    expect(mapped.aftercareCategories).toEqual(["antiwrinkle"]);
  });
  it("leaves deliveryStatus undefined + categories empty when absent", () => {
    const mapped = mapNote("n2", "p1", { kind: "general", title: "", body: "x" });
    expect(mapped.deliveryStatus).toBeUndefined();
    expect(mapped.aftercareCategories).toEqual([]);
  });
  it("defaults an unknown deliveryStatus to undefined", () => {
    const mapped = mapNote("n3", "p1", { kind: "aftercareRecord", deliveryStatus: "weird" });
    expect(mapped.deliveryStatus).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/lib/demo/__tests__/email-delivery.test.ts` → FAIL.

- [ ] **Step 3a: Types in `src/lib/demo/types.ts`**

Add near `NoteKind`:

```ts
export type DeliveryStatus = "queued" | "delivered" | "failed";
```

Add to the `Note` interface (after `medications`):

```ts
  deliveryStatus?: DeliveryStatus;       // aftercare records only
  aftercareCategories?: AftercareCategory[]; // audit trail of an aftercare send
```

(`AftercareCategory` is already imported at the top of `types.ts` from `./aftercare`.)

- [ ] **Step 3b: Mapper in `src/lib/firebase/mappers.ts`**

Add `DeliveryStatus` to the `from "@/lib/demo/types"` type import. In `mapNote`, add to the returned object (after `medications`):

```ts
    deliveryStatus: ((): DeliveryStatus | undefined => {
      const s = str(data.deliveryStatus);
      return s === "queued" || s === "delivered" || s === "failed" ? s : undefined;
    })(),
    aftercareCategories: strArray(data.aftercareCategories)
      .filter((c): c is AftercareCategory => (AFTERCARE_CATEGORIES as readonly string[]).includes(c)),
```

In `encodeNote`, add (after `medications`):

```ts
    deliveryStatus: n.deliveryStatus ?? null,
    aftercareCategories: n.aftercareCategories ?? [],
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run src/lib/demo/__tests__/email-delivery.test.ts` → PASS. Then `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/demo/types.ts src/lib/firebase/mappers.ts src/lib/demo/__tests__/email-delivery.test.ts
git commit -m "feat(email): Note deliveryStatus + aftercareCategories + mapper round-trip"
```

---

## Task 2: Ops — aftercare queued + categories, `setNoteDeliveryStatus` (TDD)

**Files:** Modify `src/lib/demo/backend.ts`; Test append to `email-delivery.test.ts`

- [ ] **Step 1: Add the failing test**

```ts
import {
  emptyState, recordAftercareSend, setNoteDeliveryStatus, notesForPatient, BackendError,
} from "@/lib/demo/backend";
import type { DemoState, Identity, Patient } from "@/lib/demo/types";

const voss: Identity = { user: { id: "u-voss", name: "Voss" }, role: "doctor", context: { kind: "independent" } };

function patientState(): DemoState {
  const p: Patient = {
    id: "p1", givenName: "A", lastName: "B", dateOfBirth: { year: 1990, month: 1, day: 1 },
    gender: "Female", address: "", phone: "0", email: "a@b.com", allergies: "NKDA",
    currentMedications: "Nil", owner: { kind: "doctor", id: "u-voss" }, prescribingDoctorIDs: [],
  };
  return { ...emptyState(), patients: { p1: p } };
}

describe("recordAftercareSend delivery fields", () => {
  it("records a queued send with the chosen categories", () => {
    const { state, note } = recordAftercareSend(
      patientState(), { patientID: "p1", content: "c", medications: [], categories: ["antiwrinkle", "skinbooster"], identity: voss }, 1,
    );
    expect(note.deliveryStatus).toBe("queued");
    expect(note.aftercareCategories).toEqual(["antiwrinkle", "skinbooster"]);
    expect(notesForPatient(state, "p1")[0].deliveryStatus).toBe("queued");
  });
});

describe("setNoteDeliveryStatus", () => {
  it("flips the note's delivery status", () => {
    const { state, note } = recordAftercareSend(patientState(), { patientID: "p1", content: "c", medications: [], categories: [], identity: voss }, 1);
    const next = setNoteDeliveryStatus(state, "p1", note.id, "delivered", voss);
    expect(notesForPatient(next, "p1")[0].deliveryStatus).toBe("delivered");
  });
  it("throws on a missing note", () => {
    expect(() => setNoteDeliveryStatus(patientState(), "p1", "nope", "delivered", voss)).toThrow(BackendError);
  });
  it("throws on a missing patient", () => {
    expect(() => setNoteDeliveryStatus(emptyState(), "px", "n", "delivered", voss)).toThrow(BackendError);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/lib/demo/__tests__/email-delivery.test.ts` → FAIL.

- [ ] **Step 3: Implement in `src/lib/demo/backend.ts`**

Add `AftercareCategory` to the imports if not present: it comes from `./aftercare` — add `import { aftercareDisplayName } from "./aftercare";`? No — only the type is needed; add `import type { AftercareCategory } from "./aftercare";` near the top if absent (check first; the file may not import it yet). Then:

Add `categories` to `RecordAftercareSendInput`:

```ts
export interface RecordAftercareSendInput {
  patientID: string;
  content: string;
  medications: TreatmentMedication[];
  categories: AftercareCategory[];
  identity: Identity;
}
```

In `recordAftercareSend`, set the two fields on the built note:

```ts
    consumedAuthorisationIDs: [],
    medications: input.medications,
    deliveryStatus: "queued",
    aftercareCategories: input.categories,
```

Add the new op (near the other note ops, e.g. after `recordAftercareSend`):

```ts
export function setNoteDeliveryStatus(
  state: DemoState, patientID: string, noteID: string, status: DeliveryStatus, identity: Identity,
): DemoState {
  const patient = state.patients[patientID];
  if (!patient) throw new BackendError("notFound");
  if (!patientPermissions(identity, patient).canWriteGeneralNote) throw new BackendError("notPermitted");
  const list = state.notesByPatient[patientID] ?? [];
  const idx = list.findIndex((n) => n.id === noteID);
  if (idx < 0) throw new BackendError("notFound");
  const next = [...list];
  next[idx] = { ...next[idx], deliveryStatus: status };
  return { ...state, notesByPatient: { ...state.notesByPatient, [patientID]: next } };
}
```

Add `DeliveryStatus` to the `import type { … } from "./types"` block.

- [ ] **Step 4: Run to verify it passes + full suite** — `npx vitest run src/lib/demo/__tests__/email-delivery.test.ts && npx tsc --noEmit`. Note: `recordAftercareSend` now requires `categories`; **the store + tests calling it must pass `categories`** — `npx vitest run` will surface any breakage (Task 3 updates the store; the existing `notes-ops.test.ts` calls `recordAftercareSend` and must be updated to pass `categories: []`).

Update `src/lib/demo/__tests__/notes-ops.test.ts`: add `categories: []` (and any aftercare-store test) to each `recordAftercareSend(...)` call.

- [ ] **Step 5: Commit**

```bash
git add src/lib/demo/backend.ts src/lib/demo/__tests__/email-delivery.test.ts src/lib/demo/__tests__/notes-ops.test.ts
git commit -m "feat(email): aftercare records queued + categories; setNoteDeliveryStatus"
```

---

## Task 3: Store carries categories + retry action; AftercareForm passes categories

**Files:** Modify `src/lib/demo/store.tsx`, `src/components/app/AftercareForm.tsx`

- [ ] **Step 1: Extend the `sendAftercare` `StoreValue` type + add `retryAftercare`**

Change the `sendAftercare` line and add `retryAftercare`:

```ts
  sendAftercare: (input: { patientID: string; content: string; medications: TreatmentMedication[]; categories: import("./aftercare").AftercareCategory[]; identity: Identity }) => void;
  retryAftercare: (patientID: string, noteID: string, identity: Identity) => void;
```

- [ ] **Step 2: Carry categories through `sendAftercare`; add `retryAftercare`**

In the `sendAftercare` action, the demo path already passes `input` to `recordAftercareSend` (which now reads `input.categories`) — no change needed there. The live `mirrorSendAftercare` call stays as-is (the deployed callable doesn't take categories). Add the retry action after `sendAftercare`:

```ts
      retryAftercare: (patientID, noteID, identity) => {
        // Demo: a successful re-attempt flips the record to delivered. Live retry is a
        // deferred backend task (the Retry button is demo-gated), so this is demo-only.
        if (!live) {
          setState((s) => backend.setNoteDeliveryStatus(s, patientID, noteID, "delivered", identity));
        }
      },
```

- [ ] **Step 3: `AftercareForm` passes categories**

In `src/components/app/AftercareForm.tsx`, update `send()`:

```tsx
  function send() {
    store.sendAftercare({ patientID, content, medications: includeMeds ? lastMeds : [], categories: selected, identity });
    onDone();
  }
```

- [ ] **Step 4: Type-check + store tests** — `npx tsc --noEmit && npx vitest run` → clean / pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/demo/store.tsx src/components/app/AftercareForm.tsx
git commit -m "feat(email): store carries aftercare categories + retry action"
```

---

## Task 4: Seed a failed aftercare send

**Files:** Modify `src/lib/demo/seed.ts`

- [ ] **Step 1: Add the seeded note**

Add `Note` to the `import type { … } from "./types"`. Just before `return state;`, add (uses the existing `amara` patient and `SEED_NOW`):

```ts
  // A failed aftercare send so the delivery badge + Retry are demonstrable.
  const failedAftercare: Note = {
    id: "n-aftercare-failed", patientID: amara.id, kind: "aftercareRecord", title: "Aftercare sent",
    body: "— ANTIWRINKLE —\nAvoid touching or massaging the treated area for 4 hours…",
    createdAt: SEED_NOW, authorID: "u-voss", authorBadge: "Dr Elena Voss",
    consumedAuthorisationIDs: [], medications: [], deliveryStatus: "failed", aftercareCategories: ["antiwrinkle"],
  };
  state = {
    ...state,
    notesByPatient: { ...state.notesByPatient, [amara.id]: [...(state.notesByPatient[amara.id] ?? []), failedAftercare] },
  };
```

- [ ] **Step 2: Type-check + seed test** — `npx tsc --noEmit && npx vitest run src/lib/demo/__tests__/seed.test.ts` → clean / pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/demo/seed.ts
git commit -m "feat(email): seed a failed aftercare send for the demo"
```

---

## Task 5: Delivery badge + demo-gated Retry on the note stream

**Files:** Modify `src/app/app/patients/[id]/page.tsx`

- [ ] **Step 1: A small badge helper (top of the component file, after imports)**

```tsx
const DELIVERY_LABEL: Record<string, string> = { queued: "Queued", delivered: "Delivered", failed: "Failed" };
function deliveryColor(s: string): string {
  return s === "delivered" ? "var(--color-tint)" : s === "failed" ? "var(--color-rose)" : "var(--color-ink-soft)";
}
```

- [ ] **Step 2: Render the badge in the row header**

Find the badge span block:

```tsx
                    {n.kind !== "general" && (
                      <span className="micro rounded-full border border-line px-2 py-0.5">
                        {n.kind === "treatment" ? "Treatment" : "Aftercare"}
                      </span>
                    )}
```

Immediately after it (still inside the same flex `<span>` that holds the badges), add:

```tsx
                    {n.deliveryStatus && (
                      <span className="micro rounded-full border px-2 py-0.5" style={{ color: deliveryColor(n.deliveryStatus), borderColor: deliveryColor(n.deliveryStatus) }}>
                        {DELIVERY_LABEL[n.deliveryStatus]}
                      </span>
                    )}
```

- [ ] **Step 3: Retry button in the expanded block (demo only)**

Inside the `{isOpen && (...)}` block, after the medications/consumed lines, add:

```tsx
                    {n.deliveryStatus === "failed" && store.status === "demo" && (
                      <button onClick={() => store.retryAftercare(id, n.id, me)}
                              className="mt-2 rounded-btn border border-line px-3 py-1.5 text-sm" style={{ color: "var(--color-rose)" }}>
                        Retry delivery
                      </button>
                    )}
```

- [ ] **Step 4: Type-check + full suite + lint + build** — `npx tsc --noEmit && npx vitest run && npx eslint src && npm run build` → all green.

- [ ] **Step 5: Commit**

```bash
git add src/app/app/patients/[id]/page.tsx
git commit -m "feat(email): delivery badge + demo-gated retry on aftercare records"
```

---

## Task 6: Verification gate + demo smoke + PR

- [ ] **Step 1: Full gate** — `npx vitest run && npx tsc --noEmit && npx eslint src && npm run build` (all green; run `npx eslint src` directly, not via a pipe, so its exit code isn't masked).

- [ ] **Step 2: Demo smoke (preview).** `.env.local` makes `npm run dev` run live — `mv .env.local .env.local.bak`, restart preview, restore afterwards. As **Dr Voss**, open patient **Amara** (p-1):
  - The seeded aftercare note shows a **Failed** badge; expand it → **Retry delivery** → the badge flips to **Delivered** and the button disappears.
  - "Send aftercare" → tick a category → Send → a new record shows a **Queued** badge.
  - No console errors.

- [ ] **Step 3: Push + PR** — `git push -u origin feature/email-delivery` then `gh pr create` (body from the diff).

---

## Self-Review Notes

- **Spec coverage (client slice):** status visible on the send surface — badge on aftercare records (Tasks 1,5) ✓; failures surfaced not silently dropped — Failed badge + seeded failure (Tasks 4,5) ✓; retryable — demo Retry → Delivered (Tasks 3,5) ✓; categories audit trail (Tasks 1–3) ✓.
- **Out of scope (deferred backend task):** live mirror-back of mailOutbox status onto the note, client-callable retry-by-note, provider/SPF-DKIM/secrets — all in `AestheticX/backend/functions` (spun off).
- **Type consistency:** `DeliveryStatus`, `Note.deliveryStatus`, `Note.aftercareCategories`, `recordAftercareSend` `categories`, `setNoteDeliveryStatus` identical across layers. Firestore note fields add `deliveryStatus`, `aftercareCategories` (iOS parity).
- **No placeholders:** every step has full code; PR body is the only deferred-to-runtime text.

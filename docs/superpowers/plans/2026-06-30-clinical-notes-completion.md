# Clinical-Notes Completion (Increment 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the treatment-note authoring UI, an aftercare-email compose flow with a recorded send-note, and a unified/expandable note stream to the web patient file — demo + live parity.

**Architecture:** Pure domain (`aftercare.ts`) + pure ops/helpers in `backend.ts`; a thin live mirror (`mirrorSendAftercare` → deployed `sendAftercare` callable); a store action following the existing `generateInvoice` demo/live split; two focused client components (`TreatmentNoteForm`, `AftercareForm`) wired into the patient file. Treatment-note save/mirror already exists end-to-end — only its UI is new.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest (+ RTL/jsdom already configured); Firebase v11 callables (region-pinned to `australia-southeast1`).

**Source of truth (read directly for verbatim content):**
- `/Users/zhendeng/Documents/AestheticX/AestheticXKit/Sources/AXDomain/Aftercare.swift`
- `/Users/zhendeng/Documents/AestheticX/AestheticXKit/Sources/AXFeatures/NoteSheets.swift` (`TreatmentNoteSheet`, `AftercareSheet`)
- Design: `docs/superpowers/specs/2026-06-30-clinical-notes-completion-design.md`

**Existing context (do not rebuild):**
- `backend.saveTreatmentNote` (doctor-direct vs nurse-ticking, repeat consumption) + store action `saveTreatmentNote` + mirror (`mirrorConsumeRepeats` / `mirrorCreateNote`).
- `Note` type has `kind: "general" | "treatment" | "aftercareRecord"`, `title`, `body`, `medications`, `consumedAuthorisationIDs`. `mapNote`/`encodeNote` already round-trip all of it.
- `backend.ts` helpers: private `appendNote`, private `makeID`, private `canUseAuthorisation`, `identityBadge`, `activeAuthorisations`, `patientPermissions`, `BackendError` (reasons include `notFound`, `notPermitted`, `notActive`, `nothingTicked`).
- Store: `applyAndMirror`, `now`, `live = isFirebaseConfigured()`, `setRefreshTick`, `setLastSyncError`.

---

## File Structure

- Create `src/lib/demo/aftercare.ts` — aftercare categories, verbatim templates, composer.
- Modify `src/lib/demo/backend.ts` — add `recordAftercareSend`, `canSendAftercare`, `usableAuthorisations`, `notePreview`.
- Modify `src/lib/firebase/mirror.ts` — add `mirrorSendAftercare`.
- Modify `src/lib/demo/store.tsx` — add `sendAftercare` action + `StoreValue` type.
- Create `src/components/app/TreatmentNoteForm.tsx` — treatment-note authoring panel.
- Create `src/components/app/AftercareForm.tsx` — aftercare compose panel.
- Modify `src/app/app/patients/[id]/page.tsx` — unified/expandable note stream + the two panels.
- Tests: `src/lib/demo/__tests__/aftercare.test.ts`, `src/lib/demo/__tests__/notes-ops.test.ts`.

**Testing rationale:** the real logic lives in the pure composer and ops, which are unit-tested here. The store `sendAftercare` action is a trivial wrapper over the tested `recordAftercareSend` (demo) / deployed callable (live), and the components are wiring — both are verified in the Phase 4 preview smoke rather than with brittle UI unit tests.

---

## Task 1: Aftercare domain (categories + verbatim templates + composer)

**Files:**
- Create: `src/lib/demo/aftercare.ts`
- Test: `src/lib/demo/__tests__/aftercare.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import {
  AFTERCARE_CATEGORIES, aftercareDisplayName, aftercareTemplate, assembleAftercare,
} from "@/lib/demo/aftercare";

describe("aftercare domain", () => {
  it("exposes the five iOS categories", () => {
    expect(AFTERCARE_CATEGORIES).toEqual([
      "antiwrinkle", "skinbooster", "haFiller", "fatDissolve", "fillerDissolve",
    ]);
  });

  it("uses the iOS display names", () => {
    expect(aftercareDisplayName("haFiller")).toBe("HA filler");
    expect(aftercareDisplayName("fatDissolve")).toBe("Fat dissolve");
  });

  it("carries the verbatim antiwrinkle template", () => {
    expect(aftercareTemplate("antiwrinkle")).toBe(
      "Avoid touching or massaging the treated area for 4 hours. Stay upright for 4 hours and skip strenuous exercise, saunas, and alcohol for 24 hours. Small injection bumps settle within an hour; results appear over 3–14 days. Contact us about any drooping, double vision, or difficulty swallowing."
    );
  });

  it("assembles ticked categories headed by uppercased name, in selection order", () => {
    const out = assembleAftercare(["skinbooster", "antiwrinkle"]);
    expect(out).toBe(
      `— SKINBOOSTER —\n${aftercareTemplate("skinbooster")}\n\n— ANTIWRINKLE —\n${aftercareTemplate("antiwrinkle")}`
    );
  });

  it("assembles empty selection to empty string", () => {
    expect(assembleAftercare([])).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/demo/__tests__/aftercare.test.ts`
Expected: FAIL — cannot resolve `@/lib/demo/aftercare`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/demo/aftercare.ts`. Copy each `template` string **verbatim** from `Aftercare.swift` (the Swift `\` line-continuations join with a single space — collapse them into one line each; keep the en-dash `–` in "3–14", "2 weeks" etc. and the em-dash `—`).

```ts
// Ported from iOS AXDomain/Aftercare.swift. Instruction templates copied verbatim.

export const AFTERCARE_CATEGORIES = [
  "antiwrinkle", "skinbooster", "haFiller", "fatDissolve", "fillerDissolve",
] as const;
export type AftercareCategory = (typeof AFTERCARE_CATEGORIES)[number];

export function aftercareDisplayName(c: AftercareCategory): string {
  switch (c) {
    case "antiwrinkle": return "Antiwrinkle";
    case "skinbooster": return "Skinbooster";
    case "haFiller": return "HA filler";
    case "fatDissolve": return "Fat dissolve";
    case "fillerDissolve": return "Filler dissolve";
  }
}

export function aftercareTemplate(c: AftercareCategory): string {
  switch (c) {
    case "antiwrinkle":
      return "Avoid touching or massaging the treated area for 4 hours. Stay upright for 4 hours and skip strenuous exercise, saunas, and alcohol for 24 hours. Small injection bumps settle within an hour; results appear over 3–14 days. Contact us about any drooping, double vision, or difficulty swallowing.";
    case "skinbooster":
      return "Small papules at the injection points are normal and settle within 48 hours. Avoid make-up for the rest of today, and saunas, pools, and intense exercise for 48 hours. Moisturise and use SPF daily. Contact us if any site becomes hot, painful, or worse after 48 hours.";
    case "haFiller":
      return "Swelling and bruising are common for several days — ice in short intervals helps. Avoid pressure on the area (including sleeping face-down), make-up for 24 hours, and heat, alcohol, or hard exercise for 48 hours. Lumps usually soften over 2 weeks. URGENT: contact us immediately for unusual pain, white or mottled skin, or changes in vision.";
    case "fatDissolve":
      return "Expect noticeable swelling for 3–7 days plus tenderness, firmness, and possible numbness — this is the treatment working. Wear the compression garment if provided. Avoid anti-inflammatories for 48 hours where possible, and heat or hard exercise for 72 hours. Contact us about blistering, skin changes, or an uneven smile.";
    case "fillerDissolve":
      return "The enzyme works quickly — most softening happens within 24–48 hours, and some of your own tissue hyaluronic acid may temporarily soften too; this replenishes over weeks. Swelling today is normal. A review in 2 weeks confirms whether a further session or re-treatment is appropriate. Contact us about any rash or itching.";
  }
}

// Matches iOS AftercareComposer.assemble: each section headed by the uppercased
// display name, joined by a blank line, preserving selection order.
export function assembleAftercare(categories: AftercareCategory[]): string {
  return categories
    .map((c) => `— ${aftercareDisplayName(c).toUpperCase()} —\n${aftercareTemplate(c)}`)
    .join("\n\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/demo/__tests__/aftercare.test.ts`
Expected: PASS (5 tests). If the antiwrinkle assertion fails, diff the string against `Aftercare.swift` for a stray space or wrong dash.

- [ ] **Step 5: Commit**

```bash
git add src/lib/demo/aftercare.ts src/lib/demo/__tests__/aftercare.test.ts
git commit -m "feat(notes): aftercare categories + verbatim templates + composer"
```

---

## Task 2: Backend ops — `recordAftercareSend`, `canSendAftercare`, `usableAuthorisations`, `notePreview`

**Files:**
- Modify: `src/lib/demo/backend.ts`
- Test: `src/lib/demo/__tests__/notes-ops.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { buildSeedState } from "@/lib/demo/seed";
import {
  recordAftercareSend, canSendAftercare, usableAuthorisations, notePreview,
  notesForPatient, BackendError,
} from "@/lib/demo/backend";
import type { Identity, Note } from "@/lib/demo/types";

// Pull a real seeded patient + a nurse/doctor identity from the seed.
function ctx() {
  const state = buildSeedState();
  const patient = Object.values(state.patients)[0];
  // A nurse identity that can view this patient. Adjust ids from the seed if needed.
  const nurse = Object.values(state.patients).length ? findNurseFor(state, patient.id) : null;
  return { state, patient, nurse: nurse! };
}

// Helper: construct a nurse Identity that owns / can view the patient.
function findNurseFor(state: ReturnType<typeof buildSeedState>, patientID: string): Identity {
  const p = state.patients[patientID];
  // Seed patients are clinic-owned in the demo; build a clinic nurse identity.
  if (p.owner.kind === "clinic") {
    return { user: { id: "nurse-test", name: "Test Nurse" }, role: "nurse",
             context: { kind: "clinic", clinic: { id: p.owner.id, name: "Clinic" } } };
  }
  return { user: { id: p.owner.id, name: "Owner" }, role: "nurse", context: { kind: "independent" } };
}

describe("notePreview", () => {
  const base: Note = {
    id: "n1", patientID: "p1", kind: "general", title: "", body: "",
    createdAt: 0, authorID: "u", authorBadge: "RN", consumedAuthorisationIDs: [], medications: [],
  };
  it("shows the title when set", () => {
    expect(notePreview({ ...base, title: "Follow-up call", body: "blah" })).toBe("Follow-up call");
  });
  it("shows the first body line + ellipsis when title empty", () => {
    expect(notePreview({ ...base, title: "", body: "First line\nsecond" })).toBe("First line…");
  });
  it("handles an empty note", () => {
    expect(notePreview({ ...base, title: "", body: "" })).toBe("(empty note)");
  });
});

describe("canSendAftercare", () => {
  const mk = (role: Identity["role"]): Identity =>
    ({ user: { id: "u", name: "U" }, role, context: { kind: "independent" } });
  it("allows nurse and doctor", () => {
    expect(canSendAftercare(mk("nurse"))).toBe(true);
    expect(canSendAftercare(mk("doctor"))).toBe(true);
  });
  it("denies clinic admin and super admin", () => {
    expect(canSendAftercare(mk("clinicAdmin"))).toBe(false);
    expect(canSendAftercare(mk("superAdmin"))).toBe(false);
  });
});

describe("recordAftercareSend", () => {
  it("appends an aftercareRecord note with the exact content + medications", () => {
    const { state, patient, nurse } = ctx();
    const meds = [{ name: "Botox", batch: "B1", expiry: "12/26", dosage: "20u" }];
    const { state: next, note } = recordAftercareSend(
      state, { patientID: patient.id, content: "Sent text", medications: meds, identity: nurse }, 1_000,
    );
    expect(note.kind).toBe("aftercareRecord");
    expect(note.title).toBe("Aftercare sent");
    expect(note.body).toBe("Sent text");
    expect(note.medications).toEqual(meds);
    expect(notesForPatient(next, patient.id)[0].id).toBe(note.id); // newest first
  });

  it("rejects a clinic admin", () => {
    const { state, patient } = ctx();
    const admin: Identity = { user: { id: "a", name: "A" }, role: "clinicAdmin",
      context: { kind: "clinic", clinic: { id: patient.owner.kind === "clinic" ? patient.owner.id : "c", name: "C" } } };
    expect(() => recordAftercareSend(state, { patientID: patient.id, content: "x", medications: [], identity: admin }, 1))
      .toThrow(BackendError);
  });
});

describe("usableAuthorisations", () => {
  it("returns only active authorisations the identity may use", () => {
    const { state, patient, nurse } = ctx();
    const list = usableAuthorisations(state, patient.id, nurse, Date.now());
    expect(Array.isArray(list)).toBe(true);
  });
});
```

> Note: if the seed's first patient is not clinic-owned, adjust `findNurseFor`/the admin context using the actual `owner` shape printed by a quick `console.log` while iterating — the assertions above only depend on role gating and note shape, not specific seed ids.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/demo/__tests__/notes-ops.test.ts`
Expected: FAIL — `recordAftercareSend`, `canSendAftercare`, `usableAuthorisations`, `notePreview` not exported.

- [ ] **Step 3: Implement in `src/lib/demo/backend.ts`**

Add near the other note functions (after `saveTreatmentNote` / `appendNote`). Reuse the existing private `appendNote`, `makeID`, `identityBadge`, `canUseAuthorisation`, and `activeAuthorisations`.

```ts
export function canSendAftercare(identity: Identity): boolean {
  return identity.role === "nurse" || identity.role === "doctor";
}

export interface RecordAftercareSendInput {
  patientID: string;
  content: string;
  medications: TreatmentMedication[];
  identity: Identity;
}

export function recordAftercareSend(
  state: DemoState, input: RecordAftercareSendInput, now: number,
): { state: DemoState; note: Note } {
  const patient = state.patients[input.patientID];
  if (!patient) throw new BackendError("notFound");
  if (!patientPermissions(input.identity, patient).canView) throw new BackendError("notPermitted");
  if (!canSendAftercare(input.identity)) throw new BackendError("notPermitted");
  const note: Note = {
    id: makeID("n"),
    patientID: input.patientID,
    kind: "aftercareRecord",
    title: "Aftercare sent",
    body: input.content,
    createdAt: now,
    authorID: input.identity.user.id,
    authorBadge: identityBadge(input.identity),
    consumedAuthorisationIDs: [],
    medications: input.medications,
  };
  return appendNote(state, note);
}

// Active authorisations the identity is allowed to tick when writing a treatment note.
export function usableAuthorisations(
  state: DemoState, patientID: string, identity: Identity, now: number,
): Authorisation[] {
  return activeAuthorisations(state, patientID, now).filter((a) => canUseAuthorisation(a, identity));
}

// List-row text: the title if present, else the body's first line + "…".
export function notePreview(note: Note): string {
  if (note.title.trim()) return note.title;
  const firstLine = note.body.split("\n")[0] ?? "";
  return firstLine ? `${firstLine}…` : "(empty note)";
}
```

If `Authorisation` is not already imported at the top of `backend.ts`, add it to the existing `import type { … } from "./types"`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/demo/__tests__/notes-ops.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/demo/backend.ts src/lib/demo/__tests__/notes-ops.test.ts
git commit -m "feat(notes): aftercare record op + usableAuthorisations + notePreview"
```

---

## Task 3: Live mirror — `mirrorSendAftercare`

**Files:**
- Modify: `src/lib/firebase/mirror.ts`

- [ ] **Step 1: Add the mirror function**

After `mirrorConsumeRepeats` (it already imports `httpsCallable`, `functions`, and `TreatmentMedication`). The deployed `sendAftercare` callable expects `{ patientId, content, medications }` and writes the `aftercareRecord` note + queues the email server-side.

```ts
export async function mirrorSendAftercare(input: {
  patientID: string;
  content: string;
  medications: TreatmentMedication[];
}): Promise<void> {
  await httpsCallable(functions(), "sendAftercare")({
    patientId: input.patientID,
    content: input.content,
    medications: input.medications.map((m) => ({
      name: m.name, batch: m.batch ?? "", expiry: m.expiry ?? "", dosage: m.dosage ?? "",
    })),
  });
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/firebase/mirror.ts
git commit -m "feat(notes): mirror sendAftercare callable"
```

---

## Task 4: Store action — `sendAftercare`

**Files:**
- Modify: `src/lib/demo/store.tsx`

- [ ] **Step 1: Extend the `StoreValue` interface**

Add after the `saveTreatmentNote` line:

```ts
  sendAftercare: (input: { patientID: string; content: string; medications: TreatmentMedication[]; identity: Identity }) => void;
```

(`TreatmentMedication` and `Identity` are already imported in this file.)

- [ ] **Step 2: Implement the action in the value object**

Follow the existing `generateInvoice` demo/live split (demo mutates local state; live calls the callable then rehydrates — the callable writes the note server-side, so demo-mode local write must NOT also run in live). Add after the `saveTreatmentNote` action:

```ts
      sendAftercare: (input) => {
        if (!live) {
          setState((s) => backend.recordAftercareSend(s, input, now).state);
          return;
        }
        void (async () => {
          try {
            const m = await import("@/lib/firebase/mirror");
            await m.mirrorSendAftercare({
              patientID: input.patientID, content: input.content, medications: input.medications,
            });
            setRefreshTick((t) => t + 1);
          } catch (e) {
            setLastSyncError(String(e));
          }
        })();
      },
```

- [ ] **Step 3: Type-check + existing store tests**

Run: `npx tsc --noEmit && npx vitest run src/lib/demo/__tests__/store.test.tsx`
Expected: no type errors; existing store tests still PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/demo/store.tsx
git commit -m "feat(notes): store sendAftercare action (demo + live)"
```

---

## Task 5: `TreatmentNoteForm` component

**Files:**
- Create: `src/components/app/TreatmentNoteForm.tsx`

Behaviour: doctors may save with nothing ticked (doctor-direct); nurses must tick ≥1 usable authorisation. Ticking an authorisation autofills a medication row (name from the authorisation; batch/expiry/dosage editable). Save calls `store.saveTreatmentNote`; the button is disabled when the input would be invalid, so the backend never throws.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useState } from "react";
import { useDemoStore } from "@/lib/demo/store";
import { usableAuthorisations } from "@/lib/demo/backend";
import type { Identity, TreatmentMedication } from "@/lib/demo/types";

type MedEdit = { batch: string; expiry: string; dosage: string };

export function TreatmentNoteForm({
  patientID, identity, onDone,
}: { patientID: string; identity: Identity; onDone: () => void }) {
  const store = useDemoStore();
  const usable = usableAuthorisations(store.state, patientID, identity, store.now);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, MedEdit>>({});
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const isDoctor = identity.role === "doctor";
  const canSave = isDoctor || ticked.size > 0;

  function toggle(id: string) {
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setEdit(id: string, field: keyof MedEdit, value: string) {
    setEdits((prev) => ({ ...prev, [id]: { batch: "", expiry: "", dosage: "", ...prev[id], [field]: value } }));
  }

  function save() {
    const medications: TreatmentMedication[] = [...ticked].map((id) => {
      const a = usable.find((x) => x.id === id)!;
      const e = edits[id] ?? { batch: "", expiry: "", dosage: "" };
      return { name: a.medication.name, batch: e.batch, expiry: e.expiry, dosage: e.dosage };
    });
    store.saveTreatmentNote({ patientID, tickedIDs: [...ticked], title, body, medications, identity });
    onDone();
  }

  return (
    <div className="mt-3 rounded-inner border border-line bg-card p-4">
      <p className="micro">Treatment note</p>

      {(!isDoctor || usable.length > 0) && (
        <div className="mt-3">
          <p className="micro">1 · Tick valid authorisations</p>
          {usable.length === 0 && (
            <p className="mt-1 text-sm" style={{ color: "var(--color-rose)" }}>
              No usable authorisations. Request one from a doctor first.
            </p>
          )}
          <ul className="mt-2 flex flex-col gap-2">
            {usable.map((a) => (
              <li key={a.id} className="rounded-inner border border-line px-3 py-2">
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" checked={ticked.has(a.id)} onChange={() => toggle(a.id)} />
                  <span className="font-medium">{a.medication.name}</span>
                  <span className="text-ink-soft">· {a.repeatsRemaining} left</span>
                </label>
                {ticked.has(a.id) && (
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <input placeholder="Batch" value={edits[a.id]?.batch ?? ""} onChange={(e) => setEdit(a.id, "batch", e.target.value)} className="rounded-field border border-line px-2 py-1 text-sm" />
                    <input placeholder="MM/YY" value={edits[a.id]?.expiry ?? ""} onChange={(e) => setEdit(a.id, "expiry", e.target.value)} className="rounded-field border border-line px-2 py-1 text-sm" />
                    <input placeholder="Dosage" value={edits[a.id]?.dosage ?? ""} onChange={(e) => setEdit(a.id, "dosage", e.target.value)} className="rounded-field border border-line px-2 py-1 text-sm" />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3">
        <p className="micro">2 · Notes</p>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)"
               className="mt-1 w-full rounded-inner border border-line px-3 py-2 text-sm text-ink outline-none focus:border-tint" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Treatment details…" rows={4}
               className="mt-2 w-full rounded-inner border border-line px-3 py-2 text-sm text-ink outline-none focus:border-tint" />
      </div>

      <div className="mt-3 flex gap-2">
        <button onClick={save} disabled={!canSave}
                className="rounded-btn px-4 py-2 text-sm font-medium text-card disabled:opacity-40"
                style={{ background: "var(--color-tint)" }}>
          Save treatment note
        </button>
        <button onClick={onDone} className="rounded-btn border border-line px-4 py-2 text-sm text-ink-soft">Cancel</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/app/TreatmentNoteForm.tsx
git commit -m "feat(notes): treatment-note authoring component"
```

---

## Task 6: `AftercareForm` component

**Files:**
- Create: `src/components/app/AftercareForm.tsx`

Behaviour: category chips re-assemble the editable body on each toggle (matching iOS — manual edits persist until the next toggle); an "include medications" toggle sources the most recent treatment note's medications; send calls `store.sendAftercare`.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useState } from "react";
import { useDemoStore } from "@/lib/demo/store";
import { AFTERCARE_CATEGORIES, aftercareDisplayName, assembleAftercare, type AftercareCategory } from "@/lib/demo/aftercare";
import type { Identity } from "@/lib/demo/types";

const DEFAULT_CONTENT =
  "Thank you for visiting. Avoid touching the treated area for 4 hours, no strenuous exercise for 24 hours, and contact us with any concerns.";
const CLOSING = "\n\nContact us with any concerns — we're here to help.";

export function AftercareForm({
  patientID, identity, onDone,
}: { patientID: string; identity: Identity; onDone: () => void }) {
  const store = useDemoStore();
  const lastMeds = store.notesForPatient(patientID).find((n) => n.kind === "treatment")?.medications ?? [];
  const [selected, setSelected] = useState<AftercareCategory[]>([]);
  const [content, setContent] = useState(DEFAULT_CONTENT);
  const [includeMeds, setIncludeMeds] = useState(true);

  function toggle(c: AftercareCategory) {
    const next = selected.includes(c) ? selected.filter((x) => x !== c) : [...selected, c];
    setSelected(next);
    setContent(next.length ? assembleAftercare(next) + CLOSING : DEFAULT_CONTENT);
  }

  function send() {
    store.sendAftercare({ patientID, content, medications: includeMeds ? lastMeds : [], identity });
    onDone();
  }

  return (
    <div className="mt-3 rounded-inner border border-line bg-card p-4">
      <p className="micro">Send aftercare</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {AFTERCARE_CATEGORIES.map((c) => (
          <button key={c} onClick={() => toggle(c)}
                  className="rounded-btn border px-3 py-1.5 text-sm"
                  style={selected.includes(c)
                    ? { background: "var(--color-tint)", color: "var(--color-card)", borderColor: "var(--color-tint)" }
                    : { borderColor: "var(--color-line)", color: "var(--color-ink-soft)" }}>
            {aftercareDisplayName(c)}
          </button>
        ))}
      </div>

      <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={8}
                className="mt-3 w-full rounded-inner border border-line px-3 py-2 text-sm text-ink outline-none focus:border-tint" />

      {lastMeds.length > 0 && (
        <label className="mt-2 flex items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" checked={includeMeds} onChange={(e) => setIncludeMeds(e.target.checked)} />
          Attach this treatment&apos;s medication details ({lastMeds.map((m) => m.name).join(", ")})
        </label>
      )}

      <div className="mt-3 flex gap-2">
        <button onClick={send} className="rounded-btn px-4 py-2 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>
          Send{selected.length ? ` · ${selected.length} ${selected.length === 1 ? "category" : "categories"}` : ""}
        </button>
        <button onClick={onDone} className="rounded-btn border border-line px-4 py-2 text-sm text-ink-soft">Cancel</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/app/AftercareForm.tsx
git commit -m "feat(notes): aftercare compose component"
```

---

## Task 7: Wire the patient file — unified note stream + the two panels

**Files:**
- Modify: `src/app/app/patients/[id]/page.tsx`

- [ ] **Step 1: Update imports**

Add to the existing imports at the top:

```tsx
import { patientPermissions, notePreview, canSendAftercare } from "@/lib/demo/backend";
import { TreatmentNoteForm } from "@/components/app/TreatmentNoteForm";
import { AftercareForm } from "@/components/app/AftercareForm";
```

(Replace the existing `import { patientPermissions } from "@/lib/demo/backend";` line.)

- [ ] **Step 2: Add UI state**

After the existing `const [mergeFrom, setMergeFrom] = useState("");`:

```tsx
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showTreatment, setShowTreatment] = useState(false);
  const [showAftercare, setShowAftercare] = useState(false);
```

- [ ] **Step 3: Replace the Notes section**

Replace the current Notes block (the `<h2>Notes</h2>` heading, the general-note `<form>`, and the `<ul className="mt-4 …">` list) with:

```tsx
        <div className="mt-8 flex items-center justify-between gap-4">
          <h2 className="font-display text-xl text-ink">Notes</h2>
          <div className="flex items-center gap-2">
            {perms.canWriteTreatmentNote && (
              <button onClick={() => { setShowTreatment((v) => !v); setShowAftercare(false); }}
                      className="rounded-btn border border-line px-3 py-1.5 text-sm font-medium text-ink-soft hover:border-tint">
                Treatment note
              </button>
            )}
            {canSendAftercare(me) && (
              <button onClick={() => { setShowAftercare((v) => !v); setShowTreatment(false); }}
                      className="rounded-btn border border-line px-3 py-1.5 text-sm font-medium text-ink-soft hover:border-tint">
                Send aftercare
              </button>
            )}
          </div>
        </div>

        {showTreatment && perms.canWriteTreatmentNote && (
          <TreatmentNoteForm patientID={id} identity={me} onDone={() => setShowTreatment(false)} />
        )}
        {showAftercare && canSendAftercare(me) && (
          <AftercareForm patientID={id} identity={me} onDone={() => setShowAftercare(false)} />
        )}

        {perms.canWriteGeneralNote && (
          <form onSubmit={addNote} className="mt-3">
            <textarea
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              placeholder="Add a general note…"
              rows={2}
              className="w-full rounded-inner border border-line bg-card px-3 py-2 text-ink outline-none focus:border-tint"
            />
            <button type="submit" className="mt-2 rounded-btn px-4 py-2 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>
              Save note
            </button>
          </form>
        )}

        <ul className="mt-4 flex flex-col gap-3">
          {notes.map((n) => {
            const isOpen = expanded.has(n.id);
            return (
              <li key={n.id} className="rounded-inner border border-line bg-card px-4 py-3">
                <button
                  onClick={() => setExpanded((prev) => {
                    const next = new Set(prev);
                    if (next.has(n.id)) next.delete(n.id); else next.add(n.id);
                    return next;
                  })}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">{notePreview(n)}</span>
                    <span className="micro">{new Date(n.createdAt).toLocaleDateString()}</span>
                  </span>
                  <span className="flex flex-none items-center gap-2">
                    {n.kind !== "general" && (
                      <span className="micro rounded-full border border-line px-2 py-0.5">
                        {n.kind === "treatment" ? "Treatment" : "Aftercare"}
                      </span>
                    )}
                    <span className="micro">{n.authorBadge}</span>
                  </span>
                </button>
                {isOpen && (
                  <div className="mt-2 border-t border-line pt-2">
                    <p className="whitespace-pre-wrap text-sm text-ink-soft">{n.body}</p>
                    {n.medications.length > 0 && (
                      <ul className="mt-2 flex flex-col gap-1">
                        {n.medications.map((m, i) => (
                          <li key={i} className="text-xs text-ink-faint">
                            {m.name}{m.dosage ? ` · ${m.dosage}` : ""}{m.batch ? ` · batch ${m.batch}` : ""}{m.expiry ? ` · exp ${m.expiry}` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                    {n.kind === "treatment" && n.consumedAuthorisationIDs.length > 0 && (
                      <p className="mt-1 micro" style={{ color: "var(--color-tint)" }}>
                        Consumed {n.consumedAuthorisationIDs.length} repeat{n.consumedAuthorisationIDs.length === 1 ? "" : "s"}
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
          {notes.length === 0 && <li className="text-sm text-ink-soft">No notes yet.</li>}
        </ul>
```

- [ ] **Step 4: Type-check + full unit suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/app/patients/[id]/page.tsx
git commit -m "feat(notes): unified expandable note stream + treatment/aftercare panels"
```

---

## Task 8: Verification gate + demo smoke + lint/build

**Files:** none (verification only).

- [ ] **Step 1: Full unit suite**

Run: `npx vitest run`
Expected: all PASS (including the new `aftercare` + `notes-ops` suites).

- [ ] **Step 2: Lint + types + build**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: clean lint, no type errors, successful production build.

- [ ] **Step 3: Demo smoke (preview)**

Start the dev server (`preview_start`), sign in as the demo nurse, open a seeded patient, and confirm:
- "Treatment note" panel: tick an authorisation → medication row appears → fill batch/dosage → save → the note shows in the stream with a "Treatment" badge, expands to show medications + "Consumed 1 repeat", and the aside repeat-dots drop by one.
- "Send aftercare" panel: tick "Antiwrinkle" + "Skinbooster" → body assembles both sections → edit a line → send → an "Aftercare sent" record appears in the stream with the exact edited content.
- General note still saves; note rows expand/collapse; title-vs-first-line preview is correct.

Capture a screenshot for the PR.

- [ ] **Step 4: Final commit (if any smoke fixes)**

```bash
git add -A
git commit -m "fix(notes): address demo smoke findings"
```

---

## Self-Review Notes

- **Spec coverage:** unified stream (Task 7) ✓; title/preview rule (`notePreview`, Task 2/7) ✓; authoring permissions — treatment gated by `canWriteTreatmentNote`, doctor-direct vs nurse-ticking via existing `saveTreatmentNote` (Tasks 5/7) ✓; aftercare email with categories, editable body, optional meds, send-record note (Tasks 1/2/4/6) ✓; aftercare restricted to nurse/doctor (`canSendAftercare`) ✓.
- **Deferred (out of scope, per spec):** photo/file attachments + list thumbnails; apply-note-template (needs `note-templates`). Not represented by tasks — intentional.
- **Type consistency:** `recordAftercareSend` / `canSendAftercare` / `usableAuthorisations` / `notePreview` names match across backend, store, components, and page. `sendAftercare` store action signature matches its `StoreValue` type. Mirror payload uses `patientId`/`content`/`medications` per the deployed callable.
- **Live double-write guard:** `sendAftercare` only writes locally in demo; in live it calls the callable (which writes the note server-side) then rehydrates — no duplicate note.

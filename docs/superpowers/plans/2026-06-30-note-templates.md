# Note Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clinician-owned, private, reusable note templates (create/edit/delete on a `/app/templates` page) plus an "Apply template" hook that prefills a treatment note's body — demo + live parity.

**Architecture:** A `NoteTemplate` type + `noteTemplatesByOwner` slice of `DemoState`; pure ops in `backend.ts`; mapper encode/decode; direct Firestore mirror to `users/{uid}/noteTemplates` (rules already deployed); hydrate loads the signed-in user's templates; a management page + an apply `<select>` in the existing `TreatmentNoteForm`.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest; Firebase v11 (`firebase/firestore`).

**Source of truth:** `/Users/zhendeng/Documents/AestheticX/AestheticXKit/Sources/AXDomain/NoteTemplate.swift`, `AXData/InMemoryBackend+NoteTemplates.swift`, `AXData/LiveBackend.swift` (`encode`/`noteTemplate`, `users/{uid}/noteTemplates`), `backend/firestore.rules:32-34`. Design: `docs/superpowers/specs/2026-06-30-note-templates-design.md`.

**Existing context:**
- `src/lib/demo/aftercare.ts` — `AFTERCARE_CATEGORIES`, `AftercareCategory`, `aftercareDisplayName`.
- `src/lib/demo/backend.ts` — `emptyState()`, `BackendError`, `patientPermissions`; pure-op pattern (return new `DemoState`).
- `src/lib/firebase/mappers.ts` — private `str`, `strArray`, `Doc = Record<string, unknown>`.
- `src/lib/firebase/mirror.ts` — imports `doc, setDoc, deleteDoc`, `firestore`; encode imports from `./mappers`.
- `src/lib/firebase/hydrate.ts` — `assembleState(rows)` + `hydrate(claims)`; `runQuery(path, ...constraints)`.
- `src/lib/demo/store.tsx` — `applyAndMirror(apply, mirror)`, `StoreValue`.
- `src/components/app/AppShell.tsx` — `NAV` array.
- `src/components/app/TreatmentNoteForm.tsx` — `body`/`setBody` state.

---

## File Structure

- Modify `src/lib/demo/types.ts` — `NoteTemplate` type + `DemoState.noteTemplatesByOwner`.
- Modify `src/lib/demo/backend.ts` — `emptyState` slice + `noteTemplatesForOwner` / `saveNoteTemplate` / `deleteNoteTemplate`.
- Modify `src/lib/firebase/mappers.ts` — `encodeNoteTemplate` / `mapNoteTemplate`.
- Modify `src/lib/firebase/mirror.ts` — `mirrorSaveNoteTemplate` / `mirrorDeleteNoteTemplate`.
- Modify `src/lib/firebase/hydrate.ts` — load `users/{uid}/noteTemplates`, decode into `noteTemplatesByOwner`.
- Modify `src/lib/demo/store.tsx` — read + two actions + `StoreValue`.
- Create `src/app/app/templates/page.tsx` — management UI.
- Modify `src/components/app/AppShell.tsx` — nav link.
- Modify `src/components/app/TreatmentNoteForm.tsx` — apply `<select>`.
- Tests: `src/lib/demo/__tests__/note-templates.test.ts`.

---

## Task 1: Model + state + pure ops (TDD)

**Files:**
- Modify: `src/lib/demo/types.ts`, `src/lib/demo/backend.ts`
- Test: `src/lib/demo/__tests__/note-templates.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import {
  emptyState, noteTemplatesForOwner, saveNoteTemplate, deleteNoteTemplate, BackendError,
} from "@/lib/demo/backend";
import type { Identity, NoteTemplate } from "@/lib/demo/types";

const sarah: Identity = { user: { id: "u-sarah", name: "Sarah" }, role: "nurse", context: { kind: "independent" } };
const voss: Identity = { user: { id: "u-voss", name: "Voss" }, role: "doctor", context: { kind: "independent" } };

const tpl = (id: string, ownerID: string, name: string, body = "B"): NoteTemplate =>
  ({ id, ownerID, name, body, aftercareCategories: [] });

describe("note templates", () => {
  it("lists an owner's templates alphabetically by name", () => {
    let s = emptyState();
    s = saveNoteTemplate(s, tpl("t1", "u-sarah", "Zinc"), sarah);
    s = saveNoteTemplate(s, tpl("t2", "u-sarah", "anti-wrinkle"), sarah);
    expect(noteTemplatesForOwner(s, "u-sarah").map((t) => t.name)).toEqual(["anti-wrinkle", "Zinc"]);
  });

  it("upserts by id (edit replaces, no duplicate)", () => {
    let s = emptyState();
    s = saveNoteTemplate(s, tpl("t1", "u-sarah", "Draft"), sarah);
    s = saveNoteTemplate(s, { ...tpl("t1", "u-sarah", "Final"), body: "B2" }, sarah);
    const list = noteTemplatesForOwner(s, "u-sarah");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: "t1", name: "Final", body: "B2" });
  });

  it("rejects saving a template owned by someone else", () => {
    expect(() => saveNoteTemplate(emptyState(), tpl("t1", "u-voss", "X"), sarah)).toThrow(BackendError);
  });

  it("only deletes the caller's own template", () => {
    let s = emptyState();
    s = saveNoteTemplate(s, tpl("t1", "u-sarah", "Mine"), sarah);
    s = saveNoteTemplate(s, tpl("t2", "u-voss", "Theirs"), voss);
    s = deleteNoteTemplate(s, "t2", sarah); // sarah cannot remove voss's; scoped to caller
    expect(noteTemplatesForOwner(s, "u-voss").map((t) => t.id)).toEqual(["t2"]);
    s = deleteNoteTemplate(s, "t1", sarah);
    expect(noteTemplatesForOwner(s, "u-sarah")).toEqual([]);
  });

  it("keeps templates private to their owner", () => {
    let s = emptyState();
    s = saveNoteTemplate(s, tpl("t1", "u-sarah", "Mine"), sarah);
    expect(noteTemplatesForOwner(s, "u-voss")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/demo/__tests__/note-templates.test.ts`
Expected: FAIL — `noteTemplatesForOwner` etc. not exported; `NoteTemplate` type missing.

- [ ] **Step 3a: Add the type + state in `src/lib/demo/types.ts`**

At the top of the file, add the import (a one-way dep — `aftercare.ts` imports nothing from `types.ts`):

```ts
import type { AftercareCategory } from "./aftercare";
```

Add the interface (near `Note`):

```ts
export interface NoteTemplate {
  id: string;
  ownerID: string; // private to this user
  name: string;
  body: string;
  aftercareCategories: AftercareCategory[];
}
```

Add to `DemoState`:

```ts
  noteTemplatesByOwner: Record<string, NoteTemplate[]>;
```

- [ ] **Step 3b: Add the ops in `src/lib/demo/backend.ts`**

Add `NoteTemplate` to the `import type { … } from "./types"` block. Add `noteTemplatesByOwner: {},` to the object returned by `emptyState()`. Then add the ops (near the note functions):

```ts
export function noteTemplatesForOwner(state: DemoState, ownerID: string): NoteTemplate[] {
  return [...(state.noteTemplatesByOwner[ownerID] ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

export function saveNoteTemplate(state: DemoState, template: NoteTemplate, identity: Identity): DemoState {
  // A user may only write their own templates (mirrors the Firestore rule uid()==userId).
  if (template.ownerID !== identity.user.id) throw new BackendError("notPermitted");
  const list = state.noteTemplatesByOwner[template.ownerID] ?? [];
  const next = [...list.filter((t) => t.id !== template.id), template]; // upsert by id
  return { ...state, noteTemplatesByOwner: { ...state.noteTemplatesByOwner, [template.ownerID]: next } };
}

export function deleteNoteTemplate(state: DemoState, id: string, identity: Identity): DemoState {
  const ownerID = identity.user.id; // scoped to the caller — never another user's list
  const list = state.noteTemplatesByOwner[ownerID] ?? [];
  return { ...state, noteTemplatesByOwner: { ...state.noteTemplatesByOwner, [ownerID]: list.filter((t) => t.id !== id) } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/demo/__tests__/note-templates.test.ts`
Expected: PASS (5 tests). Also run `npx vitest run` to confirm no existing test broke on the new required `DemoState` field — if a test constructs a bare state object, it will use `emptyState()` so it is covered; if `tsc` complains elsewhere, fix those call sites to spread `emptyState()`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/demo/types.ts src/lib/demo/backend.ts src/lib/demo/__tests__/note-templates.test.ts
git commit -m "feat(templates): NoteTemplate model + private CRUD ops"
```

---

## Task 2: Mapper encode/decode (TDD)

**Files:**
- Modify: `src/lib/firebase/mappers.ts`
- Test: append to `src/lib/demo/__tests__/note-templates.test.ts`

- [ ] **Step 1: Add the failing test** (append to the test file)

```ts
import { encodeNoteTemplate, mapNoteTemplate } from "@/lib/firebase/mappers";

describe("note template mapper", () => {
  it("round-trips through encode -> map", () => {
    const t = { id: "t1", ownerID: "u-sarah", name: "Lip filler", body: "Std body", aftercareCategories: ["haFiller" as const] };
    const doc = encodeNoteTemplate(t);
    expect(doc).toMatchObject({ ownerId: "u-sarah", name: "Lip filler", body: "Std body", aftercareCategories: ["haFiller"] });
    expect(mapNoteTemplate("t1", doc)).toEqual(t);
  });

  it("drops unknown aftercare categories on decode", () => {
    const mapped = mapNoteTemplate("t1", { ownerId: "u", name: "n", body: "b", aftercareCategories: ["antiwrinkle", "bogus"] });
    expect(mapped.aftercareCategories).toEqual(["antiwrinkle"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/demo/__tests__/note-templates.test.ts`
Expected: FAIL — `encodeNoteTemplate`/`mapNoteTemplate` not exported.

- [ ] **Step 3: Implement in `src/lib/firebase/mappers.ts`**

Add to imports: `NoteTemplate` in the `from "@/lib/demo/types"` type import, and a new line `import { AFTERCARE_CATEGORIES, type AftercareCategory } from "@/lib/demo/aftercare";`. Then add:

```ts
export function encodeNoteTemplate(t: NoteTemplate): Doc {
  return { ownerId: t.ownerID, name: t.name, body: t.body, aftercareCategories: t.aftercareCategories };
}

export function mapNoteTemplate(id: string, data: Doc): NoteTemplate {
  const cats = strArray(data.aftercareCategories)
    .filter((c): c is AftercareCategory => (AFTERCARE_CATEGORIES as readonly string[]).includes(c));
  return { id, ownerID: str(data.ownerId), name: str(data.name), body: str(data.body), aftercareCategories: cats };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/demo/__tests__/note-templates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/firebase/mappers.ts src/lib/demo/__tests__/note-templates.test.ts
git commit -m "feat(templates): note template Firestore mapper"
```

---

## Task 3: Mirror functions

**Files:** Modify `src/lib/firebase/mirror.ts`

- [ ] **Step 1: Add the functions**

Add `encodeNoteTemplate` to the existing `from "./mappers"` import and `NoteTemplate` to the `from "@/lib/demo/types"` type import. Then append:

```ts
export async function mirrorSaveNoteTemplate(t: NoteTemplate): Promise<void> {
  await setDoc(doc(firestore(), `users/${t.ownerID}/noteTemplates`, t.id), encodeNoteTemplate(t));
}

export async function mirrorDeleteNoteTemplate(ownerID: string, id: string): Promise<void> {
  await deleteDoc(doc(firestore(), `users/${ownerID}/noteTemplates`, id));
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/firebase/mirror.ts
git commit -m "feat(templates): mirror note template save/delete"
```

---

## Task 4: Hydrate wiring

**Files:** Modify `src/lib/firebase/hydrate.ts`

- [ ] **Step 1: Extend `HydrationRows` + `assembleState`**

Add `mapNoteTemplate` to the `from "./mappers"` import. Add to the `HydrationRows` interface:

```ts
  noteTemplates: Row[];
```

In `assembleState`, before the `return`, add:

```ts
  const noteTemplatesByOwner: DemoState["noteTemplatesByOwner"] = {};
  for (const r of rows.noteTemplates) {
    const t = mapNoteTemplate(r.id, r.data);
    (noteTemplatesByOwner[t.ownerID] ??= []).push(t);
  }
```

And add `noteTemplatesByOwner` to the returned object.

- [ ] **Step 2: Load templates in both `hydrate` paths**

In the super-admin branch's `assembleState({ … })` call, add:

```ts
      noteTemplates: await runQuery(`users/${uid}/noteTemplates`),
```

In the final (normal) `assembleState({ … })` call, add the same line:

```ts
    noteTemplates: await runQuery(`users/${uid}/noteTemplates`),
```

- [ ] **Step 3: Type-check + existing hydrate tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; all tests pass. If an `assembleState` test fixture exists, add `noteTemplates: []` to it.

- [ ] **Step 4: Commit**

```bash
git add src/lib/firebase/hydrate.ts
git commit -m "feat(templates): hydrate user's note templates on sign-in"
```

---

## Task 5: Store read + actions

**Files:** Modify `src/lib/demo/store.tsx`

- [ ] **Step 1: Extend `StoreValue`**

Add after the `saveTreatmentNote` line:

```ts
  noteTemplatesForOwner: (ownerID: string) => ReturnType<typeof backend.noteTemplatesForOwner>;
  saveNoteTemplate: (template: import("./types").NoteTemplate, identity: Identity) => void;
  deleteNoteTemplate: (id: string, identity: Identity) => void;
```

- [ ] **Step 2: Add read + actions to the value object**

Add near the other note actions:

```ts
      noteTemplatesForOwner: (ownerID) => backend.noteTemplatesForOwner(state, ownerID),
      saveNoteTemplate: (template, identity) =>
        applyAndMirror(
          (s) => backend.saveNoteTemplate(s, template, identity),
          (m) => m.mirrorSaveNoteTemplate(template),
        ),
      deleteNoteTemplate: (id, identity) =>
        applyAndMirror(
          (s) => backend.deleteNoteTemplate(s, id, identity),
          (m) => m.mirrorDeleteNoteTemplate(identity.user.id, id),
        ),
```

- [ ] **Step 3: Type-check + store tests**

Run: `npx tsc --noEmit && npx vitest run src/lib/demo/__tests__/store.test.tsx`
Expected: clean; tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/demo/store.tsx
git commit -m "feat(templates): store note template read + save/delete actions"
```

---

## Task 6: Templates management page + nav link

**Files:**
- Create: `src/app/app/templates/page.tsx`
- Modify: `src/components/app/AppShell.tsx`

- [ ] **Step 1: Add the nav link**

In `src/components/app/AppShell.tsx`, add to the `NAV` array (after Calendar):

```ts
  { href: "/app/templates", label: "Templates" },
```

- [ ] **Step 2: Create the page**

```tsx
"use client";

import { useState } from "react";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { AFTERCARE_CATEGORIES, aftercareDisplayName, type AftercareCategory } from "@/lib/demo/aftercare";
import type { NoteTemplate } from "@/lib/demo/types";

export default function TemplatesPage() {
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  const [editing, setEditing] = useState<NoteTemplate | null>(null);

  if (!identity) return null;
  if (store.status === "loading") return <p className="text-ink-soft">Loading…</p>;
  if (store.status === "error") return <p className="text-ink-soft">Could not load data. Open the dashboard to retry.</p>;
  const me = identity;
  const templates = store.noteTemplatesForOwner(me.user.id);

  function blank(): NoteTemplate {
    return { id: crypto.randomUUID(), ownerID: me.user.id, name: "", body: "", aftercareCategories: [] };
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-3xl text-ink">Note templates</h1>
      <p className="mt-2 text-ink-soft">Reusable autofill for your treatment notes. Private to you.</p>

      {editing ? (
        <TemplateEditor
          key={editing.id}
          template={editing}
          onCancel={() => setEditing(null)}
          onSave={(t) => { store.saveNoteTemplate(t, me); setEditing(null); }}
        />
      ) : (
        <button onClick={() => setEditing(blank())}
                className="mt-5 rounded-btn px-4 py-2 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>
          New template
        </button>
      )}

      <ul className="mt-6 flex flex-col gap-3">
        {templates.map((t) => (
          <li key={t.id} className="rounded-inner border border-line bg-card px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block font-medium text-ink">{t.name || "(untitled)"}</span>
                <span className="block truncate text-sm text-ink-soft">{t.body || "—"}</span>
              </span>
              <span className="flex flex-none gap-2">
                <button onClick={() => setEditing(t)} className="rounded-btn border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-tint">Edit</button>
                <button onClick={() => store.deleteNoteTemplate(t.id, me)} className="rounded-btn border border-line px-3 py-1.5 text-sm" style={{ color: "var(--color-rose)" }}>Delete</button>
              </span>
            </div>
            {t.aftercareCategories.length > 0 && (
              <p className="mt-1 micro">{t.aftercareCategories.map(aftercareDisplayName).join(" · ")}</p>
            )}
          </li>
        ))}
        {templates.length === 0 && !editing && <li className="text-sm text-ink-soft">No templates yet.</li>}
      </ul>
    </div>
  );
}

function TemplateEditor({
  template, onSave, onCancel,
}: { template: NoteTemplate; onSave: (t: NoteTemplate) => void; onCancel: () => void }) {
  const [name, setName] = useState(template.name);
  const [body, setBody] = useState(template.body);
  const [cats, setCats] = useState<AftercareCategory[]>(template.aftercareCategories);

  function toggle(c: AftercareCategory) {
    setCats((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);
  }

  return (
    <div className="mt-5 rounded-inner border border-line bg-card p-4">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name"
             className="w-full rounded-inner border border-line px-3 py-2 text-sm text-ink outline-none focus:border-tint" />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Default note body…" rows={5}
             className="mt-2 w-full rounded-inner border border-line px-3 py-2 text-sm text-ink outline-none focus:border-tint" />
      <div className="mt-3 flex flex-wrap gap-2">
        {AFTERCARE_CATEGORIES.map((c) => (
          <button key={c} onClick={() => toggle(c)} className="rounded-btn border px-3 py-1.5 text-sm"
                  style={cats.includes(c)
                    ? { background: "var(--color-tint)", color: "var(--color-card)", borderColor: "var(--color-tint)" }
                    : { borderColor: "var(--color-line)", color: "var(--color-ink-soft)" }}>
            {aftercareDisplayName(c)}
          </button>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <button onClick={() => onSave({ ...template, name: name.trim(), body, aftercareCategories: cats })} disabled={!name.trim()}
                className="rounded-btn px-4 py-2 text-sm font-medium text-card disabled:opacity-40" style={{ background: "var(--color-tint)" }}>
          Save template
        </button>
        <button onClick={onCancel} className="rounded-btn border border-line px-4 py-2 text-sm text-ink-soft">Cancel</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check + build**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/app/templates/page.tsx src/components/app/AppShell.tsx
git commit -m "feat(templates): management page + nav link"
```

---

## Task 7: Apply hook in `TreatmentNoteForm`

**Files:** Modify `src/components/app/TreatmentNoteForm.tsx`

- [ ] **Step 1: Add the apply `<select>`**

The component already has `store`, `identity`, and `body`/`setBody`. After computing `usable`, add:

```tsx
  const templates = store.noteTemplatesForOwner(identity.user.id);
```

Then, immediately inside the "2 · Notes" block (before the title input), render the selector when templates exist:

```tsx
        {templates.length > 0 && (
          <select
            defaultValue=""
            onChange={(e) => {
              const t = templates.find((x) => x.id === e.target.value);
              if (t) setBody(t.body); // prefill only — body stays editable (iOS-faithful)
              e.target.value = "";
            }}
            className="mb-2 w-full rounded-inner border border-line px-3 py-2 text-sm text-ink-soft outline-none focus:border-tint"
          >
            <option value="" disabled>Apply a template…</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name || "(untitled)"}</option>)}
          </select>
        )}
```

- [ ] **Step 2: Type-check + full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean; all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/app/TreatmentNoteForm.tsx
git commit -m "feat(templates): apply a saved template to prefill a treatment note"
```

---

## Task 8: Verification gate + demo smoke + PR

**Files:** none (verification only).

- [ ] **Step 1: Full gate**

Run: `npx vitest run && npx tsc --noEmit && npx eslint src && npm run build`
Expected: all tests pass; clean types; clean lint; successful build.

- [ ] **Step 2: Demo smoke (preview)**

`.env.local` makes `npm run dev` run in live mode — move it aside (`mv .env.local .env.local.bak`), restart the preview, and after the smoke restore it (`mv .env.local.bak .env.local`). As Dr Voss:
- Open **Templates** in the nav → "New template" → name "Antiwrinkle std" + a body + tick a category → Save → it appears in the list. Edit it (rename) → the row updates, no duplicate. 
- Open a patient → "Treatment note" → the "Apply a template…" selector lists it → choosing it fills the body → the body is still editable → save.
- Delete the template on the Templates page → it disappears and is no longer offered in the note editor.
No console errors.

- [ ] **Step 3: Commit any smoke fixes, then open the PR**

```bash
git push -u origin feature/note-templates
gh pr create --base main --title "feat(templates): clinician note templates + apply-to-note" --body-file <(printf '...')
```

---

## Self-Review Notes

- **Spec coverage:** create/view/edit/delete (Tasks 1, 6) ✓; multiple templates listed + individually selectable (Task 6 list + Task 7 select) ✓; private to owner (`saveNoteTemplate` own-only + `noteTemplatesForOwner` per-owner + rules) ✓; persists across sessions (live mirror + hydrate, Tasks 3–4) ✓; apply prefills body (Task 7, iOS-faithful) ✓.
- **Type consistency:** `NoteTemplate { id, ownerID, name, body, aftercareCategories }` is identical across types/backend/mappers/mirror/store/UI. Firestore field names: `ownerId`, `name`, `body`, `aftercareCategories` (matches iOS `LiveBackend.encode`).
- **No placeholders:** every step has full code. The only literal `printf '...'` is the PR body, written at PR time from the actual diff.
- **Deferred (per spec):** sharing, medication scaffolding, auto-applying template categories to the aftercare flow.

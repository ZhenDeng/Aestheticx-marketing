# Note Templates — Design

**Goal:** Port the iOS `note-templates` capability to the web: clinician-owned, private,
reusable autofill templates for treatment notes — create / edit / delete, and apply one to
prefill a treatment note's body. Closes the increment-1 deferral (apply-a-template in the
treatment-note editor). Demo + live parity.

**Source of truth (read directly):**
- `/Users/zhendeng/Documents/AestheticX/openspec/specs/note-templates/spec.md`
- `/Users/zhendeng/Documents/AestheticX/AestheticXKit/Sources/AXDomain/NoteTemplate.swift`
- `/Users/zhendeng/Documents/AestheticX/AestheticXKit/Sources/AXData/InMemoryBackend+NoteTemplates.swift` (ops)
- `/Users/zhendeng/Documents/AestheticX/AestheticXKit/Sources/AXData/LiveBackend.swift` (`encode`/`noteTemplate`, `users/{uid}/noteTemplates` paths)
- `/Users/zhendeng/Documents/AestheticX/backend/firestore.rules` (lines 32-34 — deployed: `users/{userId}/noteTemplates` read/write iff `uid()==userId`)

## Model

```ts
interface NoteTemplate {
  id: string;
  ownerID: string;                       // private to this user
  name: string;
  body: string;
  aftercareCategories: AftercareCategory[];
}
```

`DemoState` gains `noteTemplatesByOwner: Record<string, NoteTemplate[]>` (and `emptyState()`).

## Layers

### Domain (pure, `backend.ts`)
- `noteTemplatesForOwner(state, ownerID): NoteTemplate[]` — the owner's templates, sorted
  alphabetically by name (case-insensitive), matching iOS.
- `saveNoteTemplate(state, template, identity): DemoState` — upsert by id. A user may only
  write their **own** template: throw `BackendError("notPermitted")` if
  `template.ownerID !== identity.user.id`.
- `deleteNoteTemplate(state, id, identity): DemoState` — remove the template with that id
  from `identity.user.id`'s list only (never another user's).

### Live parity
- **Mapper** (`mappers.ts`): `encodeNoteTemplate(t)` → `{ ownerId, name, body, aftercareCategories: string[] }`;
  `mapNoteTemplate(id, data)` → `NoteTemplate` (decode `aftercareCategories` as `AftercareCategory[]`,
  filtering unknown values defensively).
- **Mirror** (`mirror.ts`): `mirrorSaveNoteTemplate(t)` → `setDoc(doc(firestore(), "users/" + t.ownerID + "/noteTemplates", t.id), encodeNoteTemplate(t))`;
  `mirrorDeleteNoteTemplate(ownerID, id)` → `deleteDoc(...)`. Direct writes (rules-enforced),
  mirroring iOS `LiveBackend.saveNoteTemplate` / `deleteNoteTemplate`.
- **Hydrate** (`hydrate.ts`): load `users/{uid}/noteTemplates` for the signed-in uid and fold
  into `noteTemplatesByOwner[uid]` via `assembleState`.

### Store (`store.tsx`)
- Read passthrough: `noteTemplatesForOwner(ownerID)`.
- Actions `saveNoteTemplate(template, identity)` / `deleteNoteTemplate(id, identity)` via the
  existing `applyAndMirror` (demo applies the pure op; live also mirrors).

### UI
- **`/app/templates`** (new route, linked in the app nav `AppShell`): lists the signed-in
  user's templates; a create/edit form (name, body, tappable aftercare-category chips reusing
  the increment-1 chip styling) and a delete control. Only the owner's templates are shown.
- **Apply hook** in `TreatmentNoteForm`: an "Apply template" `<select>` of the author's saved
  templates; choosing one sets the note **body** to `template.body` (iOS-faithful — iOS
  `apply` does `freeText = template.body`). Prefill only; the field stays editable. No
  templates → the control is hidden and the editor works normally.

## Data flow
- **Demo:** pure reducers over `noteTemplatesByOwner`.
- **Live:** direct Firestore `setDoc`/`deleteDoc` to `users/{uid}/noteTemplates` (rules already
  deployed); hydrate loads them on sign-in.

## Error handling
Own-only violations throw `BackendError("notPermitted")`; live failures surface through the
existing `lastSyncError` → `AppShell` banner.

## Testing (TDD)
- `note-templates.test.ts` — alphabetical listing; upsert-by-id (edit replaces, not duplicates);
  `saveNoteTemplate` rejects a foreign `ownerID`; `deleteNoteTemplate` only removes the caller's
  own; private listing (one owner can't see another's).
- mapper round-trip (`encodeNoteTemplate` → `mapNoteTemplate`), including category decode.
- Demo smoke: create a template on `/app/templates`, then in a treatment note apply it and see
  the body prefilled and still editable.

## Out of scope (deferred)
- Sharing templates between users (spec: templates are private — no sharing).
- Medication scaffolding inside templates (the spec lists it only as a "such as" example; body +
  aftercare categories cover the core — defer until a concrete need).
- Auto-applying a template's `aftercareCategories` into the aftercare compose flow (stored on the
  model + editable in management, but the treatment-note apply path sets body only, per iOS).

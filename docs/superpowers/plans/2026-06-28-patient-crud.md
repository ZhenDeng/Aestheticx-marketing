# Patient CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add patient create / edit / delete / merge to the web app, working in demo (in-memory) and live (Firestore) modes, within the hardened security rules.

**Architecture:** Pure domain ops in `src/lib/demo/backend.ts` (TDD), Firestore encoders in `mappers.ts`, write mirroring in `mirror.ts`, four new store actions (optimistic + mirror), a shared `PatientForm`, create/edit routes, and delete/merge affordances on the patient file — all permission-gated.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest; Firebase v11 (`setDoc`/`updateDoc`/`deleteDoc`/`httpsCallable`).

**Existing context (do not re-derive):**
- `src/lib/demo/types.ts` exports `Patient`, `PatientOwner`, `DateOfBirth`, `Identity`. `Patient` = `{ id, givenName, lastName, dateOfBirth: DateOfBirth, gender, address, phone, email, allergies, currentMedications, owner: PatientOwner, prescribingDoctorIDs: string[], alert?, preferredName? }`.
- `src/lib/demo/backend.ts` exports `emptyState`, `patientPermissions(identity, patient)` → `Permissions { canView, canEditDetails, canDelete, canMerge, canWriteGeneralNote, canWriteTreatmentNote, canSendForms, canViewBusinessStats }`, `searchPatients`, `BackendError`, and a private `makeID(prefix)` (returns `prefix-<uuid>`). `clinicAdmin` on a clinic patient has `canDelete` + `canMerge` true; independent nurse/doctor owners have `canDelete` true, `canMerge` false; super-admin has neither.
- `src/lib/firebase/mappers.ts` exports `formatDob`, `encodeMedication`, etc. (pure, no firebase imports).
- `src/lib/firebase/mirror.ts` imports `doc, setDoc` from `firebase/firestore` and `httpsCallable` from `firebase/functions`, plus `firestore()`, `functions()` from `./client`.
- `src/lib/demo/store.tsx` has `applyAndMirror(apply, mirror)` (optimistic local apply then mirror; no-op in demo), `now`, `live`, `setState`, `setLastSyncError`, and the `StoreValue` interface consumed by pages. Pages read `const store = useDemoStore()`.
- `patientPermissions` field list per the iOS matrix; the hardened Firestore rules: patient create requires the 9 mandatory keys + `ownerType`/`ownerId` via `hasAll` and blocks `prescribingDoctorIds`; update blocks `ownerType`/`ownerId`/`prescribingDoctorIds`; `mergePatients` is a Cloud Function taking `{ keepId, removeId }`.

---

## Task 1: Draft types + helpers

**Files:**
- Modify: `src/lib/demo/types.ts`
- Test: `src/lib/demo/__tests__/draft.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/demo/__tests__/draft.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { emptyDraft, draftFromPatient, type Patient } from "@/lib/demo/types";

const patient: Patient = {
  id: "p1", givenName: "Amara", lastName: "Boyd",
  dateOfBirth: { year: 1991, month: 3, day: 12 }, gender: "Female",
  address: "7 St Kilda", phone: "0401", email: "a@x.com",
  allergies: "Lidocaine", currentMedications: "Levo",
  owner: { kind: "clinic", id: "clinic-lumiere" }, prescribingDoctorIDs: ["u-voss"],
  alert: "anaphylaxis", preferredName: "Mara",
};

describe("emptyDraft", () => {
  it("is all-blank with a null dob", () => {
    const d = emptyDraft();
    expect(d.givenName).toBe("");
    expect(d.dateOfBirth).toBeNull();
    expect(d.gender).toBe("");
  });
});

describe("draftFromPatient", () => {
  it("copies fields for editing", () => {
    const d = draftFromPatient(patient);
    expect(d.givenName).toBe("Amara");
    expect(d.dateOfBirth).toEqual({ year: 1991, month: 3, day: 12 });
    expect(d.preferredName).toBe("Mara");
    expect(d.alert).toBe("anaphylaxis");
  });
});
```

- [ ] **Step 2: Run** — `npm test -- draft` → FAIL (exports missing).

- [ ] **Step 3: Implement** — append to `src/lib/demo/types.ts`:
```ts
export type PatientField =
  | "givenName" | "lastName" | "dateOfBirth" | "gender"
  | "address" | "phone" | "email" | "allergies" | "currentMedications";

// All-string form state for the intake/edit form (dob held separately).
export interface PatientDraft {
  givenName: string;
  lastName: string;
  preferredName: string;
  dateOfBirth: DateOfBirth | null;
  gender: string; // "" | "Male" | "Female" | "Other"
  address: string;
  phone: string;
  email: string;
  allergies: string;
  currentMedications: string;
  alert: string;
}

export function emptyDraft(): PatientDraft {
  return {
    givenName: "", lastName: "", preferredName: "", dateOfBirth: null, gender: "",
    address: "", phone: "", email: "", allergies: "", currentMedications: "", alert: "",
  };
}

export function draftFromPatient(p: Patient): PatientDraft {
  return {
    givenName: p.givenName, lastName: p.lastName, preferredName: p.preferredName ?? "",
    dateOfBirth: p.dateOfBirth, gender: p.gender, address: p.address, phone: p.phone,
    email: p.email, allergies: p.allergies, currentMedications: p.currentMedications,
    alert: p.alert ?? "",
  };
}
```

- [ ] **Step 4: Run** — `npm test -- draft` → PASS. `npx tsc --noEmit` → clean.
- [ ] **Step 5: Commit**
```bash
git add src/lib/demo/types.ts src/lib/demo/__tests__/draft.test.ts
git commit -m "feat(patients): add PatientDraft type + form helpers"
```

---

## Task 2: Domain ops — validate / create / update / delete / merge (TDD)

**Files:**
- Modify: `src/lib/demo/backend.ts`
- Test: `src/lib/demo/__tests__/patient-crud.test.ts`

- [ ] **Step 1: Write the failing tests** — `src/lib/demo/__tests__/patient-crud.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import type { DemoState, Identity, Patient } from "@/lib/demo/types";
import { emptyDraft } from "@/lib/demo/types";
import {
  emptyState, missingFields, canCreatePatient, createPatient,
  updatePatient, deletePatient, mergePatients,
} from "@/lib/demo/backend";

const NOW = Date.UTC(2026, 5, 28);
const nurse: Identity = { user: { id: "u-sarah", name: "Sarah" }, role: "nurse", context: { kind: "independent" } };
const admin: Identity = { user: { id: "u-ava", name: "Ava" }, role: "clinicAdmin", context: { kind: "clinic", clinic: { id: "c1", name: "C1" } } };
const superAdmin: Identity = { user: { id: "u-root", name: "Root" }, role: "superAdmin", context: { kind: "independent" } };

function fullDraft() {
  return { ...emptyDraft(), givenName: "Amara", lastName: "Boyd",
    dateOfBirth: { year: 1991, month: 3, day: 12 }, gender: "Female", address: "x",
    phone: "0401", email: "a@x.com", allergies: "NKDA", currentMedications: "Nil" };
}
function clinicPatient(id: string): Patient {
  return { id, givenName: "G", lastName: "H", dateOfBirth: { year: 1980, month: 1, day: 1 },
    gender: "Female", address: "x", phone: "x", email: "x", allergies: "x", currentMedications: "x",
    owner: { kind: "clinic", id: "c1" }, prescribingDoctorIDs: [] };
}

describe("missingFields", () => {
  it("flags every blank mandatory field", () => {
    expect(missingFields(emptyDraft()).size).toBe(9);
  });
  it("is empty for a complete draft", () => {
    expect(missingFields(fullDraft()).size).toBe(0);
  });
});

describe("canCreatePatient", () => {
  it("allows a nurse, denies a super admin", () => {
    expect(canCreatePatient(nurse)).toBe(true);
    expect(canCreatePatient(superAdmin)).toBe(false);
  });
});

describe("createPatient", () => {
  it("derives a nurse-self owner and never sets prescribers", () => {
    const { state, patient } = createPatient(emptyState(), fullDraft(), nurse, NOW);
    expect(patient.owner).toEqual({ kind: "nurse", id: "u-sarah" });
    expect(patient.prescribingDoctorIDs).toEqual([]);
    expect(state.patients[patient.id]).toBeDefined();
  });
  it("derives a clinic owner from clinic context", () => {
    const { patient } = createPatient(emptyState(), fullDraft(), admin, NOW);
    expect(patient.owner).toEqual({ kind: "clinic", id: "c1" });
  });
  it("throws on an incomplete draft", () => {
    expect(() => createPatient(emptyState(), emptyDraft(), nurse, NOW)).toThrow();
  });
});

describe("updatePatient", () => {
  it("preserves owner and prescribers, applies edits", () => {
    let state = emptyState();
    const p: Patient = { ...clinicPatient("p1"), prescribingDoctorIDs: ["u-voss"] };
    state = { ...state, patients: { p1: p } };
    const edited: Patient = { ...p, givenName: "Grace", owner: { kind: "nurse", id: "x" }, prescribingDoctorIDs: [] };
    const next = updatePatient(state, edited, admin);
    expect(next.patients.p1.givenName).toBe("Grace");
    expect(next.patients.p1.owner).toEqual({ kind: "clinic", id: "c1" }); // unchanged
    expect(next.patients.p1.prescribingDoctorIDs).toEqual(["u-voss"]); // unchanged
  });
  it("denies a non-editor", () => {
    const state = { ...emptyState(), patients: { p1: clinicPatient("p1") } };
    const otherNurse: Identity = { ...nurse, user: { id: "u-other", name: "O" } };
    expect(() => updatePatient(state, clinicPatient("p1"), otherNurse)).toThrow();
  });
});

describe("deletePatient", () => {
  it("removes the patient and its notes", () => {
    const state: DemoState = { ...emptyState(),
      patients: { p1: clinicPatient("p1") },
      notesByPatient: { p1: [{ id: "n1", patientID: "p1", kind: "general", title: "", body: "x", createdAt: 1, authorID: "a", authorBadge: "b", consumedAuthorisationIDs: [], medications: [] }] } };
    const next = deletePatient(state, "p1", admin);
    expect(next.patients.p1).toBeUndefined();
    expect(next.notesByPatient.p1).toBeUndefined();
  });
});

describe("mergePatients", () => {
  it("re-points notes + authorisations, unions prescribers, drops the duplicate", () => {
    const keep: Patient = { ...clinicPatient("keep"), prescribingDoctorIDs: ["d1"] };
    const remove: Patient = { ...clinicPatient("remove"), prescribingDoctorIDs: ["d2"] };
    const state: DemoState = { ...emptyState(),
      patients: { keep, remove },
      notesByPatient: { remove: [{ id: "n1", patientID: "remove", kind: "general", title: "", body: "x", createdAt: 1, authorID: "a", authorBadge: "b", consumedAuthorisationIDs: [], medications: [] }] },
      authorisations: { a1: { id: "a1", requestID: "r", patientID: "remove", doctorID: "d", nurseID: "n", clinicID: "c1", medication: { name: "x", dosage: "1", category: "other", unit: "freeText", areas: [] }, repeatsRemaining: 5, expiresAt: NOW + 1 } } };
    const next = mergePatients(state, "keep", "remove", admin);
    expect(next.patients.remove).toBeUndefined();
    expect(next.notesByPatient.keep).toHaveLength(1);
    expect(next.notesByPatient.keep[0].patientID).toBe("keep");
    expect(next.authorisations.a1.patientID).toBe("keep");
    expect(next.patients.keep.prescribingDoctorIDs.sort()).toEqual(["d1", "d2"]);
  });
});
```

- [ ] **Step 2: Run** — `npm test -- patient-crud` → FAIL (exports missing).

- [ ] **Step 3: Implement** — append to `src/lib/demo/backend.ts`:
```ts
import type { PatientDraft, PatientField, PatientOwner } from "./types";

export const PATIENT_FIELDS: PatientField[] = [
  "givenName", "lastName", "dateOfBirth", "gender",
  "address", "phone", "email", "allergies", "currentMedications",
];

export function missingFields(draft: PatientDraft): Set<PatientField> {
  const missing = new Set<PatientField>();
  const check = (v: string, f: PatientField) => { if (!v.trim()) missing.add(f); };
  check(draft.givenName, "givenName");
  check(draft.lastName, "lastName");
  if (!draft.dateOfBirth) missing.add("dateOfBirth");
  if (!draft.gender.trim()) missing.add("gender");
  check(draft.address, "address");
  check(draft.phone, "phone");
  check(draft.email, "email");
  check(draft.allergies, "allergies");
  check(draft.currentMedications, "currentMedications");
  return missing;
}

export function canCreatePatient(identity: Identity): boolean {
  return identity.role !== "superAdmin";
}

function ownerFor(identity: Identity): PatientOwner {
  if (identity.context.kind === "clinic") return { kind: "clinic", id: identity.context.clinic.id };
  if (identity.role === "doctor") return { kind: "doctor", id: identity.user.id };
  return { kind: "nurse", id: identity.user.id };
}

export function createPatient(
  state: DemoState, draft: PatientDraft, identity: Identity, _now: number,
): { state: DemoState; patient: Patient } {
  if (!canCreatePatient(identity)) throw new BackendError("notPermitted");
  if (missingFields(draft).size > 0) throw new BackendError("validationFailed");
  const patient: Patient = {
    id: makeID("p"),
    givenName: draft.givenName.trim(),
    lastName: draft.lastName.trim(),
    dateOfBirth: draft.dateOfBirth!,
    gender: draft.gender,
    address: draft.address.trim(),
    phone: draft.phone.trim(),
    email: draft.email.trim(),
    allergies: draft.allergies.trim(),
    currentMedications: draft.currentMedications.trim(),
    owner: ownerFor(identity),
    prescribingDoctorIDs: [],
    alert: draft.alert.trim() ? draft.alert.trim() : undefined,
    preferredName: draft.preferredName.trim() ? draft.preferredName.trim() : undefined,
  };
  return { state: { ...state, patients: { ...state.patients, [patient.id]: patient } }, patient };
}

export function updatePatient(state: DemoState, patient: Patient, identity: Identity): DemoState {
  const existing = state.patients[patient.id];
  if (!existing) throw new BackendError("notFound");
  if (!patientPermissions(identity, existing).canEditDetails) throw new BackendError("notPermitted");
  // owner + prescribers are server-maintained — never changed by an edit.
  const merged: Patient = { ...patient, owner: existing.owner, prescribingDoctorIDs: existing.prescribingDoctorIDs };
  return { ...state, patients: { ...state.patients, [patient.id]: merged } };
}

export function deletePatient(state: DemoState, id: string, identity: Identity): DemoState {
  const existing = state.patients[id];
  if (!existing) throw new BackendError("notFound");
  if (!patientPermissions(identity, existing).canDelete) throw new BackendError("notPermitted");
  const patients = { ...state.patients };
  delete patients[id];
  const notesByPatient = { ...state.notesByPatient };
  delete notesByPatient[id];
  return { ...state, patients, notesByPatient };
}

export function mergePatients(state: DemoState, keepId: string, removeId: string, identity: Identity): DemoState {
  const keep = state.patients[keepId];
  const remove = state.patients[removeId];
  if (!keep || !remove) throw new BackendError("notFound");
  if (!patientPermissions(identity, keep).canMerge || !patientPermissions(identity, remove).canMerge) {
    throw new BackendError("notPermitted");
  }
  const movedNotes = (state.notesByPatient[removeId] ?? []).map((n) => ({ ...n, patientID: keepId }));
  const notesByPatient = { ...state.notesByPatient, [keepId]: [...(state.notesByPatient[keepId] ?? []), ...movedNotes] };
  delete notesByPatient[removeId];

  const authorisations = { ...state.authorisations };
  for (const [id, a] of Object.entries(authorisations)) {
    if (a.patientID === removeId) authorisations[id] = { ...a, patientID: keepId };
  }

  const mergedKeep: Patient = { ...keep, prescribingDoctorIDs: [...new Set([...keep.prescribingDoctorIDs, ...remove.prescribingDoctorIDs])] };
  const patients = { ...state.patients, [keepId]: mergedKeep };
  delete patients[removeId];

  return { ...state, patients, notesByPatient, authorisations };
}
```
(Note: the existing `backend.ts` already imports several names from `./types`; add `PatientDraft, PatientField, PatientOwner` to that import or use the separate `import type` line shown above — whichever keeps tsc clean.)

- [ ] **Step 4: Run** — `npm test -- patient-crud` → PASS. `npx tsc --noEmit` → clean. `npm test` → all green.
- [ ] **Step 5: Commit**
```bash
git add src/lib/demo/backend.ts src/lib/demo/__tests__/patient-crud.test.ts
git commit -m "feat(patients): domain ops for create/edit/delete/merge (TDD)"
```

---

## Task 3: Patient encoders (TDD)

**Files:**
- Modify: `src/lib/firebase/mappers.ts`
- Test: `src/lib/firebase/__tests__/mappers.test.ts` (extend)

- [ ] **Step 1: Write the failing test** — append to `src/lib/firebase/__tests__/mappers.test.ts`:
```ts
import { encodePatientForCreate, encodePatientEdits } from "@/lib/firebase/mappers";
import type { Patient } from "@/lib/demo/types";

const patient: Patient = {
  id: "p1", givenName: "Amara", lastName: "Boyd", dateOfBirth: { year: 1991, month: 3, day: 12 },
  gender: "Female", address: "x", phone: "0401", email: "a@x.com", allergies: "NKDA",
  currentMedications: "Nil", owner: { kind: "clinic", id: "clinic-lumiere" },
  prescribingDoctorIDs: ["u-voss"], alert: "anaphylaxis", preferredName: "Mara",
};

describe("encodePatientForCreate", () => {
  it("writes ownerType/ownerId + dob string and omits prescribingDoctorIds", () => {
    const doc = encodePatientForCreate(patient);
    expect(doc.ownerType).toBe("clinic");
    expect(doc.ownerId).toBe("clinic-lumiere");
    expect(doc.dateOfBirth).toBe("1991-03-12");
    expect("prescribingDoctorIds" in doc).toBe(false);
    expect(doc.alert).toBe("anaphylaxis");
  });
});

describe("encodePatientEdits", () => {
  it("omits owner + prescribers (rules block changing them)", () => {
    const doc = encodePatientEdits(patient);
    expect("ownerType" in doc).toBe(false);
    expect("ownerId" in doc).toBe(false);
    expect("prescribingDoctorIds" in doc).toBe(false);
    expect(doc.givenName).toBe("Amara");
    expect(doc.preferredName).toBe("Mara");
  });
});
```

- [ ] **Step 2: Run** — `npm test -- mappers` → FAIL.

- [ ] **Step 3: Implement** — append to `src/lib/firebase/mappers.ts` (uses the existing `Doc` type, `formatDob`, and imports `Patient`):
```ts
import type { Patient } from "@/lib/demo/types";

function patientCore(p: Patient): Doc {
  return {
    givenName: p.givenName, lastName: p.lastName, dateOfBirth: formatDob(p.dateOfBirth),
    gender: p.gender, address: p.address, phone: p.phone, email: p.email,
    allergies: p.allergies, currentMedications: p.currentMedications,
    alert: p.alert ?? null, preferredName: p.preferredName ?? null,
  };
}

// Create: mandatory keys + owner; never prescribingDoctorIds (rules block it on create).
export function encodePatientForCreate(p: Patient): Doc {
  return { ...patientCore(p), ownerType: p.owner.kind, ownerId: p.owner.id };
}

// Update: editable demographics only; owner/prescribers are server-maintained (rules block changes).
export function encodePatientEdits(p: Patient): Doc {
  return patientCore(p);
}
```
(If `Patient` is already imported at the top of `mappers.ts`, add it to that import instead of a second line.)

- [ ] **Step 4: Run** — `npm test -- mappers` → PASS. `npx tsc --noEmit` → clean.
- [ ] **Step 5: Commit**
```bash
git add src/lib/firebase/mappers.ts src/lib/firebase/__tests__/mappers.test.ts
git commit -m "feat(patients): Firestore encoders for create/edit"
```

---

## Task 4: Write mirroring

**Files:**
- Modify: `src/lib/firebase/mirror.ts`

- [ ] **Step 1: Implement** — in `src/lib/firebase/mirror.ts`: extend the firestore import to `import { doc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";`, add `encodePatientForCreate, encodePatientEdits` to the `./mappers` import and `Patient` to the types import, then append:
```ts
export async function mirrorCreatePatient(p: Patient): Promise<void> {
  await setDoc(doc(firestore(), "patients", p.id), encodePatientForCreate(p));
}
export async function mirrorUpdatePatient(p: Patient): Promise<void> {
  await updateDoc(doc(firestore(), "patients", p.id), encodePatientEdits(p));
}
export async function mirrorDeletePatient(id: string): Promise<void> {
  await deleteDoc(doc(firestore(), "patients", id));
}
export async function mirrorMergePatients(keepId: string, removeId: string): Promise<void> {
  await httpsCallable(functions(), "mergePatients")({ keepId, removeId });
}
```

- [ ] **Step 2: Run** — `npx tsc --noEmit` → clean.
- [ ] **Step 3: Commit**
```bash
git add src/lib/firebase/mirror.ts
git commit -m "feat(patients): mirror create/update/delete/merge to Firestore + Function"
```

---

## Task 5: Store actions

**Files:**
- Modify: `src/lib/demo/store.tsx`

- [ ] **Step 1: Implement** — add to the `StoreValue` interface:
```ts
  createPatient: (draft: import("./types").PatientDraft, identity: Identity) => string;
  updatePatient: (patient: import("./types").Patient, identity: Identity) => void;
  deletePatient: (id: string, identity: Identity) => void;
  mergePatients: (keepId: string, removeId: string, identity: Identity) => void;
```
Then add to the `value` object inside `useMemo` (alongside the existing actions):
```ts
      createPatient: (draft, identity) => {
        const result = backend.createPatient(state, draft, identity, now);
        setState(result.state);
        if (live) {
          void (async () => {
            try { const m = await import("@/lib/firebase/mirror"); await m.mirrorCreatePatient(result.patient); }
            catch (e) { setLastSyncError(String(e)); }
          })();
        }
        return result.patient.id;
      },
      updatePatient: (patient, identity) =>
        applyAndMirror((s) => backend.updatePatient(s, patient, identity), (m) => m.mirrorUpdatePatient(patient)),
      deletePatient: (id, identity) =>
        applyAndMirror((s) => backend.deletePatient(s, id, identity), (m) => m.mirrorDeletePatient(id)),
      mergePatients: (keepId, removeId, identity) =>
        applyAndMirror((s) => backend.mergePatients(s, keepId, removeId, identity), (m) => m.mirrorMergePatients(keepId, removeId)),
```
> `createPatient` computes once (against the current `state` closure) so it can return the new id synchronously for navigation; the others use the existing `applyAndMirror`.

- [ ] **Step 2: Run** — `npx tsc --noEmit` → clean; `npm test` → all green (demo store test unaffected).
- [ ] **Step 3: Commit**
```bash
git add src/lib/demo/store.tsx
git commit -m "feat(patients): store actions create/update/delete/merge"
```

---

## Task 6: Shared `PatientForm`

**Files:**
- Create: `src/components/app/PatientForm.tsx`

- [ ] **Step 1: Implement** `src/components/app/PatientForm.tsx`:
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { missingFields } from "@/lib/demo/backend";
import type { Patient, PatientDraft } from "@/lib/demo/types";

function dobToInput(d: PatientDraft["dateOfBirth"]): string {
  if (!d) return "";
  const p = (n: number, w: number) => String(n).padStart(w, "0");
  return `${p(d.year, 4)}-${p(d.month, 2)}-${p(d.day, 2)}`;
}
function inputToDob(s: string): PatientDraft["dateOfBirth"] {
  const parts = s.split("-").map((x) => parseInt(x, 10));
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  return { year: parts[0], month: parts[1], day: parts[2] };
}

const FIELD = "mt-1.5 w-full rounded-field border border-line bg-card px-3 py-2 text-ink outline-none focus:border-tint";

export function PatientForm({ mode, initial, existing }: { mode: "create" | "edit"; initial: PatientDraft; existing?: Patient }) {
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  const router = useRouter();
  const [draft, setDraft] = useState<PatientDraft>(initial);
  const [error, setError] = useState<string | null>(null);
  if (!identity) return null;

  const invalid = missingFields(draft).size > 0;
  const set = (k: keyof PatientDraft, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (invalid) return;
    try {
      if (mode === "create") {
        const id = store.createPatient(draft, identity!);
        router.push(`/app/patients/${id}`);
      } else if (existing) {
        const updated: Patient = {
          ...existing,
          givenName: draft.givenName.trim(), lastName: draft.lastName.trim(),
          dateOfBirth: draft.dateOfBirth!, gender: draft.gender, address: draft.address.trim(),
          phone: draft.phone.trim(), email: draft.email.trim(), allergies: draft.allergies.trim(),
          currentMedications: draft.currentMedications.trim(),
          alert: draft.alert.trim() || undefined, preferredName: draft.preferredName.trim() || undefined,
        };
        store.updatePatient(updated, identity!);
        router.push(`/app/patients/${existing.id}`);
      }
    } catch {
      setError("Could not save. Check your permissions and try again.");
    }
  }

  return (
    <form onSubmit={submit} className="max-w-2xl">
      <h1 className="font-display text-3xl text-ink">{mode === "create" ? "New patient" : "Edit patient"}</h1>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="block"><span className="micro">Given name *</span>
          <input className={FIELD} value={draft.givenName} onChange={(e) => set("givenName", e.target.value)} /></label>
        <label className="block"><span className="micro">Last name *</span>
          <input className={FIELD} value={draft.lastName} onChange={(e) => set("lastName", e.target.value)} /></label>
        <label className="block"><span className="micro">Preferred name</span>
          <input className={FIELD} value={draft.preferredName} onChange={(e) => set("preferredName", e.target.value)} /></label>
        <label className="block"><span className="micro">Date of birth *</span>
          <input type="date" className={FIELD} value={dobToInput(draft.dateOfBirth)}
            onChange={(e) => setDraft((d) => ({ ...d, dateOfBirth: inputToDob(e.target.value) }))} /></label>
        <label className="block"><span className="micro">Gender *</span>
          <select className={FIELD} value={draft.gender} onChange={(e) => set("gender", e.target.value)}>
            <option value="">Select…</option><option>Male</option><option>Female</option><option>Other</option>
          </select></label>
        <label className="block"><span className="micro">Phone *</span>
          <input className={FIELD} value={draft.phone} onChange={(e) => set("phone", e.target.value)} /></label>
        <label className="block sm:col-span-2"><span className="micro">Address *</span>
          <input className={FIELD} value={draft.address} onChange={(e) => set("address", e.target.value)} /></label>
        <label className="block sm:col-span-2"><span className="micro">Email *</span>
          <input type="email" className={FIELD} value={draft.email} onChange={(e) => set("email", e.target.value)} /></label>
        <label className="block"><span className="micro">Allergies *</span>
          <input className={FIELD} value={draft.allergies} onChange={(e) => set("allergies", e.target.value)} /></label>
        <label className="block"><span className="micro">Current medications *</span>
          <input className={FIELD} value={draft.currentMedications} onChange={(e) => set("currentMedications", e.target.value)} /></label>
        <label className="block sm:col-span-2"><span className="micro">Alert (optional)</span>
          <input className={FIELD} value={draft.alert} onChange={(e) => set("alert", e.target.value)} /></label>
      </div>
      {error && <p className="mt-4 text-sm" style={{ color: "var(--color-rose)" }}>{error}</p>}
      <div className="mt-6 flex gap-3">
        <button type="submit" disabled={invalid}
          className="rounded-btn px-5 py-2.5 text-sm font-medium text-card transition-colors disabled:opacity-50"
          style={{ background: "var(--color-tint)" }}>
          {mode === "create" ? "Create patient" : "Save changes"}
        </button>
        <button type="button" onClick={() => router.back()}
          className="rounded-btn border border-line px-5 py-2.5 text-sm text-ink-soft hover:border-tint">Cancel</button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Run** — `npx tsc --noEmit` → clean.
- [ ] **Step 3: Commit**
```bash
git add src/components/app/PatientForm.tsx
git commit -m "feat(patients): shared create/edit form"
```

---

## Task 7: Create + edit routes

**Files:**
- Create: `src/app/app/patients/new/page.tsx`
- Create: `src/app/app/patients/[id]/edit/page.tsx`

- [ ] **Step 1: Implement** `src/app/app/patients/new/page.tsx`:
```tsx
"use client";

import { useDemoAuth } from "@/lib/demo/auth";
import { canCreatePatient } from "@/lib/demo/backend";
import { emptyDraft } from "@/lib/demo/types";
import { PatientForm } from "@/components/app/PatientForm";

export default function NewPatientPage() {
  const { identity } = useDemoAuth();
  if (!identity) return null;
  if (!canCreatePatient(identity)) return <p className="text-ink-soft">You don&apos;t have permission to create patients.</p>;
  return <PatientForm mode="create" initial={emptyDraft()} />;
}
```

- [ ] **Step 2: Implement** `src/app/app/patients/[id]/edit/page.tsx`:
```tsx
"use client";

import { use } from "react";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { patientPermissions } from "@/lib/demo/backend";
import { draftFromPatient } from "@/lib/demo/types";
import { PatientForm } from "@/components/app/PatientForm";

export default function EditPatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  if (!identity) return null;
  if (store.status === "loading") return <p className="text-ink-soft">Loading…</p>;
  const patient = store.state.patients[id];
  if (!patient || !patientPermissions(identity, patient).canEditDetails) {
    return <p className="text-ink-soft">You can&apos;t edit this patient.</p>;
  }
  return <PatientForm mode="edit" initial={draftFromPatient(patient)} existing={patient} />;
}
```

- [ ] **Step 3: Run** — `npx tsc --noEmit` → clean; `npm run build` → `/app/patients/new` and `/app/patients/[id]/edit` compile.
- [ ] **Step 4: Commit**
```bash
git add "src/app/app/patients/new/page.tsx" "src/app/app/patients/[id]/edit/page.tsx"
git commit -m "feat(patients): create + edit routes"
```

---

## Task 8: "New patient" button on the list

**Files:**
- Modify: `src/app/app/patients/page.tsx`

- [ ] **Step 1: Implement** — add the import `import Link from "next/link";` (if not present) and `import { canCreatePatient } from "@/lib/demo/backend";`. Replace the `<h1>Patients</h1>` line with a header row containing the button:
```tsx
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-3xl text-ink">Patients</h1>
        {canCreatePatient(identity) && (
          <Link href="/app/patients/new" className="rounded-btn px-4 py-2 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>
            New patient
          </Link>
        )}
      </div>
```
(The page already has `const { identity } = useDemoAuth();` and the `if (!identity) return null;` guard above this point.)

- [ ] **Step 2: Run** — `npx tsc --noEmit` → clean.
- [ ] **Step 3: Commit**
```bash
git add "src/app/app/patients/page.tsx"
git commit -m "feat(patients): New patient button on the list"
```

---

## Task 9: Edit / delete / merge on the patient file

**Files:**
- Modify: `src/app/app/patients/[id]/page.tsx`

- [ ] **Step 1: Implement** — extend the patient file. Add imports at the top: `useState` (extend the existing `react` import to include it), and `import { useRouter } from "next/navigation";`. Inside the component, after `const active = store.activeAuthorisations(id);`, add:
```tsx
  const router = useRouter();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [mergeFrom, setMergeFrom] = useState("");
  const canEdit = perms.canEditDetails;
  const canDelete = perms.canDelete;
  const canMerge = perms.canMerge;
  // Other same-clinic patients that can be merged INTO this one (clinic admins only).
  const mergeCandidates = canMerge && patient.owner.kind === "clinic"
    ? store.searchPatients("", identity).filter((p) => p.id !== id && p.owner.kind === "clinic" && p.owner.id === patient.owner.id)
    : [];

  function doDelete() {
    store.deletePatient(id, identity!);
    router.push("/app/patients");
  }
  function doMerge() {
    if (!mergeFrom) return;
    store.mergePatients(id, mergeFrom, identity!); // keep this file, remove the duplicate
    setMergeFrom("");
  }
```
Then add an actions block. In the existing `<aside>`, after the active-authorisations card, insert:
```tsx
        {(canEdit || canDelete || canMerge) && (
          <div className="mt-4 rounded-card border border-line bg-card p-5 shadow-card">
            <h2 className="font-display text-lg text-ink">Manage</h2>
            <div className="mt-3 flex flex-col gap-2">
              {canEdit && (
                <Link href={`/app/patients/${id}/edit`} className="rounded-btn border border-line px-4 py-2 text-center text-sm text-ink hover:border-tint">
                  Edit details
                </Link>
              )}
              {canDelete && !confirmingDelete && (
                <button onClick={() => setConfirmingDelete(true)} className="rounded-btn border border-line px-4 py-2 text-sm text-ink-soft hover:border-tint">
                  Delete patient
                </button>
              )}
              {canDelete && confirmingDelete && (
                <div className="rounded-inner border border-line p-3">
                  <p className="text-sm text-ink">Delete this patient and their notes? This cannot be undone.</p>
                  <div className="mt-2 flex gap-2">
                    <button onClick={doDelete} className="rounded-btn px-3 py-1.5 text-sm font-medium text-card" style={{ background: "var(--color-rose)" }}>Delete</button>
                    <button onClick={() => setConfirmingDelete(false)} className="rounded-btn border border-line px-3 py-1.5 text-sm text-ink-soft">Cancel</button>
                  </div>
                </div>
              )}
            </div>
            {canMerge && mergeCandidates.length > 0 && (
              <div className="mt-4 border-t border-line pt-4">
                <p className="micro">Merge a duplicate into this file</p>
                <select value={mergeFrom} onChange={(e) => setMergeFrom(e.target.value)} className="mt-1.5 w-full rounded-field border border-line bg-card px-3 py-2 text-sm text-ink">
                  <option value="">Select duplicate…</option>
                  {mergeCandidates.map((p) => <option key={p.id} value={p.id}>{p.givenName} {p.lastName}</option>)}
                </select>
                {mergeFrom && (
                  <button onClick={doMerge} className="mt-2 w-full rounded-btn px-4 py-2 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>
                    Merge (moves notes &amp; authorisations, removes the duplicate)
                  </button>
                )}
              </div>
            )}
          </div>
        )}
```
(The page already imports `Link` and has `perms`, `identity`, `id`, `patient`, `store` in scope.)

- [ ] **Step 2: Run** — `npx tsc --noEmit` → clean; `npm test` → all green.
- [ ] **Step 3: Commit**
```bash
git add "src/app/app/patients/[id]/page.tsx"
git commit -m "feat(patients): edit/delete/merge actions on the patient file"
```

---

## Task 10: Verification gate

- [ ] **Step 1: Offline gate** — `npm run lint && npx tsc --noEmit && npm test && npm run build` → all green; new domain + mapper tests pass; `/app/patients/new` and `/app/patients/[id]/edit` build.
- [ ] **Step 2: Demo-mode smoke (preview tools).** With no `.env.local` (demo mode), sign in and verify: as a **clinic admin** (Ava Lim) — "New patient" creates a record that appears in the list; opening it → "Edit" changes a field and it persists in-session; "Delete" removes it; create two clinic patients then **merge** one into the other (the duplicate disappears, notes move). As an **independent nurse** (Sarah) — can create/edit/delete her own, but sees **no merge** control. Capture a screenshot of the create form.
- [ ] **Step 3: Document live verification** — append a "Patient CRUD" section to `docs/superpowers/firebase-live-verification.md` listing the manual live checks (create/edit/delete a test patient; merge two test clinic patients as a clinic-admin test account; note the delete-orphans-subcollections caveat).
- [ ] **Step 4: Commit + PR**
```bash
git add docs/superpowers/firebase-live-verification.md
git commit -m "docs(patients): live verification checklist for patient CRUD"
```
Then open the PR with `/create-pr` (base `main`). PR body notes: merge uses the `mergePatients` Cloud Function (clinic-admin, same-clinic); delete leaves orphaned `notes`/`forms` subcollection docs in Firestore (cascade cleanup is a later follow-up).

---

## Self-Review Notes

- **Spec coverage:** validator + 9 fields (T2) ✓; create with owner-from-identity, no prescribers (T2/T3) ✓; field-locked update (T2/T3) ✓; delete + notes removal (T2) ✓; merge re-pointing via Function (T2/T4) ✓; encoders respecting create/update rules (T3) ✓; store actions (T5) ✓; shared form (T6) ✓; create/edit routes (T7) ✓; list button (T8) ✓; file edit/delete/merge gated, merge clinic-admin-only (T9) ✓; both caveats documented (T10) ✓; demo + live verification (T10) ✓.
- **Type consistency:** `PatientDraft`/`emptyDraft`/`draftFromPatient` (T1) used by form/routes (T6/T7); `createPatient`/`updatePatient`/`deletePatient`/`mergePatients`/`missingFields`/`canCreatePatient` (T2) used by store/form/pages; `encodePatientForCreate`/`encodePatientEdits` (T3) used by mirror (T4); `mirror*` names (T4) match store (T5). Store action signatures match the pages' calls.
- **Permissions fidelity:** create gated by `canCreatePatient` (not super-admin); edit/delete/merge by `canEditDetails`/`canDelete`/`canMerge` — `canMerge` is true only for clinic admins on clinic patients, matching the `mergePatients` Function's server-side check, so the UI never offers a merge the server will reject.
- **Known confirmation during implementation:** the `backend.ts` import of `PatientDraft`/`PatientField`/`PatientOwner` and `mappers.ts` import of `Patient` — add to existing import lines if present to keep tsc clean.

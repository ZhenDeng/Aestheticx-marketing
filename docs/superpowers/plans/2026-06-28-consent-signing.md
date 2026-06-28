# In-App Consent Signing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a clinician run an on-device consent for a patient (pick a template → answer screening questions → read the full legal text incl. the off-label clause → draw a signature → record it), with a Forms list/view/delete on the patient file, in demo + live modes.

**Architecture:** A ported `FormLibrary` (TS) drives the template content; pure ops + new `formsByPatient` state in `backend.ts`; a drawn-signature canvas; live mode uploads the signature PNG to Firebase Storage (first Storage use) and mirrors the `forms` doc to Firestore; demo mode keeps the signature in-memory.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest; Firebase v11 (`firebase/storage`, `firebase/firestore`).

**Source of truth (read directly for verbatim content):** `/Users/zhendeng/Documents/AestheticX/AestheticXKit/Sources/AXDomain/Forms.swift` and `FormLibrary.swift`, `AXData/LiveBackend.swift` (`form`/`encode(_ form:)`), the hardened `backend/firestore.rules` + `backend/storage.rules`.

**Existing context:**
- `src/lib/demo/types.ts` — `DemoState`, `Patient`, `Identity`, `PatientOwner`, etc.
- `src/lib/demo/backend.ts` — `emptyState()`, `patientPermissions(identity, patient)` → `{..., canSendForms}`, private `makeID(prefix)`, `BackendError`.
- `src/lib/demo/seed.ts` — `buildSeedState()` returns a `DemoState`.
- `src/lib/firebase/mappers.ts` — pure (`Doc = Record<string, unknown>`, `str`, `strArray`, `toMillis`, `formatDob`).
- `src/lib/firebase/client.ts` — `firebaseAuth()`, `firestore()`, `functions()` (lazy). Needs a `storage()` accessor added.
- `src/lib/firebase/hydrate.ts` — `assembleState(rows)` (pure) + `hydrate(claims)`; loads patients/notes/auths/requests/appointments.
- `src/lib/firebase/mirror.ts` — `mirrorCreateNote`, etc.; imports `doc, setDoc, updateDoc, deleteDoc` from `firebase/firestore`.
- `src/lib/demo/store.tsx` — `applyAndMirror`, `now`, `live`, `StoreValue`, actions.

---

## Task 1: Forms domain types + ported `FormLibrary` (TDD)

**Files:**
- Create: `src/lib/demo/forms.ts`
- Test: `src/lib/demo/__tests__/forms.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/demo/__tests__/forms.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  FORM_TEMPLATE_KINDS, templateDisplayName, formTemplate, OFF_LABEL_CLAUSE,
  type FormTemplateKind,
} from "@/lib/demo/forms";

describe("form templates", () => {
  it("has all seven templates", () => {
    expect(FORM_TEMPLATE_KINDS).toHaveLength(7);
    expect(FORM_TEMPLATE_KINDS).toContain("antiwrinkleConsent");
  });
  it("every consent template includes the off-label clause; the history form does not", () => {
    for (const kind of FORM_TEMPLATE_KINDS) {
      const t = formTemplate(kind);
      if (kind === "aestheticHistory") {
        expect(t.clauses).not.toContain(OFF_LABEL_CLAUSE);
      } else {
        expect(t.clauses).toContain(OFF_LABEL_CLAUSE);
      }
    }
  });
  it("fullText starts with the intro", () => {
    const t = formTemplate("antiwrinkleConsent");
    expect(t.fullText[0]).toBe(t.intro);
    expect(t.fullText.length).toBe(1 + t.clauses.length);
  });
  it("the aesthetic history form has its screening questions", () => {
    const t = formTemplate("aestheticHistory");
    expect(t.questions.map((q) => q.id)).toContain("pregnant");
    expect(t.questions.length).toBeGreaterThanOrEqual(10);
  });
  it("consent forms carry the two confirm questions", () => {
    const t = formTemplate("haFillerConsent");
    expect(t.questions.map((q) => q.id)).toEqual(["changed-history", "questions-answered"]);
  });
  it("displayName maps", () => {
    expect(templateDisplayName("haFillerDissolvingConsent")).toBe("Hyalase Consent");
  });
});
```

- [ ] **Step 2: Run** — `npm test -- forms` → FAIL.

- [ ] **Step 3: Implement `src/lib/demo/forms.ts`.** Port from `FormLibrary.swift` + `Forms.swift`. Use this exact scaffolding for the types, the shared clauses (verbatim below), the `consent()` builder, and the `formTemplate()` switch. **Port each template's `intro` and `sections` (clause prose) and the `aestheticHistory` questions VERBATIM from `FormLibrary.swift`** — read that file and copy the multi-line string content exactly (Swift `\`-continuations join with a space; reproduce the same single-line joined text). The shared clauses and the off-label clause are given here verbatim (the off-label clause is the tested invariant — copy exactly):

```ts
// Ported from iOS AXDomain/Forms.swift + FormLibrary.swift. Legal content copied
// verbatim from FormLibrary.swift; in production these live versioned in Firestore.

export const FORM_TEMPLATE_KINDS = [
  "aestheticHistory", "antiwrinkleConsent", "skinboosterConsent", "haFillerConsent",
  "collagenStimulatorConsent", "fatDissolveConsent", "haFillerDissolvingConsent",
] as const;
export type FormTemplateKind = (typeof FORM_TEMPLATE_KINDS)[number];

export type SigningChannel = "onDevice" | "emailLink" | "qrCode" | "shareLink";

export type FormQuestion = {
  id: string;
  prompt: string;
  kind: { type: "yesNo"; detailPrompt: string | null } | { type: "text" };
};

export interface FormTemplate {
  kind: FormTemplateKind;
  intro: string;
  clauses: string[];
  questions: FormQuestion[];
  requiresSignature: boolean;
}

export function templateFullText(t: FormTemplate): string[] {
  return [t.intro, ...t.clauses];
}

export function templateDisplayName(kind: FormTemplateKind): string {
  switch (kind) {
    case "aestheticHistory": return "Aesthetic History";
    case "antiwrinkleConsent": return "Antiwrinkle Consent";
    case "skinboosterConsent": return "Skinbooster Consent";
    case "haFillerConsent": return "HA Filler Consent";
    case "collagenStimulatorConsent": return "Collagen Stimulator Consent";
    case "fatDissolveConsent": return "Fat Dissolve Consent";
    case "haFillerDissolvingConsent": return "Hyalase Consent";
  }
}

// --- Shared clauses (verbatim from FormLibrary.swift) ---
export const OFF_LABEL_CLAUSE =
  "Off-label use: I understand that many cosmetic injectables (including, but not limited to, neuromodulators and dermal fillers) may be administered in areas, doses, or manners not specifically approved by the TGA. This is a recognised and lawful practice in aesthetic medicine, undertaken at the treating practitioner's clinical judgement, and its rationale has been explained to me to my satisfaction. I consent to off-label use where my practitioner judges it will give the most optimal and balanced aesthetic outcome.";

const PRIVACY_CLAUSE =
  "My personal and health information is collected to provide safe treatment and is handled under the Australian Privacy Principles. It is shared only with practitioners involved in my care.";

const CONSENT_CLOSE_CLAUSE =
  "I confirm I have had the opportunity to ask questions, that alternatives (including no treatment) were discussed, that results vary between individuals and no specific outcome is guaranteed, and that I may withdraw consent at any time before treatment.";

const PHOTOGRAPHY_CLAUSE =
  "Clinical photography: I authorise clinical photography for medical documentation, with use restricted to my medical record unless I provide separate authorisation for teaching or marketing purposes.";

const CONFIRM_QUESTIONS: FormQuestion[] = [
  { id: "changed-history", prompt: "Has your medical history changed since your aesthetic history form?", kind: { type: "yesNo", detailPrompt: "Please describe what has changed" } },
  { id: "questions-answered", prompt: "Have all your questions about today's treatment been answered?", kind: { type: "yesNo", detailPrompt: null } },
];

// sections = the per-treatment clause prose; consent() appends the standard tail.
function consent(kind: FormTemplateKind, intro: string, sections: string[]): FormTemplate {
  return {
    kind,
    intro,
    clauses: [...sections, OFF_LABEL_CLAUSE, PRIVACY_CLAUSE, CONSENT_CLOSE_CLAUSE],
    questions: CONFIRM_QUESTIONS,
    requiresSignature: true,
  };
}

// Shared HA filler + skinbooster sections (FormLibrary.swift lines 272-321) — port verbatim.
const HA_AND_SKINBOOSTER_SECTIONS: string[] = [
  /* PORT: the 6 strings of `haAndSkinboosterSections` from FormLibrary.swift,
     including PHOTOGRAPHY_CLAUSE in position 6 (use the PHOTOGRAPHY_CLAUSE const). */
];

const AESTHETIC_HISTORY: FormTemplate = {
  kind: "aestheticHistory",
  intro: /* PORT: aestheticHistory intro (FormLibrary.swift lines 341-344) */ "",
  clauses: [PRIVACY_CLAUSE],
  questions: [
    /* PORT: the 10 FormQuestion entries (FormLibrary.swift lines 347-373) verbatim,
       mapping Swift `.yesNo(detailPrompt: "x")` -> {type:"yesNo", detailPrompt:"x"} and
       `.yesNo(detailPrompt: nil)` -> {type:"yesNo", detailPrompt:null}. */
  ],
  requiresSignature: true,
};

export function formTemplate(kind: FormTemplateKind): FormTemplate {
  switch (kind) {
    case "aestheticHistory": return AESTHETIC_HISTORY;
    case "antiwrinkleConsent":
      return consent(kind,
        /* PORT intro lines 85-91 */ "",
        [ /* PORT the 6 antiwrinkle sections lines 92-131, using PHOTOGRAPHY_CLAUSE for the photography one */ ]);
    case "haFillerConsent":
      return consent(kind, /* PORT intro 135-140 */ "", HA_AND_SKINBOOSTER_SECTIONS);
    case "skinboosterConsent":
      return consent(kind, /* PORT intro 145-150 */ "", HA_AND_SKINBOOSTER_SECTIONS);
    case "collagenStimulatorConsent":
      return consent(kind, /* PORT intro 155-159 */ "", [ /* PORT sections 160-205, PHOTOGRAPHY_CLAUSE for the photo one */ ]);
    case "fatDissolveConsent":
      return consent(kind, /* PORT intro 209-213 */ "", [ /* PORT section 214-222 */ ]);
    case "haFillerDissolvingConsent":
      return consent(kind, /* PORT intro 226-231 */ "", [ /* PORT sections 232-266 */ ]);
  }
}
```
> **Porting rule:** open `FormLibrary.swift`, and for each `/* PORT ... */` marker copy the corresponding Swift multi-line string(s) as a single JS string with the `\`-continuation line breaks replaced by a single space (exactly as Swift produces). Where a Swift section is `photographyClause`, use the `PHOTOGRAPHY_CLAUSE` constant in that array position (don't duplicate the text). Do NOT paraphrase — this is legal text and the tests + downstream PDF depend on exact wording. After porting, the off-label test (Step 1) and the question tests must pass.

- [ ] **Step 4: Run** — `npm test -- forms` → PASS.
- [ ] **Step 5: Commit**
```bash
git add src/lib/demo/forms.ts src/lib/demo/__tests__/forms.test.ts
git commit -m "feat(forms): port FormLibrary templates + clauses to TS (TDD)"
```

---

## Task 2: `SignedFormRecord` + state + ops (TDD)

**Files:**
- Modify: `src/lib/demo/types.ts` (add `SignedFormRecord`, `FormAnswer`, extend `DemoState`)
- Modify: `src/lib/demo/backend.ts` (forms ops + `emptyState`)
- Modify: `src/lib/demo/seed.ts` (`buildSeedState` — add `formsByPatient: {}`)
- Test: `src/lib/demo/__tests__/forms-ops.test.ts`

- [ ] **Step 1: Add types** to `src/lib/demo/types.ts`:
```ts
import type { FormTemplateKind, SigningChannel } from "./forms";

export interface FormAnswer {
  questionID: string;
  answer: boolean;
  detail: string;
}

export interface SignedFormRecord {
  id: string;
  patientID: string;
  template: FormTemplateKind;
  channel: SigningChannel;
  signedAt: number;
  answers: FormAnswer[];
  intro: string;       // snapshot of the template text at signing
  clauses: string[];   // snapshot
  signatureFileId?: string;   // live: Storage path
  signatureDataUrl?: string;  // demo only: inline PNG data URL (never written to Firestore)
  pdfFileId?: string;
}
```
Add `formsByPatient: Record<string, SignedFormRecord[]>;` to the `DemoState` interface.

- [ ] **Step 2: Write the failing test** — `src/lib/demo/__tests__/forms-ops.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import type { DemoState, Identity, Patient } from "@/lib/demo/types";
import { emptyState, recordSignedForm, deleteForm, formsForPatient } from "@/lib/demo/backend";

const NOW = Date.UTC(2026, 5, 28);
const nurse: Identity = { user: { id: "u-sarah", name: "Sarah" }, role: "nurse", context: { kind: "independent" } };
function nursePatient(id: string): Patient {
  return { id, givenName: "C", lastName: "D", dateOfBirth: { year: 1987, month: 7, day: 4 },
    gender: "Female", address: "x", phone: "x", email: "x", allergies: "x", currentMedications: "x",
    owner: { kind: "nurse", id: "u-sarah" }, prescribingDoctorIDs: [] };
}
function withPatient(p: Patient): DemoState { return { ...emptyState(), patients: { [p.id]: p } }; }

describe("recordSignedForm", () => {
  it("records a form for an editable patient, snapshotting the template text", () => {
    const { state, form } = recordSignedForm(withPatient(nursePatient("p1")), {
      patientID: "p1", template: "antiwrinkleConsent", channel: "onDevice",
      answers: [{ questionID: "questions-answered", answer: true, detail: "" }],
      signatureDataUrl: "data:image/png;base64,AAA",
    }, nurse, NOW);
    expect(form.template).toBe("antiwrinkleConsent");
    expect(form.clauses.length).toBeGreaterThan(0);
    expect(form.intro.length).toBeGreaterThan(0);
    expect(form.signedAt).toBe(NOW);
    expect(formsForPatient(state, "p1")).toHaveLength(1);
  });
  it("denies a clinician who cannot send forms", () => {
    const otherNurse: Identity = { ...nurse, user: { id: "u-other", name: "O" } };
    expect(() => recordSignedForm(withPatient(nursePatient("p1")), {
      patientID: "p1", template: "antiwrinkleConsent", channel: "onDevice", answers: [],
    }, otherNurse, NOW)).toThrow();
  });
});

describe("deleteForm", () => {
  it("removes a signed form", () => {
    const { state } = recordSignedForm(withPatient(nursePatient("p1")), {
      patientID: "p1", template: "antiwrinkleConsent", channel: "onDevice", answers: [],
    }, nurse, NOW);
    const formId = formsForPatient(state, "p1")[0].id;
    const next = deleteForm(state, "p1", formId, nurse);
    expect(formsForPatient(next, "p1")).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run** — `npm test -- forms-ops` → FAIL.

- [ ] **Step 4: Implement.** In `src/lib/demo/backend.ts`:
- Add `formsByPatient: {}` to the object returned by `emptyState()`.
- Add `SignedFormRecord`, `FormAnswer` to the existing `./types` import, and `formTemplate` from `./forms`, and `FormTemplateKind, SigningChannel` from `./forms`.
- Append:
```ts
export function formsForPatient(state: DemoState, patientID: string): SignedFormRecord[] {
  return [...(state.formsByPatient[patientID] ?? [])].sort((a, b) => b.signedAt - a.signedAt);
}

export interface RecordFormInput {
  patientID: string;
  template: FormTemplateKind;
  channel: SigningChannel;
  answers: FormAnswer[];
  signatureFileId?: string;
  signatureDataUrl?: string;
}

export function recordSignedForm(
  state: DemoState, input: RecordFormInput, identity: Identity, now: number,
): { state: DemoState; form: SignedFormRecord } {
  const patient = state.patients[input.patientID];
  if (!patient) throw new BackendError("notFound");
  if (!patientPermissions(identity, patient).canSendForms) throw new BackendError("notPermitted");
  const t = formTemplate(input.template);
  const form: SignedFormRecord = {
    id: makeID("f"),
    patientID: input.patientID,
    template: input.template,
    channel: input.channel,
    signedAt: now,
    answers: input.answers,
    intro: t.intro,
    clauses: t.clauses,
    signatureFileId: input.signatureFileId,
    signatureDataUrl: input.signatureDataUrl,
  };
  const existing = state.formsByPatient[input.patientID] ?? [];
  return {
    state: { ...state, formsByPatient: { ...state.formsByPatient, [input.patientID]: [...existing, form] } },
    form,
  };
}

export function deleteForm(state: DemoState, patientID: string, formId: string, identity: Identity): DemoState {
  const patient = state.patients[patientID];
  if (!patient) throw new BackendError("notFound");
  if (!patientPermissions(identity, patient).canSendForms) throw new BackendError("notPermitted");
  const list = (state.formsByPatient[patientID] ?? []).filter((f) => f.id !== formId);
  return { ...state, formsByPatient: { ...state.formsByPatient, [patientID]: list } };
}
```

- [ ] **Step 5:** In `src/lib/demo/seed.ts`, the object built/returned by `buildSeedState()` must include `formsByPatient: {}`. If it builds on `emptyState()`/replays ops, `emptyState()` now provides it — but verify `buildSeedState` returns a state with `formsByPatient` defined (add it if the seed constructs the state literally).

- [ ] **Step 6: Run** — `npm test -- forms-ops` → PASS; `npx tsc --noEmit` → clean; `npm test` → all green (existing tests that build `DemoState` via `emptyState()` now carry `formsByPatient`).
- [ ] **Step 7: Commit**
```bash
git add src/lib/demo/types.ts src/lib/demo/backend.ts src/lib/demo/seed.ts src/lib/demo/__tests__/forms-ops.test.ts
git commit -m "feat(forms): SignedFormRecord state + record/delete ops (TDD)"
```

---

## Task 3: Form mappers (TDD)

**Files:**
- Modify: `src/lib/firebase/mappers.ts`
- Test: `src/lib/firebase/__tests__/mappers.test.ts` (extend)

- [ ] **Step 1: Write the failing test** — append to `src/lib/firebase/__tests__/mappers.test.ts`:
```ts
import { mapForm, encodeForm } from "@/lib/firebase/mappers";
import type { SignedFormRecord } from "@/lib/demo/types";

describe("form mappers", () => {
  it("round-trips a signed form", () => {
    const form: SignedFormRecord = {
      id: "f1", patientID: "p1", template: "antiwrinkleConsent", channel: "onDevice",
      signedAt: 1750000000000, answers: [{ questionID: "q", answer: true, detail: "d" }],
      intro: "intro", clauses: ["c1", "off-label"], signatureFileId: "patients/p1/signatures/f1.png",
    };
    const doc = encodeForm(form);
    expect(doc.template).toBe("antiwrinkleConsent");
    expect(doc.signatureImageFileId).toBe("patients/p1/signatures/f1.png");
    expect((doc.answers as unknown[]).length).toBe(1);
    const back = mapForm("f1", "p1", doc as Record<string, unknown>);
    expect(back.template).toBe("antiwrinkleConsent");
    expect(back.clauses).toEqual(["c1", "off-label"]);
    expect(back.answers[0].questionID).toBe("q");
    expect(back.signatureFileId).toBe("patients/p1/signatures/f1.png");
  });
});
```

- [ ] **Step 2: Run** — `npm test -- mappers` → FAIL.

- [ ] **Step 3: Implement** — append to `src/lib/firebase/mappers.ts` (uses existing `str`, `strArray`, `toMillis`, `Doc`; add `SignedFormRecord`, `FormAnswer` to the `@/lib/demo/types` import and `FormTemplateKind, SigningChannel` to a `@/lib/demo/forms` import):
```ts
export function encodeForm(f: SignedFormRecord): Doc {
  return {
    template: f.template,
    channel: f.channel,
    signedAt: f.signedAt,
    intro: f.intro,
    clauses: f.clauses,
    answers: f.answers.map((a) => ({ questionId: a.questionID, answer: a.answer, detail: a.detail })),
    signatureImageFileId: f.signatureFileId ?? null,
    pdfFileId: f.pdfFileId ?? null,
  };
}

export function mapForm(id: string, patientID: string, data: Doc): SignedFormRecord {
  const answers = (Array.isArray(data.answers) ? (data.answers as Doc[]) : []).map((a): FormAnswer => ({
    questionID: str(a.questionId), answer: a.answer === true, detail: str(a.detail),
  }));
  return {
    id, patientID,
    template: (str(data.template) || "aestheticHistory") as FormTemplateKind,
    channel: (str(data.channel) || "onDevice") as SigningChannel,
    signedAt: toMillis(data.signedAt),
    answers,
    intro: str(data.intro),
    clauses: strArray(data.clauses),
    signatureFileId: typeof data.signatureImageFileId === "string" ? data.signatureImageFileId : undefined,
    pdfFileId: typeof data.pdfFileId === "string" ? data.pdfFileId : undefined,
  };
}
```

- [ ] **Step 4: Run** — `npm test -- mappers` → PASS; `npx tsc --noEmit` → clean.
- [ ] **Step 5: Commit**
```bash
git add src/lib/firebase/mappers.ts src/lib/firebase/__tests__/mappers.test.ts
git commit -m "feat(forms): Firestore form mappers (TDD)"
```

---

## Task 4: Storage accessor + signature upload/url

**Files:**
- Modify: `src/lib/firebase/client.ts` (add `storage()`)
- Create: `src/lib/firebase/storage.ts`

- [ ] **Step 1:** In `src/lib/firebase/client.ts`, add `import { getStorage, type FirebaseStorage } from "firebase/storage";` and:
```ts
export function storage(): FirebaseStorage {
  return getStorage(getFirebaseApp());
}
```
(Place beside `firestore()`/`functions()`; `getFirebaseApp()` is the existing private accessor.)

- [ ] **Step 2: Create `src/lib/firebase/storage.ts`:**
```ts
"use client";

import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "./client";

// Signatures go under patients/{id}/signatures/{formId}.png — NOT patients/{id}/forms/**
// (the Storage rules make the forms/ path Function-only). The catch-all patient path
// allows image uploads by a patientVisible user.
export async function uploadSignature(patientID: string, formId: string, png: Blob): Promise<string> {
  const path = `patients/${patientID}/signatures/${formId}.png`;
  await uploadBytes(ref(storage(), path), png, { contentType: "image/png" });
  return path;
}

export async function signatureUrl(path: string): Promise<string> {
  return getDownloadURL(ref(storage(), path));
}
```

- [ ] **Step 3: Run** — `npx tsc --noEmit` → clean (confirm `firebase/storage` exports `getStorage`, `ref`, `uploadBytes`, `getDownloadURL` in the installed v11; if not, STOP and report).
- [ ] **Step 4: Commit**
```bash
git add src/lib/firebase/client.ts src/lib/firebase/storage.ts
git commit -m "feat(forms): Firebase Storage accessor + signature upload/url"
```

---

## Task 5: Mirror + hydrate forms

**Files:**
- Modify: `src/lib/firebase/mirror.ts`
- Modify: `src/lib/firebase/hydrate.ts`

- [ ] **Step 1:** In `src/lib/firebase/mirror.ts`: add `encodeForm` to the `./mappers` import and `SignedFormRecord` to the types import; append:
```ts
export async function mirrorCreateForm(form: SignedFormRecord): Promise<void> {
  await setDoc(doc(firestore(), `patients/${form.patientID}/forms`, form.id), encodeForm(form));
}
export async function mirrorDeleteForm(patientID: string, formId: string): Promise<void> {
  await deleteDoc(doc(firestore(), `patients/${patientID}/forms`, formId));
}
```

- [ ] **Step 2:** In `src/lib/firebase/hydrate.ts`:
- Add `mapForm` to the `./mappers` import.
- Extend `HydrationRows` with `formsByPatient: Record<string, Row[]>;`.
- In `assembleState`, build forms: after the notes block, add:
```ts
  const formsByPatient: DemoState["formsByPatient"] = {};
  for (const [pid, list] of Object.entries(rows.formsByPatient)) {
    formsByPatient[pid] = list.map((f) => mapForm(f.id, pid, f.data));
  }
```
and include `formsByPatient` in the returned `DemoState` (and `formsByPatient: {}` is implied for empty — ensure every return path sets it).
- In `hydrate()` (both the super-admin branch and the normal branch), after loading notes per patient, also load forms:
```ts
  const formsByPatient: Record<string, Row[]> = {};
  await Promise.all(patients.map(async (p) => { formsByPatient[p.id] = await runQuery(`patients/${p.id}/forms`); }));
```
and pass `formsByPatient` into the `assembleState({ ... })` call. (In the super-admin branch, `patients` is the full `all` list — mirror the same loop there.)

- [ ] **Step 3:** Update the existing `assembleState` test (`src/lib/firebase/__tests__/hydrate.test.ts`) `HydrationRows` literal to include `formsByPatient: {}` (and optionally one form row) so it still type-checks; run `npm test -- hydrate` → green.

- [ ] **Step 4: Run** — `npx tsc --noEmit` → clean; `npm test` → all green.
- [ ] **Step 5: Commit**
```bash
git add src/lib/firebase/mirror.ts src/lib/firebase/hydrate.ts src/lib/firebase/__tests__/hydrate.test.ts
git commit -m "feat(forms): mirror + hydrate signed forms"
```

---

## Task 6: Store actions

**Files:**
- Modify: `src/lib/demo/store.tsx`

- [ ] **Step 1:** Add to `StoreValue`:
```ts
  formsForPatient: (patientID: string) => ReturnType<typeof backend.formsForPatient>;
  recordForm: (input: import("./backend").RecordFormInput, identity: Identity) => void;
  deleteForm: (patientID: string, formId: string, identity: Identity) => void;
```
Add to the `value` object:
```ts
      formsForPatient: (pid) => backend.formsForPatient(state, pid),
      recordForm: (input, identity) => {
        let form: ReturnType<typeof backend.recordSignedForm>["form"] | null = null;
        applyAndMirror(
          (s) => { const r = backend.recordSignedForm(s, input, identity, now); form = r.form; return r.state; },
          (m) => (form ? m.mirrorCreateForm(form) : Promise.resolve()),
        );
      },
      deleteForm: (patientID, formId, identity) =>
        applyAndMirror((s) => backend.deleteForm(s, patientID, formId, identity), (m) => m.mirrorDeleteForm(patientID, formId)),
```

- [ ] **Step 2: Run** — `npx tsc --noEmit` → clean; `npm test` → all green.
- [ ] **Step 3: Commit**
```bash
git add src/lib/demo/store.tsx
git commit -m "feat(forms): store actions record/delete + formsForPatient"
```

---

## Task 7: SignaturePad component

**Files:**
- Create: `src/components/app/SignaturePad.tsx`

- [ ] **Step 1: Implement** `src/components/app/SignaturePad.tsx`:
```tsx
"use client";

import { useRef, useState } from "react";

// Draws on a canvas; reports a PNG Blob + data URL when asked. `onChange(hasDrawing)`
// lets the parent gate submit. Call `getPng()` to read the current drawing.
export interface SignatureHandle { getPng: () => Promise<{ blob: Blob; dataUrl: string } | null> }

export function SignaturePad({ onChange, handleRef }: {
  onChange: (hasDrawing: boolean) => void;
  handleRef: React.MutableRefObject<SignatureHandle | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [dirty, setDirty] = useState(false);

  function pos(e: React.PointerEvent) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  }
  function start(e: React.PointerEvent) {
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.beginPath(); ctx.moveTo(x, y);
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.strokeStyle = "#211c16";
    const { x, y } = pos(e);
    ctx.lineTo(x, y); ctx.stroke();
    if (!dirty) { setDirty(true); onChange(true); }
  }
  function end() { drawing.current = false; }
  function clear() {
    const c = canvasRef.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setDirty(false); onChange(false);
  }

  handleRef.current = {
    getPng: () =>
      new Promise((resolve) => {
        if (!dirty) return resolve(null);
        canvasRef.current!.toBlob((blob) => {
          if (!blob) return resolve(null);
          resolve({ blob, dataUrl: canvasRef.current!.toDataURL("image/png") });
        }, "image/png");
      }),
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={600}
        height={200}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="w-full touch-none rounded-inner border border-line bg-card"
        style={{ aspectRatio: "3 / 1" }}
      />
      <button type="button" onClick={clear} className="mt-2 text-sm text-ink-soft hover:text-ink">Clear signature</button>
    </div>
  );
}
```

- [ ] **Step 2: Run** — `npx tsc --noEmit` → clean.
- [ ] **Step 3: Commit**
```bash
git add src/components/app/SignaturePad.tsx
git commit -m "feat(forms): drawn signature canvas component"
```

---

## Task 8: Consent flow page

**Files:**
- Create: `src/app/app/patients/[id]/consent/page.tsx`

- [ ] **Step 1: Implement** `src/app/app/patients/[id]/consent/page.tsx`:
```tsx
"use client";

import { use, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { patientPermissions } from "@/lib/demo/backend";
import {
  FORM_TEMPLATE_KINDS, templateDisplayName, templateFullText, formTemplate, OFF_LABEL_CLAUSE,
  type FormTemplateKind,
} from "@/lib/demo/forms";
import type { FormAnswer } from "@/lib/demo/types";
import { SignaturePad, type SignatureHandle } from "@/components/app/SignaturePad";

export default function ConsentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  const router = useRouter();
  const sigRef = useRef<SignatureHandle | null>(null);
  const [kind, setKind] = useState<FormTemplateKind>("antiwrinkleConsent");
  const [answers, setAnswers] = useState<Record<string, FormAnswer>>({});
  const [hasSig, setHasSig] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!identity) return null;
  if (store.status === "loading") return <p className="text-ink-soft">Loading…</p>;

  const patient = store.state.patients[id];
  if (!patient || !patientPermissions(identity, patient).canSendForms) {
    return <p className="text-ink-soft">You can&apos;t send forms for this patient.</p>;
  }
  const template = formTemplate(kind);
  const me = identity;

  function setAnswer(qid: string, patch: Partial<FormAnswer>) {
    setAnswers((a) => ({ ...a, [qid]: { questionID: qid, answer: false, detail: "", ...a[qid], ...patch } }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const png = await sigRef.current?.getPng();
      if (!png) { setError("Please draw a signature."); setBusy(false); return; }
      const answerList = template.questions.map((q) => answers[q.id] ?? { questionID: q.id, answer: false, detail: "" });
      const live = store.status !== "demo";
      let signatureFileId: string | undefined;
      let signatureDataUrl: string | undefined;
      if (live) {
        const { uploadSignature } = await import("@/lib/firebase/storage");
        // Stable form id is minted inside the store; upload under a temp id is fine —
        // use a client id so the path is deterministic for this submission.
        const formId = crypto.randomUUID();
        signatureFileId = await uploadSignature(id, formId, png.blob);
      } else {
        signatureDataUrl = png.dataUrl;
      }
      store.recordForm({ patientID: id, template: kind, channel: "onDevice", answers: answerList, signatureFileId, signatureDataUrl }, me);
      router.push(`/app/patients/${id}`);
    } catch {
      setError("Could not save the form. Please try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-2xl">
      <h1 className="font-display text-3xl text-ink">Sign a consent</h1>
      <label className="mt-5 block">
        <span className="micro">Form</span>
        <select value={kind} onChange={(e) => { setKind(e.target.value as FormTemplateKind); setAnswers({}); }}
          className="mt-1.5 w-full rounded-field border border-line bg-card px-3 py-2 text-ink">
          {FORM_TEMPLATE_KINDS.map((k) => <option key={k} value={k}>{templateDisplayName(k)}</option>)}
        </select>
      </label>

      <h2 className="mt-6 font-display text-xl text-ink">Screening questions</h2>
      <div className="mt-3 flex flex-col gap-4">
        {template.questions.map((q) => {
          const a = answers[q.id];
          return (
            <div key={q.id} className="rounded-inner border border-line p-3">
              <p className="text-sm text-ink">{q.prompt}</p>
              {q.kind.type === "yesNo" ? (
                <>
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => setAnswer(q.id, { answer: true })}
                      className={`rounded-btn px-3 py-1 text-sm ${a?.answer ? "text-card" : "border border-line text-ink-soft"}`}
                      style={a?.answer ? { background: "var(--color-tint)" } : undefined}>Yes</button>
                    <button type="button" onClick={() => setAnswer(q.id, { answer: false })}
                      className={`rounded-btn px-3 py-1 text-sm ${a && !a.answer ? "text-card" : "border border-line text-ink-soft"}`}
                      style={a && !a.answer ? { background: "var(--color-tint)" } : undefined}>No</button>
                  </div>
                  {q.kind.detailPrompt && a?.answer && (
                    <input value={a?.detail ?? ""} onChange={(e) => setAnswer(q.id, { detail: e.target.value })}
                      placeholder={q.kind.detailPrompt}
                      className="mt-2 w-full rounded-field border border-line bg-card px-3 py-1.5 text-sm text-ink" />
                  )}
                </>
              ) : (
                <input value={a?.detail ?? ""} onChange={(e) => setAnswer(q.id, { answer: true, detail: e.target.value })}
                  className="mt-2 w-full rounded-field border border-line bg-card px-3 py-1.5 text-sm text-ink" />
              )}
            </div>
          );
        })}
      </div>

      <h2 className="mt-6 font-display text-xl text-ink">Consent text</h2>
      <div className="mt-3 max-h-72 overflow-y-auto rounded-inner border border-line p-4 text-sm leading-relaxed text-ink-soft">
        {templateFullText(template).map((para, i) => (
          <p key={i} className={`mt-2 first:mt-0 ${para === OFF_LABEL_CLAUSE ? "rounded-inner border-l-4 p-2" : ""}`}
            style={para === OFF_LABEL_CLAUSE ? { borderColor: "var(--color-tint)", background: "var(--color-tint-soft)" } : undefined}>
            {para}
          </p>
        ))}
      </div>

      <h2 className="mt-6 font-display text-xl text-ink">Signature</h2>
      <div className="mt-3"><SignaturePad onChange={setHasSig} handleRef={sigRef} /></div>

      {error && <p className="mt-3 text-sm" style={{ color: "var(--color-rose)" }}>{error}</p>}
      <div className="mt-6 flex gap-3">
        <button type="submit" disabled={!hasSig || busy}
          className="rounded-btn px-5 py-2.5 text-sm font-medium text-card disabled:opacity-50" style={{ background: "var(--color-tint)" }}>
          {busy ? "Saving…" : "Record signed consent"}
        </button>
        <button type="button" onClick={() => router.back()} className="rounded-btn border border-line px-5 py-2.5 text-sm text-ink-soft">Cancel</button>
      </div>
    </form>
  );
}
```
> Note the live-mode signature: a `crypto.randomUUID()` is used for the Storage path, but `store.recordForm` mints its own `f-<uuid>` id for the doc. That's fine — the doc just references the uploaded path via `signatureFileId`; the two ids need not match. (A later refactor could thread the doc id into the upload; not needed now.)

- [ ] **Step 2: Run** — `npx tsc --noEmit` → clean; `npm run build` → `/app/patients/[id]/consent` compiles.
- [ ] **Step 3: Commit**
```bash
git add "src/app/app/patients/[id]/consent/page.tsx"
git commit -m "feat(forms): on-device consent signing flow"
```

---

## Task 9: Forms section + read-only view on the patient file

**Files:**
- Modify: `src/app/app/patients/[id]/page.tsx`
- Create: `src/app/app/patients/[id]/forms/[formId]/page.tsx`

- [ ] **Step 1:** In `src/app/app/patients/[id]/page.tsx`, after `const active = store.activeAuthorisations(id);` add `const forms = store.formsForPatient(id);`. In the LEFT column, after the Notes `<ul>` block (before the closing `</div>` of the left column), insert a Forms section:
```tsx
        <div className="mt-8 flex items-center justify-between gap-4">
          <h2 className="font-display text-xl text-ink">Consent forms</h2>
          {perms.canSendForms && (
            <Link href={`/app/patients/${id}/consent`} className="rounded-btn px-3 py-1.5 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>
              Sign a consent
            </Link>
          )}
        </div>
        <ul className="mt-3 flex flex-col gap-2">
          {forms.map((f) => (
            <li key={f.id}>
              <Link href={`/app/patients/${id}/forms/${f.id}`} className="flex items-center justify-between rounded-inner border border-line bg-card px-4 py-3 hover:border-tint">
                <span className="text-sm font-medium text-ink">{templateDisplayName(f.template)}</span>
                <span className="micro">{new Date(f.signedAt).toLocaleDateString()} · {f.channel}</span>
              </Link>
            </li>
          ))}
          {forms.length === 0 && <li className="text-sm text-ink-soft">No signed forms yet.</li>}
        </ul>
```
Add `templateDisplayName` to the imports: `import { templateDisplayName } from "@/lib/demo/forms";`.

- [ ] **Step 2: Create** `src/app/app/patients/[id]/forms/[formId]/page.tsx`:
```tsx
"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { patientPermissions } from "@/lib/demo/backend";
import { templateDisplayName, formTemplate } from "@/lib/demo/forms";

export default function FormViewPage({ params }: { params: Promise<{ id: string; formId: string }> }) {
  const { id, formId } = use(params);
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  const router = useRouter();
  const [sigUrl, setSigUrl] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const form = store.formsForPatient(id).find((f) => f.id === formId);

  useEffect(() => {
    let cancelled = false;
    if (form?.signatureDataUrl) { setSigUrl(form.signatureDataUrl); return; }
    if (form?.signatureFileId) {
      void (async () => {
        try { const { signatureUrl } = await import("@/lib/firebase/storage"); const u = await signatureUrl(form.signatureFileId!); if (!cancelled) setSigUrl(u); }
        catch { /* leave unset */ }
      })();
    }
    return () => { cancelled = true; };
  }, [form?.signatureFileId, form?.signatureDataUrl]);

  if (!identity) return null;
  const patient = store.state.patients[id];
  if (!patient || !form) return <p className="text-ink-soft">Form not found.</p>;
  const perms = patientPermissions(identity, patient);
  const questions = formTemplate(form.template).questions;

  function doDelete() {
    store.deleteForm(id, formId, identity!);
    router.push(`/app/patients/${id}`);
  }

  return (
    <div className="max-w-2xl">
      <Link href={`/app/patients/${id}`} className="text-sm text-ink-soft hover:text-ink">← Back to patient</Link>
      <h1 className="mt-3 font-display text-3xl text-ink">{templateDisplayName(form.template)}</h1>
      <p className="mt-1 text-ink-soft">Signed {new Date(form.signedAt).toLocaleString()} · {form.channel}</p>

      {form.answers.length > 0 && (
        <>
          <h2 className="mt-6 font-display text-lg text-ink">Responses</h2>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {form.answers.map((a) => {
              const q = questions.find((x) => x.id === a.questionID);
              return <li key={a.questionID} className="text-ink-soft"><span className="text-ink">{a.answer ? "Yes" : "No"}</span> — {q?.prompt ?? a.questionID}{a.detail ? ` (${a.detail})` : ""}</li>;
            })}
          </ul>
        </>
      )}

      <h2 className="mt-6 font-display text-lg text-ink">Consent text</h2>
      <div className="mt-2 rounded-inner border border-line p-4 text-sm leading-relaxed text-ink-soft">
        {[form.intro, ...form.clauses].map((p, i) => <p key={i} className="mt-2 first:mt-0">{p}</p>)}
      </div>

      <h2 className="mt-6 font-display text-lg text-ink">Signature</h2>
      {sigUrl
        ? <img src={sigUrl} alt="Signature" className="mt-2 max-h-40 rounded-inner border border-line bg-card" />
        : <p className="mt-2 text-sm text-ink-soft">Signature unavailable.</p>}

      {perms.canSendForms && (
        <div className="mt-8">
          {!confirming
            ? <button onClick={() => setConfirming(true)} className="rounded-btn border border-line px-4 py-2 text-sm text-ink-soft hover:border-tint">Delete (signed in error)</button>
            : <span className="flex items-center gap-2">
                <button onClick={doDelete} className="rounded-btn px-4 py-2 text-sm font-medium text-card" style={{ background: "var(--color-rose)" }}>Confirm delete</button>
                <button onClick={() => setConfirming(false)} className="rounded-btn border border-line px-4 py-2 text-sm text-ink-soft">Cancel</button>
              </span>}
        </div>
      )}
    </div>
  );
}
```
> `<img src={sigUrl}>` uses a plain `<img>` (signature is a data URL or a Storage download URL, not a static asset) — if `eslint` flags `@next/next/no-img-element`, add a `{/* eslint-disable-next-line @next/next/no-img-element */}` line above it.

- [ ] **Step 3: Run** — `npx tsc --noEmit` → clean; `npm run lint` (address any new error; the `no-img-element` may need the disable comment); `npm test` → green; `npm run build` → both routes compile.
- [ ] **Step 4: Commit**
```bash
git add "src/app/app/patients/[id]/page.tsx" "src/app/app/patients/[id]/forms/[formId]/page.tsx"
git commit -m "feat(forms): forms list + read-only view with delete"
```

---

## Task 10: Verification gate + demo smoke + PR

- [ ] **Step 1: Offline gate** — `rm -rf .next && npm run lint && npx tsc --noEmit && npm test && npm run build` → all green; new tests pass; `/app/patients/[id]/consent` and `/app/patients/[id]/forms/[formId]` compile.
- [ ] **Step 2: Demo-mode smoke (preview).** If `.env.local` exists, move it aside (`mv .env.local .env.local.bak`) so the app runs in demo mode (signatures stay in-memory; no production writes), start the dev server, and verify as **Sarah (nurse)** on her patient Claire: "Sign a consent" → pick Antiwrinkle Consent → answer the two questions → confirm the off-label clause is visually set apart in the consent text → draw a signature → "Record signed consent" → it appears under **Consent forms** on the file → open it → responses + full text + **signature image** render → delete it → gone. **Restore `.env.local` afterwards** (`mv .env.local.bak .env.local`). Capture a screenshot of the consent flow.
- [ ] **Step 3: Document live verification** — append a "Consent signing" section to `docs/superpowers/firebase-live-verification.md`: sign a consent for a TEST patient → confirm the `patients/{id}/forms/{id}` doc + the `patients/{id}/signatures/{formId}.png` Storage object; the view loads the signature via the download URL; delete removes the doc (note the orphaned-signature-object caveat).
- [ ] **Step 4: Commit + PR**
```bash
git add docs/superpowers/firebase-live-verification.md
git commit -m "docs(forms): live verification checklist for consent signing"
```
Open the PR with `/create-pr` (base `main`). PR body notes: in-app channel only; PDF + remote channels deferred; signature deletes leave an orphaned Storage object (cleanup Function later); first Firebase Storage integration.

---

## Self-Review Notes

- **Spec coverage:** template library port + off-label invariant (T1) ✓; `SignedFormRecord` + state + record/delete ops (T2) ✓; mappers (T3) ✓; Storage upload/url (T4) ✓; mirror + hydrate forms (T5) ✓; store actions (T6) ✓; signature canvas (T7) ✓; consent flow incl. off-label set-apart (T8) ✓; forms list + read-only view + delete (T9) ✓; demo + live verification, caveats (T10) ✓.
- **Type consistency:** `FormTemplateKind`/`SigningChannel`/`FormQuestion`/`FormTemplate`/`formTemplate`/`templateFullText`/`templateDisplayName`/`OFF_LABEL_CLAUSE` (T1) used in T2/T3/T8/T9; `SignedFormRecord`/`FormAnswer` (T2) used in T3/T6/T8/T9; `recordSignedForm`/`deleteForm`/`formsForPatient`/`RecordFormInput` (T2) used by store (T6); `encodeForm`/`mapForm` (T3) used by mirror/hydrate (T5); `uploadSignature`/`signatureUrl` (T4) used by the pages (T8/T9); store `recordForm`/`deleteForm`/`formsForPatient` (T6) used by the pages (T8/T9).
- **Rules alignment:** signature path is `patients/{id}/signatures/{formId}.png` (catch-all image write, not the Function-only `forms/` path); form doc create/delete are `patientEditable`-gated and the doc carries the snapshot — matches the forms rules.
- **Known confirmations during implementation:** `firebase/storage` v11 exports (T4); the verbatim FormLibrary port (T1) — the off-label/question tests guard the critical bits, but the per-template prose must be copied exactly from `FormLibrary.swift` (do not paraphrase).
- **Caveat tracked:** delete orphans the signature Storage object (documented, T10).

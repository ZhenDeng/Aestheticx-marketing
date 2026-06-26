# Demo App Login + Core Clinical Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a login page and a role-tinted, in-memory authenticated app area to the AestheticX marketing site that demonstrates the core clinical loop (patients → patient file → clinical notes → treatment authorisation → calendar) using the iOS app's exact demo seed and domain rules.

**Architecture:** New `(app)` route group with a client layout that mounts an in-memory data store + demo auth context and guards access. Domain types, rules, and seed are faithful TypeScript ports of the iOS app's `AXDomain` / `InMemoryBackend` / `SessionState.demoBackend`. State resets on hard reload. No backend, no persistence.

**Tech Stack:** Next.js 16.2.9 (App Router), React 19, TypeScript 5, Tailwind v4, Vitest + React Testing Library (added in Task 1).

**Source of truth (read-only reference, do not import):** `/Users/zhendeng/Documents/AestheticX/AestheticXKit/Sources/AXDomain/{Models,Authorisations,PatientPermissions}.swift`, `AXData/InMemoryBackend.swift`, `AXFeatures/Session.swift`.

**Design tokens already in `src/app/globals.css`:** colors `--color-ink`, `--color-ink-soft`, `--color-card`, `--color-line`, role colors `--color-{rose,sage,slate,umber}` + `-soft`, and the tinting pair `--color-tint` / `--color-tint-soft`; radii `--radius-{card,inner,field,btn}`; fonts `--font-display`, `--font-body`, `--font-mono`. Tailwind utility classes in use: `text-ink`, `text-ink-soft`, `bg-card`, `border-line`, `font-display`, `rounded-card`, `rounded-inner`, `rounded-btn`, plus helper classes `kicker`, `micro`. The `@/` import alias maps to `src/`.

---

## Task 1: Add Vitest + React Testing Library test tooling

**Files:**
- Modify: `package.json` (scripts + devDependencies)
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Create: `src/lib/demo/__tests__/smoke.test.ts`

- [ ] **Step 1: Install test dependencies**

Run:
```bash
npm install -D vitest@^2 @vitejs/plugin-react@^4 @testing-library/react@^16 @testing-library/jest-dom@^6 @testing-library/user-event@^14 jsdom@^25
```
Expected: packages added to `devDependencies`, no errors.

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
```

- [ ] **Step 3: Create `vitest.setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Add the `test` script to `package.json`**

In the `"scripts"` block, add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Write a smoke test**

Create `src/lib/demo/__tests__/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";

describe("test tooling", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Run the test**

Run: `npm test`
Expected: PASS, 1 test passed.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts vitest.setup.ts src/lib/demo/__tests__/smoke.test.ts
git commit -m "test: add vitest + react testing library tooling"
```

---

## Task 2: Domain types (port of AXDomain models)

**Files:**
- Create: `src/lib/demo/types.ts`

No test (types + pure helpers are exercised by Task 3's tests). Includes small pure display helpers.

- [ ] **Step 1: Create `src/lib/demo/types.ts`**

```ts
// Faithful TypeScript port of the iOS app's AXDomain models.
// Source of truth: AestheticXKit/Sources/AXDomain/{Models,Authorisations}.swift.
// Enum raw values match the Swift `rawValue`s so the shapes stay wire-compatible.

export type Role = "doctor" | "nurse" | "clinicAdmin" | "superAdmin";

export interface UserRef {
  id: string;
  name: string;
}

export interface ClinicRef {
  id: string;
  name: string;
}

export type PracticeContext =
  | { kind: "independent" }
  | { kind: "clinic"; clinic: ClinicRef };

export interface Identity {
  user: UserRef;
  role: Role;
  context: PracticeContext;
}

export type PatientOwner =
  | { kind: "doctor"; id: string }
  | { kind: "nurse"; id: string }
  | { kind: "clinic"; id: string };

export interface DateOfBirth {
  year: number;
  month: number;
  day: number;
}

export type ProductCategory =
  | "neurotoxin"
  | "haFiller"
  | "skinBooster"
  | "collagenStimulator"
  | "prpPrf"
  | "other";

export type ProductUnit = "units" | "millilitres" | "vial" | "syringe" | "tube" | "freeText";

export interface MedicationItem {
  name: string;
  dosage: string;
  category: ProductCategory;
  brand?: string;
  unit: ProductUnit;
  areas: string[];
  timing?: string;
}

export interface Patient {
  id: string;
  givenName: string;
  lastName: string;
  dateOfBirth: DateOfBirth;
  gender: string;
  address: string;
  phone: string;
  email: string;
  allergies: string;
  currentMedications: string;
  owner: PatientOwner;
  prescribingDoctorIDs: string[];
  alert?: string;
  preferredName?: string;
}

export type RequestStatus = "pending" | "needsEdit" | "approved";

export interface PatientSummary {
  fullName: string;
  dateOfBirth: DateOfBirth;
  allergies: string;
  currentMedications: string;
  alert?: string;
}

export interface AuthorisationRequest {
  id: string;
  patientID: string;
  nurse: UserRef;
  doctorID: string;
  context: PracticeContext;
  items: MedicationItem[];
  status: RequestStatus;
  createdAt: number; // epoch ms
  patientSummary?: PatientSummary;
}

export interface Authorisation {
  id: string;
  requestID: string;
  patientID: string;
  doctorID: string;
  nurseID: string;
  clinicID: string | null;
  medication: MedicationItem;
  repeatsRemaining: number;
  expiresAt: number; // epoch ms
}

export type NoteKind = "general" | "treatment" | "aftercareRecord";

export interface TreatmentMedication {
  name: string;
  batch?: string;
  expiry?: string;
  dosage?: string;
}

export interface Note {
  id: string;
  patientID: string;
  kind: NoteKind;
  title: string;
  body: string;
  createdAt: number; // epoch ms
  authorID: string;
  authorBadge: string;
  consumedAuthorisationIDs: string[];
  medications: TreatmentMedication[];
}

export type AppointmentType = "authSlot" | "treatment";
export type AppointmentStatus =
  | "awaitingConfirmation"
  | "confirmed"
  | "completed";

export interface Appointment {
  id: string;
  type: AppointmentType;
  ownerID: string;
  dateISO: string; // yyyy-mm-dd
  startMinute: number;
  endMinute: number;
  status: AppointmentStatus;
  patientID?: string;
  patientName?: string;
  appointmentNote?: string;
}

export interface BillingEvent {
  id: string;
  requestID: string;
  patientID: string;
  counterpartyID: string; // clinic id, or nurse id when independent
  createdAt: number;
}

export interface RepeatUsage {
  authorisationID: string;
  patientID: string;
  clinicID: string | null;
  nurseID: string;
  date: number;
}

export interface DemoState {
  patients: Record<string, Patient>;
  requests: Record<string, AuthorisationRequest>;
  authorisations: Record<string, Authorisation>;
  notesByPatient: Record<string, Note[]>;
  appointments: Record<string, Appointment>;
  ledger: BillingEvent[];
  usages: RepeatUsage[];
}

// --- Pure display helpers (port of Patient computed properties) ---

function trimmedPreferred(p: Patient): string | undefined {
  const t = p.preferredName?.trim();
  return t ? t : undefined;
}

export function fullName(p: Patient): string {
  return `${p.givenName} ${p.lastName}`;
}

export function displayName(p: Patient): string {
  const pref = trimmedPreferred(p);
  return pref ? `${p.givenName} '${pref}' ${p.lastName}` : fullName(p);
}

export function calendarName(p: Patient): string {
  const pref = trimmedPreferred(p);
  return pref ? `${pref} ${p.lastName}` : fullName(p);
}

export function hasAlert(p: Patient): boolean {
  return (p.alert ?? "").trim().length > 0;
}

export function identityBadge(identity: Identity): string {
  return identity.context.kind === "clinic"
    ? `${identity.user.name} @ ${identity.context.clinic.name}`
    : identity.user.name;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/demo/types.ts
git commit -m "feat: add demo domain types ported from AXDomain"
```

---

## Task 3: Domain rules (port of InMemoryBackend + permissions) — TDD

**Files:**
- Create: `src/lib/demo/backend.ts`
- Test: `src/lib/demo/__tests__/backend.test.ts`

All functions are pure and take an explicit `now` for determinism. `submit/approve/requireEdit/saveTreatmentNote` return a NEW `DemoState` (immutable updates) plus any created entity. Errors throw `BackendError`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/demo/__tests__/backend.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import type {
  DemoState,
  Identity,
  Patient,
  MedicationItem,
} from "@/lib/demo/types";
import {
  emptyState,
  classifySearch,
  patientPermissions,
  searchPatients,
  submitRequest,
  approveRequest,
  requireEdit,
  activeAuthorisations,
  saveTreatmentNote,
  REPEATS_PER_AUTHORISATION,
  VALIDITY_MONTHS,
} from "@/lib/demo/backend";

const NOW = Date.UTC(2026, 5, 26); // 2026-06-26

const sarahIndependent: Identity = {
  user: { id: "u-sarah", name: "Sarah Chen" },
  role: "nurse",
  context: { kind: "independent" },
};
const voss: Identity = {
  user: { id: "u-voss", name: "Dr Elena Voss" },
  role: "doctor",
  context: { kind: "independent" },
};

function nursePatient(id: string, ownerID: string): Patient {
  return {
    id,
    givenName: "Claire",
    lastName: "Donovan",
    dateOfBirth: { year: 1987, month: 7, day: 4 },
    gender: "Female",
    address: "",
    phone: "0432 901 343",
    email: "claire@example.com",
    allergies: "NKDA",
    currentMedications: "Nil",
    owner: { kind: "nurse", id: ownerID },
    prescribingDoctorIDs: [],
  };
}

function stateWith(...patients: Patient[]): DemoState {
  const s = emptyState();
  for (const p of patients) s.patients[p.id] = p;
  return s;
}

const profhilo: MedicationItem = {
  name: "Profhilo",
  dosage: "2",
  category: "skinBooster",
  unit: "millilitres",
  areas: ["Full Face"],
};

describe("classifySearch", () => {
  it("classifies a name", () => {
    expect(classifySearch("Donovan")).toBe("name");
  });
  it("classifies a date of birth", () => {
    expect(classifySearch("4/7/1987")).toBe("dateOfBirth");
  });
  it("classifies a phone number", () => {
    expect(classifySearch("0432 901 343")).toBe("phone");
  });
});

describe("patientPermissions", () => {
  it("lets an independent nurse owner write treatment notes", () => {
    const p = nursePatient("p1", "u-sarah");
    const perms = patientPermissions(sarahIndependent, p);
    expect(perms.canView).toBe(true);
    expect(perms.canWriteTreatmentNote).toBe(true);
  });
  it("hides another nurse's independent patient", () => {
    const p = nursePatient("p1", "u-other");
    expect(patientPermissions(sarahIndependent, p).canView).toBe(false);
  });
  it("denies clinical write to a clinic admin", () => {
    const admin: Identity = {
      user: { id: "u-ava", name: "Ava Lim" },
      role: "clinicAdmin",
      context: { kind: "clinic", clinic: { id: "clinic-lumiere", name: "Lumière Clinic" } },
    };
    const p: Patient = { ...nursePatient("p1", "x"), owner: { kind: "clinic", id: "clinic-lumiere" } };
    const perms = patientPermissions(admin, p);
    expect(perms.canView).toBe(true);
    expect(perms.canWriteTreatmentNote).toBe(false);
  });
});

describe("searchPatients", () => {
  it("returns the nurse's own patients when query is blank", () => {
    const state = stateWith(nursePatient("p1", "u-sarah"), nursePatient("p2", "u-other"));
    const result = searchPatients(state, "", sarahIndependent);
    expect(result.map((p) => p.id)).toEqual(["p1"]);
  });
  it("filters by name within the visible scope", () => {
    const state = stateWith(nursePatient("p1", "u-sarah"));
    expect(searchPatients(state, "donovan", sarahIndependent)).toHaveLength(1);
    expect(searchPatients(state, "zzz", sarahIndependent)).toHaveLength(0);
  });
});

describe("submitRequest", () => {
  it("creates a pending request from a nurse", () => {
    const state = stateWith(nursePatient("p1", "u-sarah"));
    const { state: next, request } = submitRequest(
      state,
      { patientID: "p1", doctorID: "u-voss", items: [profhilo], identity: sarahIndependent },
      NOW,
    );
    expect(request.status).toBe("pending");
    expect(next.requests[request.id]).toBeDefined();
    expect(request.patientSummary?.fullName).toBe("Claire Donovan");
  });
  it("rejects a request from a doctor", () => {
    const state = stateWith(nursePatient("p1", "u-sarah"));
    expect(() =>
      submitRequest(state, { patientID: "p1", doctorID: "u-voss", items: [profhilo], identity: voss }, NOW),
    ).toThrow();
  });
});

describe("approveRequest", () => {
  it("issues one authorisation per medication with 5 repeats and 6-month expiry, plus one billing event", () => {
    let state = stateWith(nursePatient("p1", "u-sarah"));
    const submitted = submitRequest(
      state,
      { patientID: "p1", doctorID: "u-voss", items: [profhilo], identity: sarahIndependent },
      NOW,
    );
    state = submitted.state;
    const { state: next, granted } = approveRequest(state, submitted.request.id, voss, NOW);

    expect(granted).toHaveLength(1);
    expect(granted[0].repeatsRemaining).toBe(REPEATS_PER_AUTHORISATION);
    expect(next.requests[submitted.request.id].status).toBe("approved");
    expect(next.ledger).toHaveLength(1); // one approved request == one billable count
    expect(next.patients["p1"].prescribingDoctorIDs).toContain("u-voss");

    const expiry = new Date(granted[0].expiresAt);
    const start = new Date(NOW);
    expect(expiry.getUTCMonth()).toBe((start.getUTCMonth() + VALIDITY_MONTHS) % 12);
  });
  it("refuses approval from a doctor who does not own the request", () => {
    let state = stateWith(nursePatient("p1", "u-sarah"));
    const submitted = submitRequest(
      state, { patientID: "p1", doctorID: "u-voss", items: [profhilo], identity: sarahIndependent }, NOW,
    );
    state = submitted.state;
    const other: Identity = { ...voss, user: { id: "u-okafor", name: "Dr James Okafor" } };
    expect(() => approveRequest(state, submitted.request.id, other, NOW)).toThrow();
  });
});

describe("requireEdit", () => {
  it("sends the request back without approving (no flat reject)", () => {
    let state = stateWith(nursePatient("p1", "u-sarah"));
    const submitted = submitRequest(
      state, { patientID: "p1", doctorID: "u-voss", items: [profhilo], identity: sarahIndependent }, NOW,
    );
    const next = requireEdit(submitted.state, submitted.request.id, voss);
    expect(next.requests[submitted.request.id].status).toBe("needsEdit");
  });
});

describe("saveTreatmentNote", () => {
  it("consumes one repeat from each ticked authorisation", () => {
    let state = stateWith(nursePatient("p1", "u-sarah"));
    const submitted = submitRequest(
      state, { patientID: "p1", doctorID: "u-voss", items: [profhilo], identity: sarahIndependent }, NOW,
    );
    const approved = approveRequest(submitted.state, submitted.request.id, voss, NOW);
    state = approved.state;
    const authID = approved.granted[0].id;

    const { state: next } = saveTreatmentNote(
      state,
      { patientID: "p1", tickedIDs: [authID], title: "Profhilo session 1", body: "Full face.", medications: [], identity: sarahIndependent },
      NOW,
    );
    expect(next.authorisations[authID].repeatsRemaining).toBe(REPEATS_PER_AUTHORISATION - 1);
    expect(activeAuthorisations(next, "p1", NOW)).toHaveLength(1);
    expect(next.notesByPatient["p1"]).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- backend`
Expected: FAIL — `emptyState` / `backend` module not found.

- [ ] **Step 3: Implement `src/lib/demo/backend.ts`**

```ts
// Pure domain rules ported from the iOS InMemoryBackend + PatientPermissions + Authorisations.
// Every mutator returns a NEW DemoState (immutable). `now` is passed in for deterministic tests.
import type {
  Authorisation,
  AuthorisationRequest,
  BillingEvent,
  DemoState,
  Identity,
  MedicationItem,
  Note,
  Patient,
  PatientSummary,
  TreatmentMedication,
} from "./types";
import { fullName, identityBadge } from "./types";

export const REPEATS_PER_AUTHORISATION = 5;
export const VALIDITY_MONTHS = 6;

export class BackendError extends Error {}

export function emptyState(): DemoState {
  return {
    patients: {},
    requests: {},
    authorisations: {},
    notesByPatient: {},
    appointments: {},
    ledger: [],
    usages: [],
  };
}

// --- Search ---

export type SearchKind = "name" | "dateOfBirth" | "phone";

export function classifySearch(raw: string): SearchKind {
  const trimmed = raw.trim();
  const digits = [...trimmed].filter((c) => c >= "0" && c <= "9");
  if (trimmed.includes("/") && digits.length > 0) return "dateOfBirth";
  if (digits.length > 0 && [...trimmed].every((c) => (c >= "0" && c <= "9") || c === " " || c === "+")) {
    return "phone";
  }
  return "name";
}

// --- Permissions (port of PatientPermissions) ---

export interface Permissions {
  canView: boolean;
  canEditDetails: boolean;
  canDelete: boolean;
  canMerge: boolean;
  canWriteGeneralNote: boolean;
  canWriteTreatmentNote: boolean;
  canSendForms: boolean;
  canViewBusinessStats: boolean;
}

function perms(p: Partial<Permissions>): Permissions {
  return {
    canView: false,
    canEditDetails: false,
    canDelete: false,
    canMerge: false,
    canWriteGeneralNote: false,
    canWriteTreatmentNote: false,
    canSendForms: false,
    canViewBusinessStats: false,
    ...p,
  };
}

function contextClinicID(identity: Identity): string | null {
  return identity.context.kind === "clinic" ? identity.context.clinic.id : null;
}

export function patientPermissions(identity: Identity, patient: Patient): Permissions {
  if (identity.role === "superAdmin") {
    return perms({ canView: true, canViewBusinessStats: true });
  }
  const userID = identity.user.id;
  const isPrescriber = identity.role === "doctor" && patient.prescribingDoctorIDs.includes(userID);

  switch (patient.owner.kind) {
    case "doctor":
      if (identity.role === "doctor" && identity.context.kind === "independent" && userID === patient.owner.id) {
        return perms({ canView: true, canEditDetails: true, canDelete: true, canWriteGeneralNote: true, canWriteTreatmentNote: true, canSendForms: true });
      }
      return perms({});
    case "nurse":
      if (identity.role === "nurse" && identity.context.kind === "independent" && userID === patient.owner.id) {
        return perms({ canView: true, canEditDetails: true, canDelete: true, canWriteGeneralNote: true, canWriteTreatmentNote: true, canSendForms: true });
      }
      if (isPrescriber) {
        return perms({ canView: true, canWriteGeneralNote: true, canWriteTreatmentNote: true });
      }
      return perms({});
    case "clinic":
      if (contextClinicID(identity) === patient.owner.id) {
        switch (identity.role) {
          case "clinicAdmin":
            return perms({ canView: true, canEditDetails: true, canDelete: true, canMerge: true, canWriteGeneralNote: true, canSendForms: true, canViewBusinessStats: true });
          case "doctor":
          case "nurse":
            return perms({ canView: true, canEditDetails: true, canWriteGeneralNote: true, canWriteTreatmentNote: true, canSendForms: true });
          default:
            return perms({ canView: true, canViewBusinessStats: true });
        }
      }
      if (isPrescriber) {
        return perms({ canView: true, canWriteGeneralNote: true, canWriteTreatmentNote: true });
      }
      return perms({});
  }
}

export function visiblePatients(state: DemoState, identity: Identity): Patient[] {
  return Object.values(state.patients)
    .filter((p) => patientPermissions(identity, p).canView)
    .sort((a, b) => (a.lastName + a.givenName).localeCompare(b.lastName + b.givenName));
}

export function searchPatients(state: DemoState, query: string, identity: Identity): Patient[] {
  const scope = visiblePatients(state, identity);
  const trimmed = query.trim();
  if (!trimmed) return scope;

  switch (classifySearch(trimmed)) {
    case "name": {
      const needle = trimmed.toLowerCase();
      return scope.filter((p) => fullName(p).toLowerCase().includes(needle));
    }
    case "phone": {
      const digits = [...trimmed].filter((c) => c >= "0" && c <= "9").join("");
      return scope.filter((p) => [...p.phone].filter((c) => c >= "0" && c <= "9").join("") === digits);
    }
    case "dateOfBirth": {
      const parts = trimmed.split("/").map((s) => parseInt(s, 10)).filter((n) => !Number.isNaN(n));
      if (parts.length !== 3) return [];
      return scope.filter(
        (p) => p.dateOfBirth.day === parts[0] && p.dateOfBirth.month === parts[1] && p.dateOfBirth.year === parts[2],
      );
    }
  }
}

// --- Authorisations ---

function patientSummary(p: Patient): PatientSummary {
  return {
    fullName: fullName(p),
    dateOfBirth: p.dateOfBirth,
    allergies: p.allergies,
    currentMedications: p.currentMedications,
    alert: p.alert,
  };
}

function addMonthsUTC(epochMs: number, months: number): number {
  const d = new Date(epochMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
}

export function isAuthActive(a: Authorisation, now: number): boolean {
  return a.repeatsRemaining > 0 && now < a.expiresAt;
}

export function activeAuthorisations(state: DemoState, patientID: string, now: number): Authorisation[] {
  return Object.values(state.authorisations)
    .filter((a) => a.patientID === patientID && isAuthActive(a, now))
    .sort((a, b) => a.expiresAt - b.expiresAt);
}

let counter = 0;
function makeID(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

export interface SubmitRequestInput {
  patientID: string;
  doctorID: string;
  items: MedicationItem[];
  identity: Identity;
}

export function submitRequest(
  state: DemoState,
  input: SubmitRequestInput,
  now: number,
): { state: DemoState; request: AuthorisationRequest } {
  const patient = state.patients[input.patientID];
  if (!patient) throw new BackendError("notFound");
  if (input.identity.role !== "nurse" || !patientPermissions(input.identity, patient).canView) {
    throw new BackendError("notPermitted");
  }
  const request: AuthorisationRequest = {
    id: makeID("req"),
    patientID: input.patientID,
    nurse: input.identity.user,
    doctorID: input.doctorID,
    context: input.identity.context,
    items: input.items,
    status: "pending",
    createdAt: now,
    patientSummary: patientSummary(patient),
  };
  return { state: { ...state, requests: { ...state.requests, [request.id]: request } }, request };
}

export function pendingRequestsForDoctor(state: DemoState, doctorID: string): AuthorisationRequest[] {
  return Object.values(state.requests)
    .filter((r) => r.doctorID === doctorID && r.status === "pending")
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function openRequestsForPatient(state: DemoState, patientID: string, nurseID: string): AuthorisationRequest[] {
  return Object.values(state.requests)
    .filter((r) => r.patientID === patientID && r.nurse.id === nurseID && (r.status === "pending" || r.status === "needsEdit"))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function approveRequest(
  state: DemoState,
  requestID: string,
  identity: Identity,
  now: number,
): { state: DemoState; granted: Authorisation[] } {
  const request = state.requests[requestID];
  if (!request) throw new BackendError("notFound");
  if (identity.role !== "doctor" || identity.user.id !== request.doctorID || request.status !== "pending") {
    throw new BackendError("notPermitted");
  }
  const expiry = addMonthsUTC(now, VALIDITY_MONTHS);
  const clinicID = request.context.kind === "clinic" ? request.context.clinic.id : null;
  const granted: Authorisation[] = request.items.map((item, index) => ({
    id: `${request.id}-${index}`,
    requestID: request.id,
    patientID: request.patientID,
    doctorID: request.doctorID,
    nurseID: request.nurse.id,
    clinicID,
    medication: item,
    repeatsRemaining: REPEATS_PER_AUTHORISATION,
    expiresAt: expiry,
  }));

  const authorisations = { ...state.authorisations };
  for (const a of granted) authorisations[a.id] = a;

  const event: BillingEvent = {
    id: makeID("ev"),
    requestID: request.id,
    patientID: request.patientID,
    counterpartyID: clinicID ?? request.nurse.id,
    createdAt: now,
  };

  const patient = state.patients[request.patientID];
  const patients = { ...state.patients };
  if (patient && !patient.prescribingDoctorIDs.includes(identity.user.id)) {
    patients[patient.id] = { ...patient, prescribingDoctorIDs: [...patient.prescribingDoctorIDs, identity.user.id] };
  }

  return {
    state: {
      ...state,
      patients,
      authorisations,
      requests: { ...state.requests, [requestID]: { ...request, status: "approved" } },
      ledger: [...state.ledger, event],
    },
    granted,
  };
}

export function requireEdit(state: DemoState, requestID: string, identity: Identity): DemoState {
  const request = state.requests[requestID];
  if (!request) throw new BackendError("notFound");
  if (identity.role !== "doctor" || identity.user.id !== request.doctorID) {
    throw new BackendError("notPermitted");
  }
  return { ...state, requests: { ...state.requests, [requestID]: { ...request, status: "needsEdit" } } };
}

// --- Notes ---

function canUseAuthorisation(a: Authorisation, identity: Identity): boolean {
  if (a.clinicID) return contextClinicID(identity) === a.clinicID;
  return identity.context.kind === "independent" && identity.user.id === a.nurseID;
}

export function notesForPatient(state: DemoState, patientID: string): Note[] {
  return [...(state.notesByPatient[patientID] ?? [])].sort((a, b) => b.createdAt - a.createdAt);
}

export interface SaveGeneralNoteInput {
  patientID: string;
  title: string;
  body: string;
  identity: Identity;
}

export function saveGeneralNote(state: DemoState, input: SaveGeneralNoteInput, now: number): { state: DemoState; note: Note } {
  const patient = state.patients[input.patientID];
  if (!patient) throw new BackendError("notFound");
  if (!patientPermissions(input.identity, patient).canWriteGeneralNote) throw new BackendError("notPermitted");
  const note: Note = {
    id: makeID("n"),
    patientID: input.patientID,
    kind: "general",
    title: input.title,
    body: input.body,
    createdAt: now,
    authorID: input.identity.user.id,
    authorBadge: identityBadge(input.identity),
    consumedAuthorisationIDs: [],
    medications: [],
  };
  return appendNote(state, note);
}

export interface SaveTreatmentNoteInput {
  patientID: string;
  tickedIDs: string[];
  title: string;
  body: string;
  medications: TreatmentMedication[];
  identity: Identity;
}

export function saveTreatmentNote(state: DemoState, input: SaveTreatmentNoteInput, now: number): { state: DemoState; note: Note } {
  const patient = state.patients[input.patientID];
  if (!patient) throw new BackendError("notFound");
  if (!patientPermissions(input.identity, patient).canWriteTreatmentNote) throw new BackendError("notPermitted");

  const authorisations = { ...state.authorisations };
  const usages = [...state.usages];

  const isDoctorDirect = input.identity.role === "doctor" && input.tickedIDs.length === 0;
  if (!isDoctorDirect) {
    if (input.tickedIDs.length === 0) throw new BackendError("nothingTicked");
    // Validate all before mutating any (all-or-nothing).
    for (const id of input.tickedIDs) {
      const a = state.authorisations[id];
      if (!a) throw new BackendError("notFound");
      if (!isAuthActive(a, now)) throw new BackendError("notActive");
      if (!canUseAuthorisation(a, input.identity)) throw new BackendError("notPermitted");
    }
    for (const id of input.tickedIDs) {
      const a = state.authorisations[id];
      authorisations[id] = { ...a, repeatsRemaining: a.repeatsRemaining - 1 };
      usages.push({ authorisationID: id, patientID: input.patientID, clinicID: a.clinicID, nurseID: input.identity.user.id, date: now });
    }
  }

  const note: Note = {
    id: makeID("n"),
    patientID: input.patientID,
    kind: "treatment",
    title: input.title,
    body: input.body,
    createdAt: now,
    authorID: input.identity.user.id,
    authorBadge: identityBadge(input.identity),
    consumedAuthorisationIDs: input.tickedIDs,
    medications: input.medications,
  };
  const withNote = appendNote({ ...state, authorisations, usages }, note);
  return withNote;
}

function appendNote(state: DemoState, note: Note): { state: DemoState; note: Note } {
  const existing = state.notesByPatient[note.patientID] ?? [];
  return {
    state: { ...state, notesByPatient: { ...state.notesByPatient, [note.patientID]: [...existing, note] } },
    note,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- backend`
Expected: PASS — all `backend` tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/demo/backend.ts src/lib/demo/__tests__/backend.test.ts
git commit -m "feat: add demo domain rules ported from InMemoryBackend (TDD)"
```

---

## Task 4: Demo accounts + seed data (port of SessionState.demoBackend) — TDD

**Files:**
- Create: `src/lib/demo/accounts.ts`
- Create: `src/lib/demo/seed.ts`
- Test: `src/lib/demo/__tests__/seed.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/demo/__tests__/seed.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildSeedState, SEED_NOW } from "@/lib/demo/seed";
import { DEMO_ACCOUNTS } from "@/lib/demo/accounts";
import { searchPatients, pendingRequestsForDoctor, activeAuthorisations } from "@/lib/demo/backend";

describe("demo accounts", () => {
  it("includes the four primary roles", () => {
    const labels = DEMO_ACCOUNTS.map((a) => a.label);
    expect(labels).toContain("Sarah Chen — Nurse");
    expect(labels).toContain("Dr Elena Voss — Doctor");
    expect(labels).toContain("Ava Lim — Clinic Admin");
  });
});

describe("buildSeedState", () => {
  it("seeds three patients visible across the demo", () => {
    const state = buildSeedState();
    const names = Object.values(state.patients).map((p) => `${p.givenName} ${p.lastName}`).sort();
    expect(names).toEqual(["Amara Boyd", "Claire Donovan", "Grace Huang"]);
  });

  it("leaves Claire Donovan's Profhilo request pending for Dr Voss", () => {
    const state = buildSeedState();
    const pending = pendingRequestsForDoctor(state, "u-voss");
    expect(pending.length).toBeGreaterThanOrEqual(1);
    expect(pending.some((r) => r.items.some((i) => i.name === "Profhilo"))).toBe(true);
  });

  it("gives Amara an active authorisation with a consumed repeat", () => {
    const state = buildSeedState();
    const amara = Object.values(state.patients).find((p) => p.givenName === "Amara")!;
    const active = activeAuthorisations(state, amara.id, SEED_NOW);
    expect(active.length).toBeGreaterThanOrEqual(1);
    // The forehead/glabella auth had one repeat consumed by the seeded treatment note.
    expect(active.some((a) => a.repeatsRemaining === 4)).toBe(true);
  });

  it("flags Amara's lignocaine alert", () => {
    const state = buildSeedState();
    const amara = Object.values(state.patients).find((p) => p.givenName === "Amara")!;
    expect(amara.alert).toMatch(/lignocaine/i);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- seed`
Expected: FAIL — `accounts` / `seed` modules not found.

- [ ] **Step 3: Implement `src/lib/demo/accounts.ts`**

```ts
// Port of SessionState.demoAccounts + the Lumière clinic ref.
import type { ClinicRef, Identity, UserRef } from "./types";

export const LUMIERE: ClinicRef = { id: "clinic-lumiere", name: "Lumière Clinic" };

const sarah: UserRef = { id: "u-sarah", name: "Sarah Chen" };
const ruby: UserRef = { id: "u-ruby", name: "Ruby Walsh" };
const voss: UserRef = { id: "u-voss", name: "Dr Elena Voss" };
const ava: UserRef = { id: "u-ava", name: "Ava Lim" };

export interface DemoAccount {
  label: string;
  /** Identities the account can act as; the first is the default on sign-in. */
  identities: Identity[];
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    label: "Sarah Chen — Nurse",
    identities: [
      { user: sarah, role: "nurse", context: { kind: "independent" } },
      { user: sarah, role: "nurse", context: { kind: "clinic", clinic: LUMIERE } },
    ],
  },
  {
    label: "Ruby Walsh — Nurse",
    identities: [{ user: ruby, role: "nurse", context: { kind: "clinic", clinic: LUMIERE } }],
  },
  {
    label: "Dr Elena Voss — Doctor",
    identities: [{ user: voss, role: "doctor", context: { kind: "independent" } }],
  },
  {
    label: "Ava Lim — Clinic Admin",
    identities: [{ user: ava, role: "clinicAdmin", context: { kind: "clinic", clinic: LUMIERE } }],
  },
];
```

- [ ] **Step 4: Implement `src/lib/demo/seed.ts`**

```ts
// Port of SessionState.demoBackend — the same demo data the iOS app seeds.
// Built by replaying domain operations so seeded state obeys the same rules.
import type { DemoState, Identity, MedicationItem, Patient } from "./types";
import { LUMIERE, DEMO_ACCOUNTS } from "./accounts";
import {
  emptyState,
  submitRequest,
  approveRequest,
  saveTreatmentNote,
  saveGeneralNote,
} from "./backend";

// Fixed demo "today" so seeded appointments and expiries are deterministic.
export const SEED_NOW = Date.UTC(2026, 5, 26, 0, 0, 0);
const TODAY_ISO = "2026-06-26";

const sarahIndependent: Identity = DEMO_ACCOUNTS[0].identities[0];
const sarahClinic: Identity = DEMO_ACCOUNTS[0].identities[1];
const voss: Identity = DEMO_ACCOUNTS[2].identities[0];

let seq = 0;
function pid(): string {
  seq += 1;
  return `p-${seq}`;
}

function makePatient(
  given: string,
  last: string,
  dob: { year: number; month: number; day: number },
  phone: string,
  allergies: string,
  meds: string,
  owner: Patient["owner"],
  preferred?: string,
  alert?: string,
): Patient {
  return {
    id: pid(),
    givenName: given,
    lastName: last,
    dateOfBirth: dob,
    gender: "Female",
    address: "7/22 Fitzroy St, St Kilda VIC 3182",
    phone,
    email: `${given.toLowerCase()}@example.com`,
    allergies,
    currentMedications: meds,
    owner,
    prescribingDoctorIDs: [],
    preferredName: preferred,
    alert,
  };
}

const letybo: MedicationItem = {
  name: "Letybo",
  dosage: "16",
  category: "neurotoxin",
  unit: "units",
  areas: ["Forehead", "Glabella"],
  timing: "PRN monthly, max 6 treatments yearly (6 months in NSW)",
};
const voluma: MedicationItem = {
  name: "Voluma",
  dosage: "2",
  category: "haFiller",
  brand: "Juvederm",
  unit: "millilitres",
  areas: ["Cheek", "Chin"],
};
const profhilo: MedicationItem = {
  name: "Profhilo",
  dosage: "2",
  category: "skinBooster",
  unit: "millilitres",
  areas: ["Full Face"],
};

export function buildSeedState(): DemoState {
  seq = 0;
  let state = emptyState();

  // Amara 'Mara' Boyd — clinic patient, full workflow + lignocaine alert.
  const amara = makePatient(
    "Amara", "Boyd", { year: 1991, month: 3, day: 12 }, "0401 223 871",
    "Lidocaine, Penicillin", "Levothyroxine 75µg daily",
    { kind: "clinic", id: LUMIERE.id }, "Mara",
    "Anaphylaxis to lignocaine — confirm anaesthetic-free product before any treatment.",
  );
  state = { ...state, patients: { ...state.patients, [amara.id]: amara } };

  const amaraReq = submitRequest(
    state, { patientID: amara.id, doctorID: "u-voss", items: [letybo, voluma], identity: sarahClinic }, SEED_NOW,
  );
  state = amaraReq.state;
  const amaraApproved = approveRequest(state, amaraReq.request.id, voss, SEED_NOW);
  state = amaraApproved.state;
  state = saveTreatmentNote(
    state,
    {
      patientID: amara.id,
      tickedIDs: [amaraApproved.granted[0].id],
      title: "Antiwrinkle — forehead & glabella, 16U",
      body: "Glabella 5-point pattern, frontalis 6-point. Tolerated well, ice applied.",
      medications: [{ name: "Letybo", batch: "C4815-A", expiry: "03/27", dosage: "16U" }],
      identity: sarahClinic,
    },
    SEED_NOW,
  ).state;
  state = saveGeneralNote(
    state,
    { patientID: amara.id, title: "", body: "Pt called re: mild bruising day 2, advised arnica and warm compress from day 3.", identity: sarahClinic },
    SEED_NOW,
  ).state;

  // Claire 'Coco' Donovan — Sarah's independent patient, pending Profhilo request.
  const claire = makePatient(
    "Claire", "Donovan", { year: 1987, month: 7, day: 4 }, "0432 901 343",
    "NKDA", "Nil", { kind: "nurse", id: "u-sarah" }, "Coco",
  );
  state = { ...state, patients: { ...state.patients, [claire.id]: claire } };
  state = submitRequest(
    state, { patientID: claire.id, doctorID: "u-voss", items: [profhilo], identity: sarahIndependent }, SEED_NOW,
  ).state;

  // Grace Huang — Dr Voss's private patient.
  const grace = makePatient(
    "Grace", "Huang", { year: 1979, month: 1, day: 17 }, "0488 130 224",
    "NKDA", "Perindopril 5mg", { kind: "doctor", id: "u-voss" },
  );
  state = { ...state, patients: { ...state.patients, [grace.id]: grace } };

  // Seeded appointments for today (clinic + doctor calendars).
  const appts = [
    { id: "appt-1", type: "authSlot" as const, ownerID: "u-voss", dateISO: TODAY_ISO, startMinute: 540, endMinute: 570, status: "confirmed" as const, patientID: amara.id, patientName: "Mara Boyd", appointmentNote: "Antiwrinkle" },
    { id: "appt-2", type: "treatment" as const, ownerID: "u-voss", dateISO: TODAY_ISO, startMinute: 600, endMinute: 630, status: "confirmed" as const, patientID: claire.id, patientName: "Coco Donovan", appointmentNote: "HA filler review" },
    { id: "appt-3", type: "treatment" as const, ownerID: LUMIERE.id, dateISO: TODAY_ISO, startMinute: 570, endMinute: 615, status: "confirmed" as const, patientID: amara.id, patientName: "Mara Boyd", appointmentNote: "Antiwrinkle review" },
    { id: "appt-4", type: "treatment" as const, ownerID: LUMIERE.id, dateISO: TODAY_ISO, startMinute: 630, endMinute: 660, status: "completed" as const, patientID: claire.id, patientName: "Coco Donovan", appointmentNote: "Profhilo" },
    { id: "appt-5", type: "treatment" as const, ownerID: LUMIERE.id, dateISO: TODAY_ISO, startMinute: 720, endMinute: 780, status: "confirmed" as const, appointmentNote: "Lunch — clinic closed" },
  ];
  const appointments = { ...state.appointments };
  for (const a of appts) appointments[a.id] = a;
  state = { ...state, appointments };

  return state;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- seed`
Expected: PASS — all `seed` tests green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/demo/accounts.ts src/lib/demo/seed.ts src/lib/demo/__tests__/seed.test.ts
git commit -m "feat: add demo accounts + seed ported from SessionState.demoBackend (TDD)"
```

---

## Task 5: Auth + store React contexts

**Files:**
- Create: `src/lib/demo/auth.tsx`
- Create: `src/lib/demo/store.tsx`
- Test: `src/lib/demo/__tests__/store.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/lib/demo/__tests__/store.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { DemoStoreProvider, useDemoStore } from "@/lib/demo/store";
import { DEMO_ACCOUNTS } from "@/lib/demo/accounts";

function wrapper({ children }: { children: ReactNode }) {
  return <DemoStoreProvider>{children}</DemoStoreProvider>;
}

describe("useDemoStore", () => {
  it("starts from the seed and approves a pending request", () => {
    const { result } = renderHook(() => useDemoStore(), { wrapper });
    const voss = DEMO_ACCOUNTS[2].identities[0];

    const pending = result.current.pendingRequestsForDoctor("u-voss");
    expect(pending.length).toBeGreaterThanOrEqual(1);

    act(() => {
      result.current.approveRequest(pending[0].id, voss);
    });

    expect(result.current.pendingRequestsForDoctor("u-voss").length).toBe(pending.length - 1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- store`
Expected: FAIL — `store` module not found.

- [ ] **Step 3: Implement `src/lib/demo/auth.tsx`**

```tsx
"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { Identity } from "./types";
import { DEMO_ACCOUNTS } from "./accounts";

interface AuthValue {
  identity: Identity | null;
  signIn: (identity: Identity) => void;
  signOut: () => void;
  accounts: typeof DEMO_ACCOUNTS;
}

const AuthContext = createContext<AuthValue | null>(null);

export function DemoAuthProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const value = useMemo<AuthValue>(
    () => ({
      identity,
      signIn: setIdentity,
      signOut: () => setIdentity(null),
      accounts: DEMO_ACCOUNTS,
    }),
    [identity],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useDemoAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useDemoAuth must be used within DemoAuthProvider");
  return ctx;
}
```

- [ ] **Step 4: Implement `src/lib/demo/store.tsx`**

```tsx
"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { DemoState, Identity, MedicationItem, TreatmentMedication } from "./types";
import { buildSeedState } from "./seed";
import * as backend from "./backend";

interface StoreValue {
  state: DemoState;
  now: number;
  // Reads
  searchPatients: (query: string, identity: Identity) => ReturnType<typeof backend.searchPatients>;
  notesForPatient: (patientID: string) => ReturnType<typeof backend.notesForPatient>;
  activeAuthorisations: (patientID: string) => ReturnType<typeof backend.activeAuthorisations>;
  pendingRequestsForDoctor: (doctorID: string) => ReturnType<typeof backend.pendingRequestsForDoctor>;
  openRequestsForPatient: (patientID: string, nurseID: string) => ReturnType<typeof backend.openRequestsForPatient>;
  // Writes
  submitRequest: (input: { patientID: string; doctorID: string; items: MedicationItem[]; identity: Identity }) => void;
  approveRequest: (requestID: string, identity: Identity) => void;
  requireEdit: (requestID: string, identity: Identity) => void;
  saveGeneralNote: (input: { patientID: string; title: string; body: string; identity: Identity }) => void;
  saveTreatmentNote: (input: { patientID: string; tickedIDs: string[]; title: string; body: string; medications: TreatmentMedication[]; identity: Identity }) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function DemoStoreProvider({ children }: { children: ReactNode }) {
  // Built once per mount; a hard reload remounts and resets to the seed.
  const [state, setState] = useState<DemoState>(() => buildSeedState());
  const now = Date.UTC(2026, 5, 26); // SEED_NOW — keeps seeded expiries "active"

  const value = useMemo<StoreValue>(
    () => ({
      state,
      now,
      searchPatients: (query, identity) => backend.searchPatients(state, query, identity),
      notesForPatient: (patientID) => backend.notesForPatient(state, patientID),
      activeAuthorisations: (patientID) => backend.activeAuthorisations(state, patientID, now),
      pendingRequestsForDoctor: (doctorID) => backend.pendingRequestsForDoctor(state, doctorID),
      openRequestsForPatient: (patientID, nurseID) => backend.openRequestsForPatient(state, patientID, nurseID),
      submitRequest: (input) => setState((s) => backend.submitRequest(s, input, now).state),
      approveRequest: (requestID, identity) => setState((s) => backend.approveRequest(s, requestID, identity, now).state),
      requireEdit: (requestID, identity) => setState((s) => backend.requireEdit(s, requestID, identity)),
      saveGeneralNote: (input) => setState((s) => backend.saveGeneralNote(s, input, now).state),
      saveTreatmentNote: (input) => setState((s) => backend.saveTreatmentNote(s, input, now).state),
    }),
    [state, now],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useDemoStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useDemoStore must be used within DemoStoreProvider");
  return ctx;
}
```

> Note: `now` is fixed to `SEED_NOW` (2026-06-26) so seeded authorisation expiries and "active" checks line up with the demo data. The seed builds with the same constant, so seeded authorisations read as active.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- store`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/demo/auth.tsx src/lib/demo/store.tsx src/lib/demo/__tests__/store.test.tsx
git commit -m "feat: add demo auth + in-memory store contexts"
```

---

## Task 6: Shared app chrome — role tint + nav

**Files:**
- Create: `src/lib/demo/tint.ts`
- Create: `src/components/app/AppShell.tsx`

- [ ] **Step 1: Create `src/lib/demo/tint.ts`**

```ts
import type { CSSProperties } from "react";
import type { Identity, Role } from "./types";

// Maps a role to the marketing site's role-tint palette (see RoleTintShowcase).
const ROLE_TINT: Record<Role, { tint: string; soft: string }> = {
  nurse: { tint: "var(--color-rose)", soft: "var(--color-rose-soft)" },
  clinicAdmin: { tint: "var(--color-slate)", soft: "var(--color-slate-soft)" },
  doctor: { tint: "var(--color-umber)", soft: "var(--color-umber-soft)" },
  superAdmin: { tint: "var(--color-sage)", soft: "var(--color-sage-soft)" },
};

export function tintStyle(identity: Identity): CSSProperties {
  // A clinic nurse reads as "sage" to distinguish from independent rose.
  const role = identity.role;
  const base = ROLE_TINT[role];
  if (role === "nurse" && identity.context.kind === "clinic") {
    return { "--color-tint": "var(--color-sage)", "--color-tint-soft": "var(--color-sage-soft)" } as CSSProperties;
  }
  return { "--color-tint": base.tint, "--color-tint-soft": base.soft } as CSSProperties;
}
```

- [ ] **Step 2: Create `src/components/app/AppShell.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useDemoAuth } from "@/lib/demo/auth";
import { identityBadge } from "@/lib/demo/types";
import { tintStyle } from "@/lib/demo/tint";

const NAV = [
  { href: "/app/dashboard", label: "Dashboard" },
  { href: "/app/patients", label: "Patients" },
  { href: "/app/authorisations", label: "Authorisations" },
  { href: "/app/calendar", label: "Calendar" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { identity, signOut } = useDemoAuth();
  const pathname = usePathname();
  if (!identity) return null;

  return (
    <div style={tintStyle(identity)} className="flex min-h-screen flex-col bg-card text-ink">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-field text-card" style={{ background: "var(--color-tint)" }}>
              <span className="font-display text-base">AX</span>
            </span>
            <span className="font-display text-lg">AestheticX</span>
            <span className="micro rounded-full px-2 py-0.5" style={{ background: "var(--color-tint-soft)", color: "var(--color-tint)" }}>
              Demo · resets on refresh
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-ink-soft sm:inline">{identityBadge(identity)}</span>
            <button onClick={signOut} className="rounded-btn border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-tint/50">
              Sign out
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 px-5 sm:px-8">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`-mb-px border-b-2 px-3 py-2.5 text-sm transition-colors ${
                  active ? "border-tint text-ink" : "border-transparent text-ink-soft hover:text-ink"
                }`}
                style={active ? { borderColor: "var(--color-tint)" } : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 sm:px-8">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/demo/tint.ts src/components/app/AppShell.tsx
git commit -m "feat: add role-tinted app shell chrome"
```

---

## Task 7: `(app)` layout with providers + auth guard

**Files:**
- Create: `src/app/(app)/layout.tsx`
- Create: `src/components/app/AuthGuard.tsx`
- Test: `src/components/app/__tests__/AuthGuard.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/app/__tests__/AuthGuard.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

import { DemoAuthProvider, useDemoAuth } from "@/lib/demo/auth";
import { AuthGuard } from "@/components/app/AuthGuard";

function SignedOut() {
  return (
    <DemoAuthProvider>
      <AuthGuard>
        <div>secret</div>
      </AuthGuard>
    </DemoAuthProvider>
  );
}

describe("AuthGuard", () => {
  it("redirects to /login when there is no identity", () => {
    render(<SignedOut />);
    expect(replace).toHaveBeenCalledWith("/login");
    expect(screen.queryByText("secret")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- AuthGuard`
Expected: FAIL — `AuthGuard` module not found.

- [ ] **Step 3: Implement `src/components/app/AuthGuard.tsx`**

```tsx
"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useDemoAuth } from "@/lib/demo/auth";

export function AuthGuard({ children }: { children: ReactNode }) {
  const { identity } = useDemoAuth();
  const router = useRouter();

  useEffect(() => {
    if (!identity) router.replace("/login");
  }, [identity, router]);

  if (!identity) return null;
  return <>{children}</>;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- AuthGuard`
Expected: PASS.

- [ ] **Step 5: Mount `DemoAuthProvider` at the root so `/login` and `/app` share one in-memory session**

Edit `src/app/layout.tsx`. Add the import near the top:
```tsx
import { DemoAuthProvider } from "@/lib/demo/auth";
```
Find the `<body ...>` JSX that renders `{children}` (alongside `<Analytics />` / `<SpeedInsights />`) and wrap only the children:
```tsx
<DemoAuthProvider>{children}</DemoAuthProvider>
```
Keep `<Analytics />` and `<SpeedInsights />` exactly where they are. Auth now lives above both the
login page and the `(app)` group, so signing in on `/login` is visible to the guard in `/app`.

- [ ] **Step 6: Implement `src/app/(app)/layout.tsx`** (store + guard + shell; auth comes from the root)

```tsx
import type { ReactNode } from "react";
import { DemoStoreProvider } from "@/lib/demo/store";
import { AuthGuard } from "@/components/app/AuthGuard";
import { AppShell } from "@/components/app/AppShell";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <DemoStoreProvider>
      <AuthGuard>
        <AppShell>{children}</AppShell>
      </AuthGuard>
    </DemoStoreProvider>
  );
}
```

- [ ] **Step 7: Type-check + run tests**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/app/layout.tsx "src/app/(app)/layout.tsx" src/components/app/AuthGuard.tsx src/components/app/__tests__/AuthGuard.test.tsx
git commit -m "feat: add (app) layout, root auth provider, and auth guard"
```

---

## Task 8: Login page

**Files:**
- Create: `src/app/login/page.tsx`
- Create: `src/components/app/LoginForm.tsx`

- [ ] **Step 1: Implement `src/components/app/LoginForm.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDemoAuth } from "@/lib/demo/auth";
import { identityBadge } from "@/lib/demo/types";

export function LoginForm() {
  const { accounts, signIn } = useDemoAuth();
  const router = useRouter();
  const [selected, setSelected] = useState(0);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const account = accounts[selected];
    signIn(account.identities[0]); // first identity is the default
    router.push("/app/dashboard");
  }

  return (
    <form onSubmit={submit} className="w-full max-w-md rounded-card border border-line bg-card p-7 shadow-card">
      <p className="kicker">Demo sign-in</p>
      <h1 className="mt-3 font-display text-2xl text-ink">Choose a role to explore AestheticX</h1>
      <p className="mt-2 text-sm text-ink-soft">
        This is an interactive demo using the same sample data as the iOS app. Pick an account — the
        whole app re-tints to that identity. Data resets on refresh.
      </p>

      <fieldset className="mt-6 flex flex-col gap-2.5">
        {accounts.map((account, i) => {
          const checked = i === selected;
          return (
            <label
              key={account.label}
              className={`flex cursor-pointer items-center gap-3 rounded-inner border px-4 py-3 transition-colors ${
                checked ? "border-tint" : "border-line hover:border-tint/50"
              }`}
              style={checked ? { boxShadow: "0 0 0 3px var(--color-tint-soft)" } : undefined}
            >
              <input
                type="radio"
                name="account"
                className="sr-only"
                checked={checked}
                onChange={() => setSelected(i)}
              />
              <span className="min-w-0">
                <span className="block font-medium text-ink">{account.label}</span>
                <span className="block truncate text-sm text-ink-soft">{identityBadge(account.identities[0])}</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      <label className="mt-5 block">
        <span className="micro">Password (any value works in the demo)</span>
        <input
          type="password"
          defaultValue="demo"
          className="mt-1.5 w-full rounded-field border border-line bg-card px-3 py-2 text-ink outline-none focus:border-tint"
        />
      </label>

      <button
        type="submit"
        className="mt-6 w-full rounded-btn px-4 py-3 text-center text-sm font-medium text-card transition-colors"
        style={{ background: "var(--color-tint)" }}
      >
        Enter the demo
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Implement `src/app/login/page.tsx`**

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/app/LoginForm";

export const metadata: Metadata = {
  title: "Log in",
  description: "Sign in to the AestheticX interactive demo.",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-card px-5 py-16">
      <Link href="/" className="font-display text-lg text-ink-soft hover:text-ink">
        ← AestheticX
      </Link>
      <LoginForm />
    </main>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/login/page.tsx src/components/app/LoginForm.tsx
git commit -m "feat: add demo login page with preset role accounts"
```

---

## Task 9: Dashboard page

**Files:**
- Create: `src/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Implement `src/app/(app)/dashboard/page.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";

export default function DashboardPage() {
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  if (!identity) return null;

  const patients = store.searchPatients("", identity);
  const pending =
    identity.role === "doctor" ? store.pendingRequestsForDoctor(identity.user.id) : [];

  return (
    <div>
      <p className="kicker">Signed in</p>
      <h1 className="mt-2 font-display text-3xl text-ink">Welcome, {identity.user.name}</h1>
      <p className="mt-2 text-ink-soft">
        Acting as {identity.role === "clinicAdmin" ? "clinic admin" : identity.role}
        {identity.context.kind === "clinic" ? ` · ${identity.context.clinic.name}` : " · independent"}.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Link href="/app/patients" className="rounded-card border border-line bg-card p-6 shadow-card transition-colors hover:border-tint/50">
          <p className="font-display text-3xl text-ink">{patients.length}</p>
          <p className="mt-1 text-sm text-ink-soft">Patients you can see</p>
        </Link>
        {identity.role === "doctor" && (
          <Link href="/app/authorisations" className="rounded-card border border-line bg-card p-6 shadow-card transition-colors hover:border-tint/50">
            <p className="font-display text-3xl text-ink">{pending.length}</p>
            <p className="mt-1 text-sm text-ink-soft">Requests awaiting your review</p>
          </Link>
        )}
        <Link href="/app/calendar" className="rounded-card border border-line bg-card p-6 shadow-card transition-colors hover:border-tint/50">
          <p className="font-display text-3xl text-ink">Today</p>
          <p className="mt-1 text-sm text-ink-soft">Open the calendar</p>
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit
git add "src/app/(app)/dashboard/page.tsx"
git commit -m "feat: add demo dashboard page"
```

---

## Task 10: Patients list + search

**Files:**
- Create: `src/app/(app)/patients/page.tsx`

- [ ] **Step 1: Implement `src/app/(app)/patients/page.tsx`**

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { calendarName, displayName, hasAlert } from "@/lib/demo/types";

export default function PatientsPage() {
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  const [query, setQuery] = useState("");
  if (!identity) return null;

  const results = store.searchPatients(query, identity);

  return (
    <div>
      <h1 className="font-display text-3xl text-ink">Patients</h1>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name, date of birth (dd/mm/yyyy), or phone"
        className="mt-5 w-full rounded-field border border-line bg-card px-4 py-2.5 text-ink outline-none focus:border-tint"
      />

      <ul className="mt-5 divide-y divide-line overflow-hidden rounded-card border border-line">
        {results.map((p) => (
          <li key={p.id}>
            <Link href={`/app/patients/${p.id}`} className="flex items-center justify-between gap-4 bg-card px-5 py-4 transition-colors hover:bg-line-soft">
              <span className="min-w-0">
                <span className="block font-medium text-ink">{displayName(p)}</span>
                <span className="block truncate text-sm text-ink-soft">
                  {p.dateOfBirth.day}/{p.dateOfBirth.month}/{p.dateOfBirth.year} · {p.phone}
                </span>
              </span>
              {hasAlert(p) && (
                <span className="micro flex-none rounded-full px-2 py-0.5" style={{ background: "var(--color-rose-soft)", color: "var(--color-rose)" }}>
                  Alert
                </span>
              )}
            </Link>
          </li>
        ))}
        {results.length === 0 && <li className="bg-card px-5 py-6 text-center text-sm text-ink-soft">No patients match.</li>}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit
git add "src/app/(app)/patients/page.tsx"
git commit -m "feat: add patients list with search"
```

---

## Task 11: Patient file (notes stream, active auths, raise request, add note)

**Files:**
- Create: `src/app/(app)/patients/[id]/page.tsx`

- [ ] **Step 1: Implement `src/app/(app)/patients/[id]/page.tsx`**

```tsx
"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { patientPermissions } from "@/lib/demo/backend";
import { displayName, fullName, hasAlert } from "@/lib/demo/types";

export default function PatientFilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  const [noteBody, setNoteBody] = useState("");
  if (!identity) return null;

  const patient = store.state.patients[id];
  if (!patient || !patientPermissions(identity, patient).canView) {
    return <p className="text-ink-soft">This patient is not in your view.</p>;
  }
  const perms = patientPermissions(identity, patient);
  const notes = store.notesForPatient(id);
  const active = store.activeAuthorisations(id);

  function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteBody.trim()) return;
    store.saveGeneralNote({ patientID: id, title: "", body: noteBody.trim(), identity: identity! });
    setNoteBody("");
  }

  function raiseRequest() {
    // Demo: raise a request to Dr Voss for the first active medication area.
    store.submitRequest({
      patientID: id,
      doctorID: "u-voss",
      items: [{ name: "Profhilo", dosage: "2", category: "skinBooster", unit: "millilitres", areas: ["Full Face"] }],
      identity: identity!,
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
      <div>
        <Link href="/app/patients" className="text-sm text-ink-soft hover:text-ink">← All patients</Link>
        <h1 className="mt-3 font-display text-3xl text-ink">{displayName(patient)}</h1>
        <p className="mt-1 text-ink-soft">
          {patient.dateOfBirth.day}/{patient.dateOfBirth.month}/{patient.dateOfBirth.year} · {patient.gender} · {patient.phone}
        </p>

        {hasAlert(patient) && (
          <div className="mt-4 rounded-inner border-l-4 px-4 py-3" style={{ borderColor: "var(--color-rose)", background: "var(--color-rose-soft)" }}>
            <p className="micro" style={{ color: "var(--color-rose)" }}>Alert</p>
            <p className="mt-1 text-sm text-ink">{patient.alert}</p>
          </div>
        )}

        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <div><dt className="micro">Allergies</dt><dd className="mt-0.5 text-ink">{patient.allergies}</dd></div>
          <div><dt className="micro">Medications</dt><dd className="mt-0.5 text-ink">{patient.currentMedications}</dd></div>
        </dl>

        <h2 className="mt-8 font-display text-xl text-ink">Notes</h2>
        {perms.canWriteGeneralNote && (
          <form onSubmit={addNote} className="mt-3">
            <textarea
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              placeholder="Add a note…"
              rows={2}
              className="w-full rounded-inner border border-line bg-card px-3 py-2 text-ink outline-none focus:border-tint"
            />
            <button type="submit" className="mt-2 rounded-btn px-4 py-2 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>
              Save note
            </button>
          </form>
        )}
        <ul className="mt-4 flex flex-col gap-3">
          {notes.map((n) => (
            <li key={n.id} className="rounded-inner border border-line bg-card px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="micro">{n.kind}</span>
                <span className="micro">{n.authorBadge}</span>
              </div>
              {n.title && <p className="mt-1 font-medium text-ink">{n.title}</p>}
              <p className="mt-1 text-sm text-ink-soft">{n.body}</p>
            </li>
          ))}
          {notes.length === 0 && <li className="text-sm text-ink-soft">No notes yet.</li>}
        </ul>
      </div>

      <aside>
        <div className="rounded-card border border-line bg-card p-5 shadow-card" style={{ borderColor: "var(--color-tint)" }}>
          <h2 className="font-display text-lg text-ink">Active authorisations</h2>
          <ul className="mt-3 flex flex-col gap-3">
            {active.map((a) => (
              <li key={a.id}>
                <p className="font-medium text-ink">{a.medication.name}</p>
                <p className="text-sm text-ink-soft">{a.medication.areas.join(", ")}</p>
                <p className="mt-1 flex gap-1" aria-label={`${a.repeatsRemaining} repeats remaining`}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span key={i} className="h-2 w-2 rounded-full" style={{ background: i < a.repeatsRemaining ? "var(--color-tint)" : "var(--color-line)" }} />
                  ))}
                </p>
              </li>
            ))}
            {active.length === 0 && <li className="text-sm text-ink-soft">None active.</li>}
          </ul>

          {identity.role === "nurse" && (
            <button onClick={raiseRequest} className="mt-4 w-full rounded-btn border border-line px-4 py-2 text-sm text-ink hover:border-tint">
              Raise authorisation request → Dr Voss
            </button>
          )}
        </div>
        <p className="mt-3 text-xs text-ink-faint">Formal name on documents: {fullName(patient)}</p>
      </aside>
    </div>
  );
}
```

> Note: `use(params)` unwraps the async route params (Next 16 passes `params` as a Promise — see Task reference in `node_modules/next/dist/docs/01-app/.../05-server-and-client-components.md`). `React.use` is valid in client components.

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit
git add "src/app/(app)/patients/[id]/page.tsx"
git commit -m "feat: add patient file with notes, active auths, and raise-request"
```

---

## Task 12: Authorisations page (doctor inbox + nurse open requests)

**Files:**
- Create: `src/app/(app)/authorisations/page.tsx`

- [ ] **Step 1: Implement `src/app/(app)/authorisations/page.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";

export default function AuthorisationsPage() {
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  if (!identity) return null;

  if (identity.role === "doctor") {
    const pending = store.pendingRequestsForDoctor(identity.user.id);
    return (
      <div>
        <h1 className="font-display text-3xl text-ink">Review requests</h1>
        <p className="mt-2 text-ink-soft">Approve to issue per-medication authorisations (5 repeats, 6-month expiry), or send back for edits. There is no flat reject.</p>
        <ul className="mt-6 flex flex-col gap-4">
          {pending.map((r) => (
            <li key={r.id} className="rounded-card border border-line bg-card p-5 shadow-card">
              <div className="rounded-inner p-4" style={{ background: "var(--color-umber-soft)" }}>
                <p className="micro">Patient</p>
                <p className="font-medium text-ink">{r.patientSummary?.fullName}</p>
                <p className="text-sm text-ink-soft">Allergies: {r.patientSummary?.allergies}</p>
              </div>
              <ul className="mt-3 flex flex-col gap-1 text-sm text-ink">
                {r.items.map((it, i) => (
                  <li key={i}>{it.name} · {it.dosage} {it.unit} · {it.areas.join(", ")}</li>
                ))}
              </ul>
              <div className="mt-4 flex gap-3">
                <button onClick={() => store.approveRequest(r.id, identity)} className="rounded-btn px-4 py-2 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>
                  Approve
                </button>
                <button onClick={() => store.requireEdit(r.id, identity)} className="rounded-btn border border-line px-4 py-2 text-sm text-ink-soft hover:border-tint">
                  Require edit
                </button>
              </div>
            </li>
          ))}
          {pending.length === 0 && <li className="text-sm text-ink-soft">No pending requests. Sign in as Sarah Chen to raise one.</li>}
        </ul>
      </div>
    );
  }

  // Nurse / admin view: surface own open requests across visible patients.
  const patients = store.searchPatients("", identity);
  const rows = patients.flatMap((p) =>
    store.openRequestsForPatient(p.id, identity.user.id).map((r) => ({ patient: p, request: r })),
  );

  return (
    <div>
      <h1 className="font-display text-3xl text-ink">Your authorisation requests</h1>
      <ul className="mt-6 flex flex-col gap-3">
        {rows.map(({ patient, request }) => (
          <li key={request.id} className="flex items-center justify-between rounded-inner border border-line bg-card px-5 py-4">
            <span>
              <Link href={`/app/patients/${patient.id}`} className="font-medium text-ink hover:underline">{patient.givenName} {patient.lastName}</Link>
              <span className="block text-sm text-ink-soft">{request.items.map((i) => i.name).join(", ")}</span>
            </span>
            <span className="micro rounded-full px-2 py-0.5" style={{ background: "var(--color-tint-soft)", color: "var(--color-tint)" }}>
              {request.status === "needsEdit" ? "Needs edit" : "Pending"}
            </span>
          </li>
        ))}
        {rows.length === 0 && <li className="text-sm text-ink-soft">No open requests. Open a patient file to raise one.</li>}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit
git add "src/app/(app)/authorisations/page.tsx"
git commit -m "feat: add authorisations review inbox + nurse request list"
```

---

## Task 13: Calendar page

**Files:**
- Create: `src/app/(app)/calendar/page.tsx`

- [ ] **Step 1: Implement `src/app/(app)/calendar/page.tsx`**

```tsx
"use client";

import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import type { Appointment } from "@/lib/demo/types";

function timeLabel(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export default function CalendarPage() {
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  if (!identity) return null;

  // Show the calendar for the identity's owner scope (clinic or self).
  const ownerID = identity.context.kind === "clinic" ? identity.context.clinic.id : identity.user.id;
  const appts = Object.values(store.state.appointments)
    .filter((a: Appointment) => a.ownerID === ownerID)
    .sort((a, b) => a.startMinute - b.startMinute);

  return (
    <div>
      <h1 className="font-display text-3xl text-ink">Calendar · Today</h1>
      <p className="mt-2 text-ink-soft">
        {identity.context.kind === "clinic" ? identity.context.clinic.name : identity.user.name}
      </p>

      <ul className="mt-6 flex flex-col gap-2">
        {appts.map((a) => (
          <li key={a.id} className="flex items-stretch gap-4 rounded-inner border border-line bg-card px-4 py-3">
            <span className="w-28 flex-none text-sm text-ink-soft">
              {timeLabel(a.startMinute)}–{timeLabel(a.endMinute)}
            </span>
            <span className="min-w-0 border-l-2 pl-4" style={{ borderColor: "var(--color-tint)" }}>
              <span className="block font-medium text-ink">{a.patientName ?? "Blocked time"}</span>
              {a.appointmentNote && <span className="block text-sm text-ink-soft">{a.appointmentNote}</span>}
            </span>
            <span className="micro ml-auto self-center">{a.status}</span>
          </li>
        ))}
        {appts.length === 0 && <li className="text-sm text-ink-soft">No appointments today.</li>}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit
git add "src/app/(app)/calendar/page.tsx"
git commit -m "feat: add calendar day view"
```

---

## Task 14: Marketing site "Log in" link

**Files:**
- Modify: `src/lib/site.ts`
- Modify: `src/components/SiteNav.tsx` (add a visible Log in CTA if the nav doesn't already render `NAV_LINKS` with the new entry)

- [ ] **Step 1: Read `src/components/SiteNav.tsx`**

Run: open `src/components/SiteNav.tsx` and confirm how it renders `NAV_LINKS` (so the new link gets a button/CTA treatment, not just a plain nav item).

- [ ] **Step 2: Add the Log in link to `src/lib/site.ts`**

Append to the `NAV_LINKS` array (after the FAQ entry):
```ts
  { href: "/login", label: "Log in" },
```

- [ ] **Step 3: Give the Log in link a CTA treatment in `SiteNav.tsx`**

In `src/components/SiteNav.tsx`, when mapping `NAV_LINKS`, special-case `href === "/login"` to render a tinted button. Exact change depends on the current JSX; the pattern is:
```tsx
{NAV_LINKS.map((link) =>
  link.href === "/login" ? (
    <Link
      key={link.href}
      href={link.href}
      className="rounded-btn px-4 py-2 text-sm font-medium text-card"
      style={{ background: "var(--color-umber)" }}
    >
      {link.label}
    </Link>
  ) : (
    // ...existing rendering for normal nav links (unchanged)
  ),
)}
```

- [ ] **Step 4: Type-check + commit**

```bash
npx tsc --noEmit
git add src/lib/site.ts src/components/SiteNav.tsx
git commit -m "feat: add Log in link to marketing nav"
```

---

## Task 15: Full verification gate

**Files:** none (verification only).

- [ ] **Step 1: Lint**

Run: `npm run lint`
Expected: no errors (fix any reported in the new files).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Unit tests**

Run: `npm test`
Expected: all suites pass (backend, seed, store, AuthGuard, smoke).

- [ ] **Step 4: Production build**

Run: `npm run build`
Expected: build succeeds; `/login` and `/app/*` routes compile.

- [ ] **Step 5: Live smoke test (preview tools)**

Start the dev server and verify, in order:
1. `/` shows the new **Log in** button in the nav.
2. `/login` lists Sarah Chen / Ruby Walsh / Dr Elena Voss / Ava Lim; submitting as **Sarah Chen** lands on `/app/dashboard`, tinted rose.
3. `/app/patients` lists Amara 'Mara' Boyd, Claire 'Coco' Donovan; search "donovan" filters; Amara shows an **Alert** chip.
4. Amara's file shows the lignocaine alert, the active Letybo authorisation with **4/5** repeat dots, and the seeded notes. Adding a note appends it.
5. Sign out → sign in as **Dr Elena Voss** (tint umber) → `/app/authorisations` shows Claire's pending **Profhilo** request → **Approve** removes it from the inbox.
6. Hard-refresh `/app/dashboard` → redirected to `/login` (state reset confirms in-memory behaviour).

Capture a screenshot of the patient file for the PR.

- [ ] **Step 6: Final commit (if any verification fixes were needed)**

```bash
git add -A
git commit -m "fix: verification fixes for demo app"
```

---

## Self-Review Notes

- **Spec coverage:** login (T8) ✓; preset role accounts + tinting (T6/T8) ✓; in-memory reset (T5/T7) ✓; patients + search (T10) ✓; patient file + notes + active auths (T11) ✓; nurse→doctor authorisation handoff incl. no-flat-reject (T11/T12, rules in T3) ✓; calendar (T13) ✓; same iOS seed/shape (T2/T4) ✓; marketing Log in link (T14) ✓; tests + build gate (T1/T15) ✓.
- **Out of scope (per spec):** consent e-signing, prescribing catalog, billing PDFs, email, file upload, video, real backend — intentionally not tasked.
- **Type consistency:** `DemoState`, `Identity`, `Authorisation`, store method names (`approveRequest`, `submitRequest`, `saveTreatmentNote`, `activeAuthorisations`, `pendingRequestsForDoctor`, `openRequestsForPatient`) are defined in T2/T3/T5 and used identically in T9–T13.
- **Known follow-ups for execution:** confirm `SiteNav.tsx`'s exact JSX before editing (T14 Step 1); verify Next 16 `params` Promise handling compiles in T11 (`React.use`).

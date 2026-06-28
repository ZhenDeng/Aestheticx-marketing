# Firebase Backend (Increment 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing demo screens work against the production Firebase project `aestheticx-91e6b` — real Firebase Auth, Firestore reads via the deployed security rules, and core-loop writes (raise/approve/require-edit/notes) mirrored to Firestore + the existing Cloud Functions — gated so the app stays in safe in-memory demo mode unless Firebase is configured and a user is signed in.

**Architecture:** Mirror the iOS `LiveBackend` pattern: a thin Firebase layer (`src/lib/firebase/`) hydrates the existing in-memory store (`src/lib/demo/`) from Firestore at sign-in, serves reads synchronously from that store, and mirrors writes (optimistic-first) to Firestore/Cloud Functions. A runtime **mode flag** (`demo` vs `live`) selects seed-vs-hydrate and no-op-vs-real mirror.

**Tech Stack:** Next.js 16.2.9, React 19, TypeScript 5, Vitest, Firebase Web SDK v11 (modular: `firebase/app`, `firebase/auth`, `firebase/firestore`, `firebase/functions`).

**Source of truth (read-only reference):** `AestheticX/AestheticXKit/Sources/AXData/{LiveBackend,FirebaseAuth}.swift`, `AestheticX/backend/firestore.rules`, `AestheticX/backend/functions/src/index.ts`.

**Pre-flight note (firebase API):** Use the **modular v11** API (`initializeApp`, `getAuth`, `signInWithEmailAndPassword`, `onAuthStateChanged`, `getIdTokenResult`, `getFirestore`, `collection`, `query`, `where`, `getDocs`, `doc`, `getDoc`, `setDoc`, `getFunctions`, `httpsCallable`). If any signature differs in the installed v11, confirm via the firebase docs before adapting — do not fall back to the deprecated namespaced API.

**Existing types (from `src/lib/demo/types.ts`), reused unchanged:** `Role`, `UserRef`, `ClinicRef`, `PracticeContext`, `Identity`, `PatientOwner`, `DateOfBirth`, `MedicationItem`, `Patient`, `RequestStatus`, `PatientSummary`, `AuthorisationRequest`, `Authorisation`, `Note`, `Appointment`, `DemoState`, and helpers `fullName`, `identityBadge`. The store/backend in `src/lib/demo/` already implement the domain rules.

---

## Task 1: Firebase dependency, env template, and client init

**Files:**
- Modify: `package.json` (add `firebase`)
- Create: `.env.example`
- Create: `src/lib/firebase/client.ts`
- Test: `src/lib/firebase/__tests__/client.test.ts`

- [ ] **Step 1: Install firebase**

Run: `npm install firebase@^11`
(If npm errors on cache perms, add `--cache /tmp/.npm-cache`.)
Expected: `firebase` in `dependencies`.

- [ ] **Step 2: Create `.env.example`**

```
# Firebase Web app config for project aestheticx-91e6b (public project identifiers).
# Copy to .env.local and fill with the console's Web app config to enable LIVE mode.
# When ANY of these are empty the app runs in safe in-memory DEMO mode.
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

- [ ] **Step 3: Write the failing test**

Create `src/lib/firebase/__tests__/client.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isFirebaseConfigured, firebaseConfig } from "@/lib/firebase/client";

const KEYS = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
] as const;

describe("isFirebaseConfigured", () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("is false when config is absent", () => {
    expect(isFirebaseConfigured()).toBe(false);
  });

  it("is true only when every key is present", () => {
    for (const k of KEYS) process.env[k] = "x";
    expect(isFirebaseConfigured()).toBe(true);
    expect(firebaseConfig().projectId).toBe("x");
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test -- client`
Expected: FAIL — `@/lib/firebase/client` not found.

- [ ] **Step 5: Implement `src/lib/firebase/client.ts`**

```ts
// Lazy Firebase init. Only touches the SDK when config is present, so DEMO mode
// (no env config) never loads or connects Firebase. Mirrors the iOS LiveBackend's
// "configured account" gate.
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getFunctions, type Functions } from "firebase/functions";

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export function firebaseConfig(): FirebaseConfig {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
  };
}

export function isFirebaseConfigured(): boolean {
  return Object.values(firebaseConfig()).every((v) => v.length > 0);
}

let app: FirebaseApp | undefined;
function getFirebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured()) throw new Error("Firebase is not configured");
  if (!app) app = getApps().length ? getApp() : initializeApp(firebaseConfig());
  return app;
}

export function firebaseAuth(): Auth {
  return getAuth(getFirebaseApp());
}
export function firestore(): Firestore {
  return getFirestore(getFirebaseApp());
}
export function functions(): Functions {
  return getFunctions(getFirebaseApp());
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- client`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json .env.example src/lib/firebase/client.ts src/lib/firebase/__tests__/client.test.ts
git commit -m "feat(firebase): add web SDK, env template, and lazy client init"
```

---

## Task 2: Firestore ↔ domain mappers (TDD)

**Files:**
- Create: `src/lib/firebase/mappers.ts`
- Test: `src/lib/firebase/__tests__/mappers.test.ts`

Pure functions converting Firestore doc data to our TS types (and encoders for writes). Field names are ported verbatim from `LiveBackend.swift`. Firestore timestamps arrive as either a `{ toMillis() }` object or a number; `toMillis()` normalises both.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/firebase/__tests__/mappers.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  mapPatient,
  mapNote,
  mapAuthorisation,
  mapAuthRequest,
  mapAppointment,
  encodeAuthRequest,
  encodeNote,
  parseDob,
  formatDob,
} from "@/lib/firebase/mappers";

describe("parseDob / formatDob", () => {
  it("round-trips yyyy-MM-dd", () => {
    expect(parseDob("1991-03-12")).toEqual({ year: 1991, month: 3, day: 12 });
    expect(formatDob({ year: 1991, month: 3, day: 12 })).toBe("1991-03-12");
  });
  it("handles blank dob", () => {
    expect(parseDob("")).toEqual({ year: 0, month: 0, day: 0 });
  });
});

describe("mapPatient", () => {
  it("maps owner type/id and core fields", () => {
    const p = mapPatient("p1", {
      ownerType: "clinic", ownerId: "clinic-lumiere",
      givenName: "Amara", lastName: "Boyd", dateOfBirth: "1991-03-12",
      gender: "Female", phone: "0401", email: "a@x.com",
      allergies: "Lidocaine", currentMedications: "Levo",
      prescribingDoctorIds: ["u-voss"], alert: "anaphylaxis", preferredName: "Mara",
    });
    expect(p.owner).toEqual({ kind: "clinic", id: "clinic-lumiere" });
    expect(p.fullNameSourceGiven ?? p.givenName).toBe("Amara");
    expect(p.prescribingDoctorIDs).toEqual(["u-voss"]);
    expect(p.preferredName).toBe("Mara");
    expect(p.dateOfBirth).toEqual({ year: 1991, month: 3, day: 12 });
  });
  it("defaults missing owner type to nurse", () => {
    const p = mapPatient("p2", { ownerId: "u-sarah" });
    expect(p.owner).toEqual({ kind: "nurse", id: "u-sarah" });
  });
});

describe("mapAuthorisation", () => {
  it("reads expiresAtMillis and repeatsRemaining", () => {
    const a = mapAuthorisation("a1", {
      requestId: "r1", patientId: "p1", doctorId: "u-voss", nurseId: "u-sarah",
      clinicId: null, repeatsRemaining: 4, expiresAtMillis: 1800000000000,
      medication: { name: "Letybo", dosage: "16", category: "neurotoxin", unit: "units", areas: ["Forehead"] },
    });
    expect(a.repeatsRemaining).toBe(4);
    expect(a.expiresAt).toBe(1800000000000);
    expect(a.medication.name).toBe("Letybo");
    expect(a.clinicID).toBeNull();
  });
});

describe("mapAuthRequest", () => {
  it("maps status, items, nurse, and patient summary", () => {
    const r = mapAuthRequest("r1", {
      patientId: "p1", nurseId: "u-sarah", nurseName: "Sarah Chen", doctorId: "u-voss",
      clinicId: null, status: "pending", createdAt: 1750000000000,
      items: [{ name: "Profhilo", dosage: "2", category: "skinBooster", unit: "millilitres", areas: ["Full Face"] }],
      patientSummary: { name: "Claire Donovan", dateOfBirth: "1987-07-04", allergies: "NKDA", currentMedications: "Nil" },
    });
    expect(r.status).toBe("pending");
    expect(r.nurse).toEqual({ id: "u-sarah", name: "Sarah Chen" });
    expect(r.items[0].name).toBe("Profhilo");
    expect(r.patientSummary?.fullName).toBe("Claire Donovan");
    expect(r.context).toEqual({ kind: "independent" });
  });
});

describe("mapNote", () => {
  it("maps kind/body/author and consumed ids", () => {
    const n = mapNote("n1", "p1", {
      kind: "treatment", title: "T", body: "B", createdAt: 1750000000000,
      authorId: "u-sarah", authorBadge: "Sarah Chen @ Lumière Clinic",
      consumedAuthorisationIds: ["a1"], medications: [{ name: "Letybo", batch: "C1", expiry: "03/27", dosage: "16U" }],
    });
    expect(n.kind).toBe("treatment");
    expect(n.consumedAuthorisationIDs).toEqual(["a1"]);
    expect(n.medications[0].batch).toBe("C1");
  });
});

describe("mapAppointment", () => {
  it("maps authorisation type to authSlot and core fields", () => {
    const a = mapAppointment("ap1", {
      type: "authorisation", ownerId: "u-voss", dateISO: "2026-06-26",
      startMinute: 540, endMinute: 570, status: "confirmed",
      patientId: "p1", patientName: "Mara Boyd", appointmentNote: "Antiwrinkle",
    });
    expect(a.type).toBe("authSlot");
    expect(a.startMinute).toBe(540);
    expect(a.patientName).toBe("Mara Boyd");
  });
});

describe("encoders", () => {
  it("encodeAuthRequest writes Firestore field names", () => {
    const doc = encodeAuthRequest({
      id: "r1", patientID: "p1", nurse: { id: "u-sarah", name: "Sarah Chen" }, doctorID: "u-voss",
      context: { kind: "clinic", clinic: { id: "clinic-lumiere", name: "Lumière Clinic" } },
      items: [{ name: "Profhilo", dosage: "2", category: "skinBooster", unit: "millilitres", areas: ["Full Face"] }],
      status: "pending", createdAt: 1750000000000,
      patientSummary: { fullName: "Claire Donovan", dateOfBirth: { year: 1987, month: 7, day: 4 }, allergies: "NKDA", currentMedications: "Nil" },
    });
    expect(doc.patientId).toBe("p1");
    expect(doc.nurseName).toBe("Sarah Chen");
    expect(doc.clinicId).toBe("clinic-lumiere");
    expect(doc.status).toBe("pending");
    expect((doc.items as unknown[]).length).toBe(1);
  });
  it("encodeNote writes a general note", () => {
    const doc = encodeNote({
      id: "n1", patientID: "p1", kind: "general", title: "", body: "hi", createdAt: 1750000000000,
      authorID: "u-sarah", authorBadge: "Sarah Chen", consumedAuthorisationIDs: [], medications: [],
    });
    expect(doc.kind).toBe("general");
    expect(doc.authorId).toBe("u-sarah");
    expect(doc.body).toBe("hi");
  });
});
```

> Note: the `p.fullNameSourceGiven ?? p.givenName` expression above just asserts `givenName` is `"Amara"` without adding API; keep it as written.

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- mappers`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/firebase/mappers.ts`**

```ts
// Pure Firestore <-> domain mappers. Field names ported verbatim from the iOS
// LiveBackend.swift static decoders/encoders. No Firebase imports here (testable).
import type {
  Appointment, AppointmentType, Authorisation, AuthorisationRequest, DateOfBirth,
  MedicationItem, Note, Patient, PatientOwner, PatientSummary, ProductCategory,
  ProductUnit, RequestStatus, NoteKind, TreatmentMedication,
} from "@/lib/demo/types";

type Doc = Record<string, unknown>;

// Firestore Timestamp | number | undefined -> epoch ms.
function toMillis(v: unknown): number {
  if (v && typeof v === "object" && "toMillis" in v && typeof (v as { toMillis: unknown }).toMillis === "function") {
    return (v as { toMillis: () => number }).toMillis();
  }
  return typeof v === "number" ? v : 0;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function intValue(v: unknown): number {
  return typeof v === "number" ? Math.trunc(v) : 0;
}
function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export function parseDob(s: string): DateOfBirth {
  const parts = s.split("-").map((p) => parseInt(p, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return { year: 0, month: 0, day: 0 };
  return { year: parts[0], month: parts[1], day: parts[2] };
}
export function formatDob(d: DateOfBirth): string {
  const p = (n: number, w: number) => String(n).padStart(w, "0");
  return `${p(d.year, 4)}-${p(d.month, 2)}-${p(d.day, 2)}`;
}

function mapOwner(data: Doc): PatientOwner {
  const id = str(data.ownerId);
  switch (data.ownerType) {
    case "doctor": return { kind: "doctor", id };
    case "clinic": return { kind: "clinic", id };
    default: return { kind: "nurse", id };
  }
}

export function mapMedication(data: Doc): MedicationItem {
  const areas = strArray(data.areas).length
    ? strArray(data.areas)
    : str(data.area) ? str(data.area).split(",").map((s) => s.trim()).filter(Boolean) : [];
  return {
    name: str(data.name),
    dosage: str(data.dosage),
    category: (str(data.category) || "other") as ProductCategory,
    brand: typeof data.brand === "string" ? data.brand : undefined,
    unit: (str(data.unit) || "freeText") as ProductUnit,
    areas,
    timing: typeof data.timing === "string" ? data.timing : undefined,
  };
}

export function mapPatient(id: string, data: Doc): Patient {
  return {
    id,
    givenName: str(data.givenName),
    lastName: str(data.lastName),
    dateOfBirth: parseDob(str(data.dateOfBirth)),
    gender: str(data.gender),
    address: str(data.address),
    phone: str(data.phone),
    email: str(data.email),
    allergies: str(data.allergies),
    currentMedications: str(data.currentMedications),
    owner: mapOwner(data),
    prescribingDoctorIDs: strArray(data.prescribingDoctorIds),
    alert: typeof data.alert === "string" ? data.alert : undefined,
    preferredName: typeof data.preferredName === "string" ? data.preferredName : undefined,
  };
}

export function mapNote(id: string, patientID: string, data: Doc): Note {
  const meds = Array.isArray(data.medications) ? (data.medications as Doc[]) : [];
  return {
    id,
    patientID,
    kind: (str(data.kind) || "general") as NoteKind,
    title: str(data.title),
    body: str(data.body),
    createdAt: toMillis(data.createdAt),
    authorID: str(data.authorId),
    authorBadge: str(data.authorBadge),
    consumedAuthorisationIDs: strArray(data.consumedAuthorisationIds),
    medications: meds.map((m): TreatmentMedication => ({
      name: str(m.name), batch: str(m.batch), expiry: str(m.expiry), dosage: str(m.dosage),
    })),
  };
}

export function mapAuthorisation(id: string, data: Doc): Authorisation {
  const expiresAt = data.expiresAtMillis != null ? intValue(data.expiresAtMillis) : toMillis(data.expiresAt);
  return {
    id,
    requestID: str(data.requestId),
    patientID: str(data.patientId),
    doctorID: str(data.doctorId),
    nurseID: str(data.nurseId),
    clinicID: typeof data.clinicId === "string" ? data.clinicId : null,
    medication: mapMedication((data.medication as Doc) ?? {}),
    repeatsRemaining: intValue(data.repeatsRemaining),
    expiresAt,
  };
}

export function mapAuthRequest(id: string, data: Doc): AuthorisationRequest {
  const items = (Array.isArray(data.items) ? (data.items as Doc[]) : []).map(mapMedication);
  const clinicId = typeof data.clinicId === "string" ? data.clinicId : null;
  const summary = data.patientSummary as Doc | undefined;
  const patientSummary: PatientSummary | undefined = summary
    ? {
        fullName: str(summary.name),
        dateOfBirth: parseDob(str(summary.dateOfBirth)),
        allergies: str(summary.allergies),
        currentMedications: str(summary.currentMedications),
        alert: typeof summary.alert === "string" ? summary.alert : undefined,
      }
    : undefined;
  return {
    id,
    patientID: str(data.patientId),
    nurse: { id: str(data.nurseId), name: str(data.nurseName) },
    doctorID: str(data.doctorId),
    context: clinicId ? { kind: "clinic", clinic: { id: clinicId, name: clinicId } } : { kind: "independent" },
    items,
    status: (str(data.status) || "pending") as RequestStatus,
    createdAt: toMillis(data.createdAt),
    patientSummary,
  };
}

export function mapAppointment(id: string, data: Doc): Appointment {
  const type: AppointmentType = data.type === "authorisation" ? "authSlot" : "treatment";
  return {
    id,
    type,
    ownerID: str(data.ownerId),
    dateISO: str(data.dateISO),
    startMinute: intValue(data.startMinute),
    endMinute: intValue(data.endMinute),
    status: (str(data.status) || "confirmed") as Appointment["status"],
    patientID: typeof data.patientId === "string" ? data.patientId : undefined,
    patientName: typeof data.patientName === "string" ? data.patientName : undefined,
    appointmentNote: typeof data.appointmentNote === "string" ? data.appointmentNote : undefined,
  };
}

// --- Encoders (writes) ---

export function encodeMedication(m: MedicationItem): Doc {
  return {
    name: m.name, dosage: m.dosage, category: m.category, brand: m.brand ?? null,
    unit: m.unit, areas: m.areas, timing: m.timing ?? null, area: m.areas.join(", "),
  };
}

export function encodeAuthRequest(r: AuthorisationRequest): Doc {
  const clinicId = r.context.kind === "clinic" ? r.context.clinic.id : null;
  const summary = r.patientSummary
    ? {
        name: r.patientSummary.fullName,
        dateOfBirth: formatDob(r.patientSummary.dateOfBirth),
        allergies: r.patientSummary.allergies,
        currentMedications: r.patientSummary.currentMedications,
      }
    : null;
  return {
    patientId: r.patientID,
    nurseId: r.nurse.id,
    nurseName: r.nurse.name,
    doctorId: r.doctorID,
    clinicId,
    status: r.status,
    createdAt: r.createdAt,
    items: r.items.map(encodeMedication),
    patientSummary: summary,
  };
}

export function encodeNote(n: Note): Doc {
  return {
    kind: n.kind,
    title: n.title,
    body: n.body,
    createdAt: n.createdAt,
    authorId: n.authorID,
    authorBadge: n.authorBadge,
    consumedAuthorisationIds: n.consumedAuthorisationIDs,
    medications: n.medications.map((m) => ({ name: m.name, batch: m.batch ?? "", expiry: m.expiry ?? "", dosage: m.dosage ?? "" })),
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- mappers`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/firebase/mappers.ts src/lib/firebase/__tests__/mappers.test.ts
git commit -m "feat(firebase): add Firestore <-> domain mappers (TDD)"
```

---

## Task 3: Identity from auth claims (TDD) + thin auth wrappers

**Files:**
- Create: `src/lib/firebase/identity.ts`
- Create: `src/lib/firebase/auth.ts`
- Test: `src/lib/firebase/__tests__/identity.test.ts`

`identity.ts` is the pure, testable part (claims + user doc → `Identity[]`). `auth.ts` holds the thin Firebase SDK wrappers (no unit tests; verified live).

- [ ] **Step 1: Write the failing test**

Create `src/lib/firebase/__tests__/identity.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { identitiesFromClaims, type DemoClaims } from "@/lib/firebase/identity";

const userDoc = { name: "Sarah Chen" };

describe("identitiesFromClaims", () => {
  it("builds an independent identity for a nurse with no clinics", () => {
    const claims: DemoClaims = { uid: "u-sarah", roles: ["nurse"], clinics: {} };
    const ids = identitiesFromClaims(claims, userDoc);
    expect(ids).toHaveLength(1);
    expect(ids[0]).toEqual({
      user: { id: "u-sarah", name: "Sarah Chen" },
      role: "nurse",
      context: { kind: "independent" },
    });
  });

  it("adds a clinic identity per clinic membership", () => {
    const claims: DemoClaims = { uid: "u-sarah", roles: ["nurse"], clinics: { "clinic-lumiere": "employee" } };
    const ids = identitiesFromClaims(claims, userDoc);
    // independent + clinic
    expect(ids).toHaveLength(2);
    expect(ids[1].context).toEqual({ kind: "clinic", clinic: { id: "clinic-lumiere", name: "clinic-lumiere" } });
  });

  it("maps a clinic admin membership to the clinicAdmin role", () => {
    const claims: DemoClaims = { uid: "u-ava", roles: [], clinics: { "clinic-lumiere": "admin" } };
    const ids = identitiesFromClaims(claims, { name: "Ava Lim" });
    expect(ids).toHaveLength(1);
    expect(ids[0].role).toBe("clinicAdmin");
    expect(ids[0].context).toEqual({ kind: "clinic", clinic: { id: "clinic-lumiere", name: "clinic-lumiere" } });
  });

  it("builds an independent doctor identity", () => {
    const claims: DemoClaims = { uid: "u-voss", roles: ["doctor"], clinics: {} };
    const ids = identitiesFromClaims(claims, { name: "Dr Elena Voss" });
    expect(ids[0].role).toBe("doctor");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- identity`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/firebase/identity.ts`**

```ts
// Pure mapping from Firebase custom claims (+ users/{uid} doc) to the app's Identity list.
// Claims shape ported from iOS AuthClaims: roles: string[], clinics: { [clinicId]: kind }.
import type { Identity, Role } from "@/lib/demo/types";

export interface DemoClaims {
  uid: string;
  roles: string[];
  clinics: Record<string, string>; // clinicId -> "admin" | "employee" | "contractor"
}

function isRole(r: string): r is Role {
  return r === "doctor" || r === "nurse" || r === "clinicAdmin" || r === "superAdmin";
}

export function identitiesFromClaims(claims: DemoClaims, userDoc: { name?: string } | null): Identity[] {
  const user = { id: claims.uid, name: userDoc?.name ?? "" };
  const identities: Identity[] = [];

  // Independent identities from top-level roles (nurse/doctor act independently).
  for (const r of claims.roles) {
    if (isRole(r) && (r === "nurse" || r === "doctor" || r === "superAdmin")) {
      identities.push({ user, role: r, context: { kind: "independent" } });
    }
  }

  // One identity per clinic membership; "admin" => clinicAdmin, else the user's clinical role.
  for (const [clinicId, kind] of Object.entries(claims.clinics)) {
    const clinic = { id: clinicId, name: clinicId };
    if (kind === "admin") {
      identities.push({ user, role: "clinicAdmin", context: { kind: "clinic", clinic } });
    } else {
      const clinicalRole: Role = claims.roles.includes("doctor") ? "doctor" : "nurse";
      identities.push({ user, role: clinicalRole, context: { kind: "clinic", clinic } });
    }
  }

  return identities;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- identity`
Expected: PASS.

- [ ] **Step 5: Implement `src/lib/firebase/auth.ts`** (thin SDK wrappers; no unit test)

```ts
"use client";

import {
  signInWithEmailAndPassword, signOut as fbSignOut, onIdTokenChanged,
  type User,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { firebaseAuth, firestore } from "./client";
import { identitiesFromClaims, type DemoClaims } from "./identity";
import type { Identity } from "@/lib/demo/types";

export async function signInWithPassword(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(firebaseAuth(), email, password);
}

export async function signOutUser(): Promise<void> {
  await fbSignOut(firebaseAuth());
}

// Resolve the signed-in user's identities from custom claims + their users/{uid} doc.
export async function identitiesForUser(user: User): Promise<Identity[]> {
  const tokenResult = await user.getIdTokenResult();
  const raw = tokenResult.claims as Record<string, unknown>;
  const claims: DemoClaims = {
    uid: user.uid,
    roles: Array.isArray(raw.roles) ? (raw.roles as string[]) : [],
    clinics: (raw.clinics as Record<string, string>) ?? {},
  };
  let userDoc: { name?: string } | null = null;
  try {
    const snap = await getDoc(doc(firestore(), "users", user.uid));
    userDoc = snap.exists() ? (snap.data() as { name?: string }) : null;
  } catch {
    userDoc = null; // name falls back to claim/email; not fatal for sign-in
  }
  return identitiesFromClaims(claims, userDoc);
}

// Subscribe to auth state; calls back with the User (or null when signed out).
export function watchUser(cb: (user: User | null) => void): () => void {
  return onIdTokenChanged(firebaseAuth(), cb);
}
```

- [ ] **Step 6: Type-check + commit**

Run: `npx tsc --noEmit` (expect no errors).
```bash
git add src/lib/firebase/identity.ts src/lib/firebase/auth.ts src/lib/firebase/__tests__/identity.test.ts
git commit -m "feat(firebase): map auth claims to identities (TDD) + auth wrappers"
```

---

## Task 4: Hydration — assemble DemoState from Firestore rows (TDD) + query runner

**Files:**
- Create: `src/lib/firebase/hydrate.ts`
- Test: `src/lib/firebase/__tests__/hydrate.test.ts`

`assembleState` (pure) turns already-fetched rows into a `DemoState`; `hydrate` (thin) runs the rules-safe queries and calls `assembleState`. We unit-test `assembleState`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/firebase/__tests__/hydrate.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { assembleState, type HydrationRows } from "@/lib/firebase/hydrate";

const rows: HydrationRows = {
  patients: [
    { id: "p1", data: { ownerType: "clinic", ownerId: "clinic-lumiere", givenName: "Amara", lastName: "Boyd", dateOfBirth: "1991-03-12", prescribingDoctorIds: [] } },
  ],
  notesByPatient: { p1: [{ id: "n1", data: { kind: "general", body: "hi", createdAt: 1 } }] },
  authorisations: [
    { id: "a1", data: { requestId: "r1", patientId: "p1", doctorId: "u-voss", nurseId: "u-sarah", clinicId: "clinic-lumiere", repeatsRemaining: 4, expiresAtMillis: 1800000000000, medication: { name: "Letybo", category: "neurotoxin", unit: "units", areas: ["Forehead"] } } },
  ],
  requests: [
    { id: "r2", data: { patientId: "p1", nurseId: "u-sarah", nurseName: "Sarah Chen", doctorId: "u-voss", status: "pending", createdAt: 2, items: [] } },
  ],
  appointments: [
    { id: "ap1", data: { type: "treatment", ownerId: "clinic-lumiere", dateISO: "2026-06-26", startMinute: 540, endMinute: 570, status: "confirmed" } },
  ],
};

describe("assembleState", () => {
  it("builds a DemoState keyed by id with nested notes", () => {
    const state = assembleState(rows);
    expect(Object.keys(state.patients)).toEqual(["p1"]);
    expect(state.notesByPatient.p1).toHaveLength(1);
    expect(state.authorisations.a1.repeatsRemaining).toBe(4);
    expect(state.requests.r2.status).toBe("pending");
    expect(state.appointments.ap1.startMinute).toBe(540);
    expect(state.ledger).toEqual([]);
    expect(state.usages).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- hydrate`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/firebase/hydrate.ts`**

```ts
"use client";

import {
  collection, query, where, getDocs, type QueryConstraint,
} from "firebase/firestore";
import { firestore } from "./client";
import { mapPatient, mapNote, mapAuthorisation, mapAuthRequest, mapAppointment } from "./mappers";
import type { DemoState } from "@/lib/demo/types";
import type { DemoClaims } from "./identity";

export interface Row { id: string; data: Record<string, unknown> }
export interface HydrationRows {
  patients: Row[];
  notesByPatient: Record<string, Row[]>;
  authorisations: Row[];
  requests: Row[];
  appointments: Row[];
}

// Pure: rows -> DemoState (testable, no Firebase).
export function assembleState(rows: HydrationRows): DemoState {
  const patients: DemoState["patients"] = {};
  for (const r of rows.patients) patients[r.id] = mapPatient(r.id, r.data);

  const notesByPatient: DemoState["notesByPatient"] = {};
  for (const [pid, list] of Object.entries(rows.notesByPatient)) {
    notesByPatient[pid] = list.map((n) => mapNote(n.id, pid, n.data));
  }

  const authorisations: DemoState["authorisations"] = {};
  for (const r of rows.authorisations) authorisations[r.id] = mapAuthorisation(r.id, r.data);

  const requests: DemoState["requests"] = {};
  for (const r of rows.requests) requests[r.id] = mapAuthRequest(r.id, r.data);

  const appointments: DemoState["appointments"] = {};
  for (const r of rows.appointments) appointments[r.id] = mapAppointment(r.id, r.data);

  return { patients, notesByPatient, authorisations, requests, appointments, ledger: [], usages: [] };
}

async function runQuery(path: string, ...constraints: QueryConstraint[]): Promise<Row[]> {
  const snap = await getDocs(query(collection(firestore(), path), ...constraints));
  return snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }));
}

// Thin: run the same rules-safe queries as iOS LiveBackend.hydrate(), then assemble.
export async function hydrate(claims: DemoClaims): Promise<DemoState> {
  const uid = claims.uid;
  const clinicIds = Object.keys(claims.clinics);

  // Patients: union the visibility-edge queries by id (rules are "not filters").
  const patientQueries: QueryConstraint[][] = [
    [where("ownerType", "==", "nurse"), where("ownerId", "==", uid)],
    [where("ownerType", "==", "doctor"), where("ownerId", "==", uid)],
    [where("ownerType", "==", "nurse"), where("prescribingDoctorIds", "array-contains", uid)],
    [where("ownerType", "==", "clinic"), where("prescribingDoctorIds", "array-contains", uid)],
    ...clinicIds.map((cid) => [where("ownerType", "==", "clinic"), where("ownerId", "==", cid)]),
  ];
  const patientsById = new Map<string, Row>();
  for (const constraints of patientQueries) {
    for (const row of await runQuery("patients", ...constraints)) patientsById.set(row.id, row);
  }
  const patients = [...patientsById.values()];

  const notesByPatient: Record<string, Row[]> = {};
  for (const p of patients) notesByPatient[p.id] = await runQuery(`patients/${p.id}/notes`);

  // Authorisations + requests scoped to this user (nurse-owned or clinic-shared).
  const authConstraints: QueryConstraint[][] = [
    [where("nurseId", "==", uid)],
    ...clinicIds.map((cid) => [where("clinicId", "==", cid)]),
    [where("doctorId", "==", uid)],
  ];
  const authsById = new Map<string, Row>();
  const reqsById = new Map<string, Row>();
  for (const constraints of authConstraints) {
    for (const row of await runQuery("authorisations", ...constraints)) authsById.set(row.id, row);
    for (const row of await runQuery("authRequests", ...constraints)) reqsById.set(row.id, row);
  }

  // Appointments owned by the user or their clinics.
  const apptOwners = [uid, ...clinicIds];
  const apptsById = new Map<string, Row>();
  for (const owner of apptOwners) {
    for (const row of await runQuery("appointments", where("ownerId", "==", owner))) apptsById.set(row.id, row);
  }

  return assembleState({
    patients,
    notesByPatient,
    authorisations: [...authsById.values()],
    requests: [...reqsById.values()],
    appointments: [...apptsById.values()],
  });
}
```

> Note: the exact `authorisations` / `authRequests` query fields must satisfy the deployed `firestore.rules`. The constraints above mirror the iOS hydrate intent (nurse-owned, clinic-shared, doctor-issued). During live verification (Task 9) watch the console for `permission-denied`; if a query is rejected, align it to the rule and note the change.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- hydrate`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/firebase/hydrate.ts src/lib/firebase/__tests__/hydrate.test.ts
git commit -m "feat(firebase): hydrate DemoState from Firestore (assembleState TDD)"
```

---

## Task 5: Write mirroring (direct creates + callables)

**Files:**
- Create: `src/lib/firebase/mirror.ts`

Thin functions that push an already-applied optimistic change to Firestore/Functions. No unit tests (covered by encoders in Task 2; verified live). Each throws on failure so the store can record `lastSyncError`.

- [ ] **Step 1: Implement `src/lib/firebase/mirror.ts`**

```ts
"use client";

import { doc, setDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { firestore, functions } from "./client";
import { encodeAuthRequest, encodeNote } from "./mappers";
import type { AuthorisationRequest, Note } from "@/lib/demo/types";

// Direct creates (rules-enforced), matching iOS LiveBackend.
export async function mirrorCreateRequest(request: AuthorisationRequest): Promise<void> {
  await setDoc(doc(firestore(), "authRequests", request.id), encodeAuthRequest(request));
}

export async function mirrorCreateNote(patientID: string, note: Note): Promise<void> {
  await setDoc(doc(firestore(), `patients/${patientID}/notes`, note.id), encodeNote(note));
}

// Integrity-critical operations go through the existing Cloud Functions.
export async function mirrorApproveRequest(requestId: string): Promise<void> {
  await httpsCallable(functions(), "approveRequest")({ requestId });
}
export async function mirrorRequireEdit(requestId: string): Promise<void> {
  await httpsCallable(functions(), "requireEdit")({ requestId });
}
export async function mirrorConsumeRepeats(
  patientId: string, authorisationIds: string[],
): Promise<void> {
  await httpsCallable(functions(), "consumeRepeats")({ patientId, authorisationIds });
}
```

> Note: confirm the `consumeRepeats` payload shape against `backend/functions/src/index.ts` during implementation (it takes the ticked authorisation ids; the iOS call passes the patient + ticked ids). Adjust the keys to match the function's `event.data` exactly.

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit` (expect no errors).
```bash
git add src/lib/firebase/mirror.ts
git commit -m "feat(firebase): add write mirroring (direct creates + callables)"
```

---

## Task 6: Mode-aware auth provider (demo vs live)

**Files:**
- Modify: `src/lib/demo/auth.tsx`
- Test: `src/lib/demo/__tests__/auth.test.tsx`

Extend `DemoAuthProvider` so that, in live mode, it tracks Firebase Auth and resolves identities; in demo mode it keeps the preset-account flow. The context value gains `mode`, `availableIdentities`, `signInLive`, and `selectIdentity`; existing `signIn`/`signOut`/`identity`/`accounts` remain.

- [ ] **Step 1: Write the failing test** (demo mode still works headlessly)

Create `src/lib/demo/__tests__/auth.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { DemoAuthProvider, useDemoAuth } from "@/lib/demo/auth";
import { DEMO_ACCOUNTS } from "@/lib/demo/accounts";

function wrapper({ children }: { children: ReactNode }) {
  return <DemoAuthProvider>{children}</DemoAuthProvider>;
}

describe("DemoAuthProvider (demo mode)", () => {
  it("defaults to demo mode and signs in with a preset identity", () => {
    const { result } = renderHook(() => useDemoAuth(), { wrapper });
    expect(result.current.mode).toBe("demo");
    expect(result.current.identity).toBeNull();
    act(() => result.current.signIn(DEMO_ACCOUNTS[0].identities[0]));
    expect(result.current.identity?.user.name).toBe("Sarah Chen");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- demo/__tests__/auth`
Expected: FAIL — `mode` undefined (or compile error).

- [ ] **Step 3: Implement the updated `src/lib/demo/auth.tsx`**

```tsx
"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Identity } from "./types";
import { DEMO_ACCOUNTS } from "./accounts";
import { isFirebaseConfigured } from "@/lib/firebase/client";

type Mode = "demo" | "live";

interface AuthValue {
  mode: Mode;
  identity: Identity | null;
  /** Live mode: identities resolved for the signed-in user (may be >1). */
  availableIdentities: Identity[];
  accounts: typeof DEMO_ACCOUNTS;
  /** Demo mode: choose a preset identity directly. */
  signIn: (identity: Identity) => void;
  /** Live mode: email/password sign-in; resolves identities then auto-selects if only one. */
  signInLive: (email: string, password: string) => Promise<void>;
  /** Live mode: pick among multiple resolved identities. */
  selectIdentity: (identity: Identity) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function DemoAuthProvider({ children }: { children: ReactNode }) {
  const mode: Mode = isFirebaseConfigured() ? "live" : "demo";
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [availableIdentities, setAvailableIdentities] = useState<Identity[]>([]);

  // Live mode: react to Firebase auth state and resolve identities.
  useEffect(() => {
    if (mode !== "live") return;
    let cancelled = false;
    let unsub = () => {};
    (async () => {
      const { watchUser, identitiesForUser } = await import("@/lib/firebase/auth");
      unsub = watchUser(async (user) => {
        if (!user) {
          if (!cancelled) { setIdentity(null); setAvailableIdentities([]); }
          return;
        }
        const ids = await identitiesForUser(user);
        if (cancelled) return;
        setAvailableIdentities(ids);
        setIdentity((cur) => cur ?? ids[0] ?? null);
      });
    })();
    return () => { cancelled = true; unsub(); };
  }, [mode]);

  const value = useMemo<AuthValue>(
    () => ({
      mode,
      identity,
      availableIdentities,
      accounts: DEMO_ACCOUNTS,
      signIn: setIdentity,
      signInLive: async (email, password) => {
        const { signInWithPassword } = await import("@/lib/firebase/auth");
        await signInWithPassword(email, password); // watchUser populates identities
      },
      selectIdentity: setIdentity,
      signOut: () => {
        setIdentity(null);
        setAvailableIdentities([]);
        if (mode === "live") void import("@/lib/firebase/auth").then((m) => m.signOutUser());
      },
    }),
    [mode, identity, availableIdentities],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useDemoAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useDemoAuth must be used within DemoAuthProvider");
  return ctx;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- demo/__tests__/auth`
Expected: PASS (mode defaults to `demo` in tests — no Firebase env).

- [ ] **Step 5: Full test + type-check**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; all tests pass (the existing store/AuthGuard tests still rely on demo mode).

- [ ] **Step 6: Commit**

```bash
git add src/lib/demo/auth.tsx src/lib/demo/__tests__/auth.test.tsx
git commit -m "feat(firebase): make auth provider mode-aware (demo vs live)"
```

---

## Task 7: Mode-aware store (hydrate + mirror)

**Files:**
- Modify: `src/lib/demo/store.tsx`

In live mode the store hydrates from Firestore after an identity is selected, uses real `now`, and mirrors writes; in demo mode it keeps `buildSeedState()` and no-op mirrors. Exposes `status` (`"demo" | "loading" | "ready" | "error"`), `lastSyncError`, and `rehydrate()`.

- [ ] **Step 1: Implement the updated `src/lib/demo/store.tsx`**

```tsx
"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { DemoState, Identity, MedicationItem, TreatmentMedication } from "./types";
import { buildSeedState, SEED_NOW } from "./seed";
import * as backend from "./backend";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import { useDemoAuth } from "./auth";

type Status = "demo" | "loading" | "ready" | "error";

interface StoreValue {
  state: DemoState;
  now: number;
  status: Status;
  lastSyncError: string | null;
  rehydrate: () => void;
  searchPatients: (query: string, identity: Identity) => ReturnType<typeof backend.searchPatients>;
  notesForPatient: (patientID: string) => ReturnType<typeof backend.notesForPatient>;
  activeAuthorisations: (patientID: string) => ReturnType<typeof backend.activeAuthorisations>;
  pendingRequestsForDoctor: (doctorID: string) => ReturnType<typeof backend.pendingRequestsForDoctor>;
  openRequestsForPatient: (patientID: string, nurseID: string) => ReturnType<typeof backend.openRequestsForPatient>;
  submitRequest: (input: { patientID: string; doctorID: string; items: MedicationItem[]; identity: Identity }) => void;
  approveRequest: (requestID: string, identity: Identity) => void;
  requireEdit: (requestID: string, identity: Identity) => void;
  saveGeneralNote: (input: { patientID: string; title: string; body: string; identity: Identity }) => void;
  saveTreatmentNote: (input: { patientID: string; tickedIDs: string[]; title: string; body: string; medications: TreatmentMedication[]; identity: Identity }) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function DemoStoreProvider({ children }: { children: ReactNode }) {
  const live = isFirebaseConfigured();
  const { identity } = useDemoAuth();
  const [state, setState] = useState<DemoState>(() => (live ? backend.emptyState() : buildSeedState()));
  const [status, setStatus] = useState<Status>(live ? "loading" : "demo");
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const now = live ? Date.now() : SEED_NOW;

  // Live hydrate whenever the signed-in user changes or a refresh is requested.
  useEffect(() => {
    if (!live || !identity) return;
    let cancelled = false;
    setStatus("loading");
    (async () => {
      try {
        const { hydrate } = await import("@/lib/firebase/hydrate");
        const next = await hydrate({ uid: identity.user.id, roles: [identity.role], clinics: clinicMap(identity) });
        if (!cancelled) { setState(next); setStatus("ready"); }
      } catch (e) {
        if (!cancelled) { setStatus("error"); setLastSyncError(String(e)); }
      }
    })();
    return () => { cancelled = true; };
  }, [live, identity, refreshTick]);

  // Optimistic local apply, then mirror to Firestore/Functions (live only).
  function applyAndMirror(
    apply: (s: DemoState) => DemoState,
    mirror: (m: typeof import("@/lib/firebase/mirror")) => Promise<void>,
  ) {
    setState((s) => apply(s));
    if (!live) return;
    void (async () => {
      try {
        const m = await import("@/lib/firebase/mirror");
        await mirror(m);
      } catch (e) {
        setLastSyncError(String(e));
      }
    })();
  }

  const value = useMemo<StoreValue>(
    () => ({
      state,
      now,
      status,
      lastSyncError,
      rehydrate: () => setRefreshTick((t) => t + 1),
      searchPatients: (q, id) => backend.searchPatients(state, q, id),
      notesForPatient: (pid) => backend.notesForPatient(state, pid),
      activeAuthorisations: (pid) => backend.activeAuthorisations(state, pid, now),
      pendingRequestsForDoctor: (did) => backend.pendingRequestsForDoctor(state, did),
      openRequestsForPatient: (pid, nid) => backend.openRequestsForPatient(state, pid, nid),
      submitRequest: (input) => {
        let created: ReturnType<typeof backend.submitRequest>["request"] | null = null;
        applyAndMirror(
          (s) => { const r = backend.submitRequest(s, input, now); created = r.request; return r.state; },
          (m) => created ? m.mirrorCreateRequest(created) : Promise.resolve(),
        );
      },
      approveRequest: (requestID, id) =>
        applyAndMirror((s) => backend.approveRequest(s, requestID, id, now).state, (m) => m.mirrorApproveRequest(requestID)),
      requireEdit: (requestID, id) =>
        applyAndMirror((s) => backend.requireEdit(s, requestID, id), (m) => m.mirrorRequireEdit(requestID)),
      saveGeneralNote: (input) => {
        let note: ReturnType<typeof backend.saveGeneralNote>["note"] | null = null;
        applyAndMirror(
          (s) => { const r = backend.saveGeneralNote(s, input, now); note = r.note; return r.state; },
          (m) => note ? m.mirrorCreateNote(input.patientID, note) : Promise.resolve(),
        );
      },
      saveTreatmentNote: (input) => {
        let note: ReturnType<typeof backend.saveTreatmentNote>["note"] | null = null;
        applyAndMirror(
          (s) => { const r = backend.saveTreatmentNote(s, input, now); note = r.note; return r.state; },
          async (m) => {
            if (input.tickedIDs.length) await m.mirrorConsumeRepeats(input.patientID, input.tickedIDs);
            if (note) await m.mirrorCreateNote(input.patientID, note);
          },
        );
      },
    }),
    [state, now, status, lastSyncError],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

function clinicMap(identity: Identity): Record<string, string> {
  return identity.context.kind === "clinic"
    ? { [identity.context.clinic.id]: identity.role === "clinicAdmin" ? "admin" : "employee" }
    : {};
}

export function useDemoStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useDemoStore must be used within DemoStoreProvider");
  return ctx;
}
```

- [ ] **Step 2: Run the existing store test + type-check**

Run: `npx tsc --noEmit && npm test -- store`
Expected: no type errors; the existing store test passes (demo mode unchanged: `status` starts `"demo"`, seed loaded).

- [ ] **Step 3: Commit**

```bash
git add src/lib/demo/store.tsx
git commit -m "feat(firebase): make store mode-aware with hydrate + mirror"
```

---

## Task 8: Login form (live email/password) + app loading/error states

**Files:**
- Modify: `src/components/app/LoginForm.tsx`
- Modify: `src/components/app/AppShell.tsx`
- Modify: `src/app/app/dashboard/page.tsx`

- [ ] **Step 1: Update `src/components/app/LoginForm.tsx`** (email/password in live mode; preset cards in demo)

Replace the whole file with:
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDemoAuth } from "@/lib/demo/auth";
import { identityBadge } from "@/lib/demo/types";

export function LoginForm() {
  const { mode } = useDemoAuth();
  return mode === "live" ? <LiveLogin /> : <DemoLogin />;
}

function LiveLogin() {
  const { signInLive } = useDemoAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInLive(email, password);
      router.push("/app/dashboard");
    } catch {
      setError("Sign-in failed. Check your email and password.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-md rounded-card border border-line bg-card p-7 shadow-card">
      <p className="kicker">Sign in</p>
      <h1 className="mt-3 font-display text-2xl text-ink">AestheticX</h1>
      <p className="mt-2 text-sm text-ink-soft">Sign in with your AestheticX account.</p>
      <label className="mt-6 block">
        <span className="micro">Email</span>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          className="mt-1.5 w-full rounded-field border border-line bg-card px-3 py-2 text-ink outline-none focus:border-tint" />
      </label>
      <label className="mt-4 block">
        <span className="micro">Password</span>
        <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
          className="mt-1.5 w-full rounded-field border border-line bg-card px-3 py-2 text-ink outline-none focus:border-tint" />
      </label>
      {error && <p className="mt-3 text-sm" style={{ color: "var(--color-rose)" }}>{error}</p>}
      <button type="submit" disabled={busy}
        className="mt-6 w-full rounded-btn px-4 py-3 text-center text-sm font-medium text-card transition-colors disabled:opacity-60"
        style={{ background: "var(--color-tint)" }}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

function DemoLogin() {
  const { accounts, signIn } = useDemoAuth();
  const router = useRouter();
  const [selected, setSelected] = useState(0);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    signIn(accounts[selected].identities[0]);
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
            <label key={account.label}
              className={`flex cursor-pointer items-center gap-3 rounded-inner border px-4 py-3 transition-colors ${checked ? "border-tint" : "border-line hover:border-tint/50"}`}
              style={checked ? { boxShadow: "0 0 0 3px var(--color-tint-soft)" } : undefined}>
              <input type="radio" name="account" className="sr-only" checked={checked} onChange={() => setSelected(i)} />
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
        <input type="password" defaultValue="demo"
          className="mt-1.5 w-full rounded-field border border-line bg-card px-3 py-2 text-ink outline-none focus:border-tint" />
      </label>
      <button type="submit" className="mt-6 w-full rounded-btn px-4 py-3 text-center text-sm font-medium text-card transition-colors"
        style={{ background: "var(--color-tint)" }}>
        Enter the demo
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Update `src/components/app/AppShell.tsx`** — show a sync-error banner and adjust the demo chip

Find the demo chip span:
```tsx
            <span className="micro rounded-full px-2 py-0.5" style={{ background: "var(--color-tint-soft)", color: "var(--color-tint)" }}>
              Demo · resets on refresh
            </span>
```
Replace it with a mode-aware chip + import the store. At the top of the file add `import { useDemoStore } from "@/lib/demo/store";`, then inside `AppShell` after `const { identity, signOut } = useDemoAuth();` add `const { status, lastSyncError } = useDemoStore();`. Replace the chip with:
```tsx
            <span className="micro rounded-full px-2 py-0.5" style={{ background: "var(--color-tint-soft)", color: "var(--color-tint)" }}>
              {status === "demo" ? "Demo · resets on refresh" : "Live"}
            </span>
```
And immediately after the `</header>` closing tag, add a sync-error banner:
```tsx
      {lastSyncError && (
        <div className="border-b px-5 py-2 text-center text-sm sm:px-8" style={{ background: "var(--color-rose-soft)", color: "var(--color-rose)" }}>
          A change could not be saved to the server. It will reconcile on refresh.
        </div>
      )}
```

- [ ] **Step 3: Update `src/app/app/dashboard/page.tsx`** — handle loading/error before reading data

After `if (!identity) return null;` add:
```tsx
  if (store.status === "loading") return <p className="text-ink-soft">Loading your data…</p>;
  if (store.status === "error") {
    return (
      <div>
        <p className="text-ink-soft">Could not load your data.</p>
        <button onClick={store.rehydrate} className="mt-3 rounded-btn px-4 py-2 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>
          Retry
        </button>
      </div>
    );
  }
```

- [ ] **Step 4: Type-check + commit**

Run: `npx tsc --noEmit`
```bash
git add src/components/app/LoginForm.tsx src/components/app/AppShell.tsx "src/app/app/dashboard/page.tsx"
git commit -m "feat(firebase): live email/password login + loading/error states"
```

---

## Task 9: Loading/error states on the remaining data screens

**Files:**
- Modify: `src/app/app/patients/page.tsx`
- Modify: `src/app/app/patients/[id]/page.tsx`
- Modify: `src/app/app/authorisations/page.tsx`
- Modify: `src/app/app/calendar/page.tsx`

Each page reads from the store; in live mode it must not render data while `status === "loading"`/`"error"`. Add the same guard to each, right after the existing `if (!identity) return null;` line.

- [ ] **Step 1: Add the guard to each of the four pages**

In `patients/page.tsx`, `authorisations/page.tsx`, and `calendar/page.tsx`, after `if (!identity) return null;` insert:
```tsx
  if (store.status === "loading") return <p className="text-ink-soft">Loading…</p>;
  if (store.status === "error") return <p className="text-ink-soft">Could not load data. Open the dashboard to retry.</p>;
```

In `patients/[id]/page.tsx`, the store hook is named `store` and the guard goes after `if (!identity) return null;` (before reading `store.state.patients[id]`):
```tsx
  if (store.status === "loading") return <p className="text-ink-soft">Loading…</p>;
  if (store.status === "error") return <p className="text-ink-soft">Could not load data. Open the dashboard to retry.</p>;
```

(For `authorisations/page.tsx` and `calendar/page.tsx`, confirm the store hook variable is `store`; if the file uses `useDemoStore()` inline without a `store` const, add `const store = useDemoStore();` near the top alongside `useDemoAuth()`. In the versions committed earlier, both already call `const store = useDemoStore();`.)

- [ ] **Step 2: Type-check, full tests**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; all unit tests pass (demo mode unaffected — `status` is `"demo"`, so the guards are skipped).

- [ ] **Step 3: Commit**

```bash
git add "src/app/app/patients/page.tsx" "src/app/app/patients/[id]/page.tsx" "src/app/app/authorisations/page.tsx" "src/app/app/calendar/page.tsx"
git commit -m "feat(firebase): loading/error guards on data screens"
```

---

## Task 10: Verification gate

**Files:** none (verification + docs only).

- [ ] **Step 1: Offline gate**

Run, expecting all green:
```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```
Expected: lint clean; tsc clean; all unit tests pass (client, mappers, identity, hydrate, demo auth, store, backend, seed, AuthGuard); build succeeds. **Demo mode must still work** — with no `.env.local`, `/login` shows preset cards and the app loads the seed.

- [ ] **Step 2: Demo-mode smoke (preview tools)**

Start the dev server (no Firebase env). Confirm `/login` still shows the four preset accounts and the core loop works exactly as before (no regression). The header chip reads "Demo · resets on refresh".

- [ ] **Step 3: Document the live verification checklist**

Create `docs/superpowers/firebase-live-verification.md`:
```markdown
# Live verification (manual, owner-run) — production aestheticx-91e6b

Prerequisites (owner-provided):
1. `.env.local` filled with the Firebase Web config (all six NEXT_PUBLIC_FIREBASE_* vars).
2. localhost:3000 + the Vercel domain added to Firebase Auth authorized domains.
3. A dedicated TEST account (email/password) scoped to TEST data, with roles/clinics claims set.

Steps (run locally with `.env.local` present, signed in as the TEST account only — do NOT
exercise writes against real patients):
1. `npm run dev`; open /login → it shows the email/password form (live mode).
2. Sign in with the test account → lands on /app/dashboard; header chip reads "Live".
3. Patients list shows the test account's real patients (read path + rules OK).
4. Open a test patient → notes + active authorisations render.
5. As a test nurse: raise a request on a test patient → it appears; confirm an authRequests
   doc was created in Firestore console.
6. As a test doctor: approve it → confirm via console that approveRequest issued the
   authorisation + billing event; rehydrate reflects it.
7. Watch the browser console for permission-denied (rules) errors during hydrate; if any query
   is rejected, note the exact rule and align hydrate.ts.
8. Sign out → returns to /login; refresh → no stale session.

If any write fails, the in-app banner appears and the server stays authoritative.
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/firebase-live-verification.md
git commit -m "docs(firebase): live verification checklist"
```

---

## Self-Review Notes

- **Spec coverage:** mode gating (T1 `isFirebaseConfigured`, T6/T7 mode flags) ✓; client init (T1) ✓; auth + identity (T3 claims→identity, T6 provider) ✓; reads/hydration with rules-safe queries (T4) ✓; writes optimistic + mirror via direct creates + callables (T5, T7) ✓; mappers testable (T2) ✓; login live/demo (T8) ✓; loading/error states (T8/T9) ✓; offline tests + manual live checklist (T10) ✓; prerequisites documented (T10 doc) ✓; out-of-scope respected (no patient create/edit, consent, billing, storage, video, self-booking, subscriptions).
- **Type consistency:** `DemoClaims` ({uid, roles, clinics}) used identically in T3/T4/T7; mappers' names (`mapPatient`/`mapNote`/`mapAuthorisation`/`mapAuthRequest`/`mapAppointment`, `encodeAuthRequest`/`encodeNote`) match across T2/T4/T5; store method names unchanged from the existing pages (T7 keeps `searchPatients`/`approveRequest`/etc.); `mirror*` names match T5↔T7.
- **Known confirmations during implementation (flagged inline):** exact `consumeRepeats` payload keys (T5) and the `authorisations`/`authRequests` query fields vs deployed rules (T4) — verify against `backend/functions/src/index.ts` and `firestore.rules`, adjust, and note any change.
- **Testing honesty:** live Firebase paths are NOT in CI; correctness of data transforms rests on the pure unit tests (mappers, identity, assembleState). Live behaviour is verified manually per the T10 checklist against a test account only.

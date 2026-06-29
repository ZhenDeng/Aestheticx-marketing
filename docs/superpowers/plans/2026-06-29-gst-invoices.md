# Pricing + GST Invoices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Doctors set a per-counterparty script price and generate A4 GST tax invoices over a counterparty+month's un-invoiced authorisations; everyone who may read an invoice can list and download it. Live uses the backend Functions; demo simulates with the ported GST math.

**Architecture:** A ported pure invoicing module (money math, TDD); `Authorisation` + `DemoState` extensions (`invoiced`/`createdAt`, `invoices`, `scriptPricing`); pure demo ops; live callable wrappers + mapper/hydrate; store actions branching demo (local) vs live (Function → rehydrate); UI on `/app/billing`.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest. No new deps.

**Source of truth:** `docs/superpowers/specs/2026-06-29-gst-invoices-design.md`; backend `invoicing.ts`/`billingFn.ts`.

**Existing context:**
- `src/lib/demo/types.ts` — `Authorisation { id, requestID, patientID, doctorID, nurseID, clinicID, medication, repeatsRemaining, expiresAt }`; `DemoState` (has `ledger`, `usages`, etc.); `Identity`; `fullName(patient)` helper.
- `src/lib/demo/billing.ts` — `monthKey(millis)`, `monthLabel(key)`, `partyLabel`, `billingSummary` (3a).
- `src/lib/demo/backend.ts` — `emptyState()` (object literal), `approveRequest` (builds `granted` Authorisations + the billing event), `makeID(prefix)`, `BackendError`, imports `fullName` and `monthKey`.
- `src/lib/firebase/mappers.ts` — `mapAuthorisation`, `str`/`toMillis`/`intValue`/`Doc`.
- `src/lib/firebase/hydrate.ts` — `HydrationRows`, `assembleState`, `runQuery`, role-scoped `hydrate(claims)` (billingEvents pattern from 3a).
- `src/lib/demo/store.tsx` — `live = isFirebaseConfigured()`, `applyAndMirror`, `setState`, `setRefreshTick` (rehydrate), `setLastSyncError`, `now`; read accessors + `billingSummary` (3a).
- `src/app/app/billing/page.tsx` — the 3a dashboard (renders `summary.months` with `byParty`).

---

## Task 1: Pure invoicing domain (TDD)

**Files:**
- Create: `src/lib/demo/invoicing.ts`
- Test: `src/lib/demo/__tests__/invoicing.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/demo/__tests__/invoicing.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  computeInvoice, selectableForInvoice, formatAUD, invoicesFor, DEFAULT_SCRIPT_PRICE_CENTS, GST_RATE,
} from "@/lib/demo/invoicing";
import type { Invoice } from "@/lib/demo/invoicing";
import type { Identity } from "@/lib/demo/types";

describe("computeInvoice", () => {
  it("computes per-line fee + GST and totals (one $25 script)", () => {
    const r = computeInvoice({ pricePerScriptCents: DEFAULT_SCRIPT_PRICE_CENTS, gstRate: GST_RATE,
      authorisations: [{ id: "a1", dateISO: "2026-06-26", patientName: "Mara Boyd" }] });
    expect(r.subtotalCents).toBe(2500);
    expect(r.gstCents).toBe(250);
    expect(r.totalCents).toBe(2750);
    expect(r.lines[0].authorisationID).toBe("a1");
  });
  it("sums multiple lines", () => {
    const r = computeInvoice({ pricePerScriptCents: 2500, gstRate: GST_RATE,
      authorisations: [{ id: "a", dateISO: "d", patientName: "n" }, { id: "b", dateISO: "d", patientName: "n" }] });
    expect(r.totalCents).toBe(5500);
  });
  it("throws on a non-positive price", () => {
    expect(() => computeInvoice({ pricePerScriptCents: 0, gstRate: GST_RATE, authorisations: [] })).toThrow();
  });
});

describe("selectableForInvoice", () => {
  it("keeps same-counterparty, same-month, un-invoiced", () => {
    const auths = [
      { id: "a", counterpartyID: "c1", monthKey: "2026-06", invoiced: false },
      { id: "b", counterpartyID: "c1", monthKey: "2026-06", invoiced: true },
      { id: "c", counterpartyID: "c2", monthKey: "2026-06", invoiced: false },
      { id: "d", counterpartyID: "c1", monthKey: "2026-05", invoiced: false },
    ];
    expect(selectableForInvoice(auths, { counterpartyID: "c1", monthKey: "2026-06" }).map((a) => a.id)).toEqual(["a"]);
  });
});

describe("formatAUD", () => {
  it("formats cents as AUD", () => {
    expect(formatAUD(2750)).toBe("$27.50");
    expect(formatAUD(123456)).toBe("$1,234.56");
    expect(formatAUD(0)).toBe("$0.00");
  });
});

describe("invoicesFor", () => {
  const inv = (over: Partial<Invoice>): Invoice => ({
    id: "i", doctorID: "u-voss", counterpartyID: "clinic-lumiere", counterpartyType: "clinic",
    periodLabel: "June 2026", lines: [], subtotalCents: 2500, gstCents: 250, totalCents: 2750,
    authorisationIDs: ["a"], createdAt: 1, ...over,
  });
  const doctor: Identity = { user: { id: "u-voss", name: "V" }, role: "doctor", context: { kind: "independent" } };
  const admin: Identity = { user: { id: "u-ava", name: "A" }, role: "clinicAdmin", context: { kind: "clinic", clinic: { id: "clinic-lumiere", name: "Lumière" } } };
  it("scopes by doctor and by clinic counterparty", () => {
    expect(invoicesFor([inv({})], doctor)).toHaveLength(1);
    expect(invoicesFor([inv({})], admin)).toHaveLength(1);
    expect(invoicesFor([inv({ counterpartyID: "other" })], admin)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run** — `npm test -- invoicing.test` → FAIL (module missing). (If the name filter flakes, run `npm test`.)

- [ ] **Step 3: Implement `src/lib/demo/invoicing.ts`** (math ported verbatim from backend `invoicing.ts`):
```ts
// Per-script invoicing — money math in integer cents, ported verbatim from the
// backend invoicing.ts so demo totals match server-computed totals.
import type { Identity } from "./types";

export const DEFAULT_SCRIPT_PRICE_CENTS = 2500;
export const GST_RATE = 0.1;

export interface InvoiceAuthInput { id: string; dateISO: string; patientName: string; }
export interface InvoiceLine { authorisationID: string; dateISO: string; patientName: string; feeCents: number; gstCents: number; }
export interface ComputedInvoice { lines: InvoiceLine[]; subtotalCents: number; gstCents: number; totalCents: number; }

export interface Invoice {
  id: string;
  doctorID: string;
  counterpartyID: string;
  counterpartyType: "nurse" | "clinic";
  periodLabel: string;
  lines: InvoiceLine[];
  subtotalCents: number;
  gstCents: number;
  totalCents: number;
  authorisationIDs: string[];
  pdfFileId?: string;
  createdAt: number;
}

export function computeInvoice(input: {
  pricePerScriptCents: number;
  gstRate: number;
  authorisations: InvoiceAuthInput[];
}): ComputedInvoice {
  if (!(input.pricePerScriptCents > 0)) throw new Error("price per script must be a positive amount of cents");
  const lines: InvoiceLine[] = input.authorisations.map((a) => ({
    authorisationID: a.id,
    dateISO: a.dateISO,
    patientName: a.patientName,
    feeCents: input.pricePerScriptCents,
    gstCents: Math.round(input.pricePerScriptCents * input.gstRate),
  }));
  const subtotalCents = lines.reduce((s, l) => s + l.feeCents, 0);
  const gstCents = lines.reduce((s, l) => s + l.gstCents, 0);
  return { lines, subtotalCents, gstCents, totalCents: subtotalCents + gstCents };
}

export interface BillableAuthRow { id: string; counterpartyID: string; monthKey: string; invoiced: boolean; }

export function selectableForInvoice<T extends BillableAuthRow>(
  auths: T[], filter: { counterpartyID: string; monthKey: string },
): T[] {
  return auths.filter(
    (a) => a.counterpartyID === filter.counterpartyID && a.monthKey === filter.monthKey && !a.invoiced,
  );
}

export function formatAUD(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString("en-US");
  const c = String(abs % 100).padStart(2, "0");
  return `${sign}$${dollars}.${c}`;
}

// Invoices the identity may see (mirrors the backend invoices read rules).
export function invoicesFor(invoices: Invoice[], identity: Identity): Invoice[] {
  if (identity.role === "doctor") return invoices.filter((i) => i.doctorID === identity.user.id);
  const clinicId = identity.context.kind === "clinic" ? identity.context.clinic.id : null;
  return invoices.filter((i) =>
    i.counterpartyType === "clinic"
      ? clinicId !== null && i.counterpartyID === clinicId
      : i.counterpartyType === "nurse" && i.counterpartyID === identity.user.id,
  );
}
```

- [ ] **Step 4: Run** — `npm test -- invoicing.test` → PASS; `npx tsc --noEmit` → clean.
- [ ] **Step 5: Commit**
```bash
git add src/lib/demo/invoicing.ts src/lib/demo/__tests__/invoicing.test.ts
git commit -m "feat(invoices): port GST invoicing math + helpers (TDD)"
```

---

## Task 2: Authorisation + state extensions

**Files:**
- Modify: `src/lib/demo/types.ts`, `src/lib/demo/backend.ts`, `src/lib/firebase/mappers.ts`, `src/lib/firebase/hydrate.ts` (+ its test)

- [ ] **Step 1: Extend `Authorisation`** in `src/lib/demo/types.ts`:
```ts
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
  createdAt: number;  // epoch ms — when approved (for invoice month grouping)
  invoiced: boolean;  // set true when an invoice includes it
}
```

- [ ] **Step 2: Extend `DemoState`** in `src/lib/demo/types.ts` — add to the interface (after `formsByPatient`):
```ts
  invoices: import("./invoicing").Invoice[];
  scriptPricing: Record<string, number>; // "{doctorID}_{counterpartyID}" -> cents
```

- [ ] **Step 3: `emptyState()`** in `src/lib/demo/backend.ts` — add to the returned object:
```ts
    invoices: [],
    scriptPricing: {},
```

- [ ] **Step 4: Set the new auth fields on approval.** In `approveRequest`, the `granted` map adds `createdAt`/`invoiced`:
```ts
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
    createdAt: now,
    invoiced: false,
  }));
```

- [ ] **Step 5: `mapAuthorisation`** in `src/lib/firebase/mappers.ts` — add the two fields to the returned object:
```ts
    repeatsRemaining: intValue(data.repeatsRemaining),
    expiresAt,
    createdAt: toMillis(data.createdAt),
    invoiced: data.invoiced === true,
```

- [ ] **Step 6: `assembleState`** in `src/lib/firebase/hydrate.ts` — both the existing return and (Task 4) the new ones must include `invoices`/`scriptPricing`. For now change the return line to:
```ts
  return { patients, notesByPatient, authorisations, requests, appointments, ledger, usages: [], formsByPatient, invoices: [], scriptPricing: {} };
```
(Task 4 replaces `invoices: []`/`scriptPricing: {}` with hydrated values.)

- [ ] **Step 7: Run** — `npx tsc --noEmit`. Existing tests that build `Authorisation`/`DemoState` literals will fail to type-check; fix them: any test constructing an `Authorisation` literal needs `createdAt`/`invoiced`; any building a `DemoState` literal needs `invoices: []`, `scriptPricing: {}`. Search and fix:
```bash
grep -rln "repeatsRemaining" src/lib/**/__tests__ ; grep -rln "ledger: \[\]" src/lib/**/__tests__
```
Update those literals. Run `npm test` → green.
- [ ] **Step 8: Commit**
```bash
git add src/lib/demo/types.ts src/lib/demo/backend.ts src/lib/firebase/mappers.ts src/lib/firebase/hydrate.ts src/lib/**/__tests__
git commit -m "feat(invoices): authorisation invoiced/createdAt + invoices/scriptPricing state"
```

---

## Task 3: Pure demo ops (TDD)

**Files:**
- Modify: `src/lib/demo/backend.ts`
- Test: `src/lib/demo/__tests__/invoices-ops.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/demo/__tests__/invoices-ops.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { emptyState, submitRequest, approveRequest, setScriptPrice, generateInvoice, billableAuthorisations } from "@/lib/demo/backend";
import type { DemoState, Identity, Patient } from "@/lib/demo/types";

const NOW = Date.UTC(2026, 5, 26);
const voss: Identity = { user: { id: "u-voss", name: "Dr Elena Voss" }, role: "doctor", context: { kind: "independent" } };
const sarah: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "independent" } };
function patient(id: string): Patient {
  return { id, givenName: "Mara", lastName: "Boyd", dateOfBirth: { year: 1990, month: 1, day: 1 },
    gender: "F", address: "x", phone: "x", email: "x", allergies: "x", currentMedications: "x",
    owner: { kind: "nurse", id: "u-sarah" }, prescribingDoctorIDs: [] };
}
function approved(): DemoState {
  let s: DemoState = { ...emptyState(), patients: { p1: patient("p1") } };
  const r = submitRequest(s, { patientID: "p1", doctorID: "u-voss",
    items: [{ name: "Profhilo", dosage: "2", category: "skinBooster", unit: "millilitres", areas: [] }], identity: sarah }, NOW);
  s = approveRequest(r.state, r.request.id, voss, NOW).state;
  return s;
}

describe("setScriptPrice", () => {
  it("stores a per-counterparty price", () => {
    const s = setScriptPrice(emptyState(), "u-voss", "u-sarah", 3000);
    expect(s.scriptPricing["u-voss_u-sarah"]).toBe(3000);
  });
  it("rejects a non-positive price", () => {
    expect(() => setScriptPrice(emptyState(), "u-voss", "u-sarah", 0)).toThrow();
  });
});

describe("billableAuthorisations", () => {
  it("lists the doctor's approved un-invoiced auths with counterparty + month", () => {
    const rows = billableAuthorisations(approved(), "u-voss");
    expect(rows).toHaveLength(1);
    expect(rows[0].counterpartyID).toBe("u-sarah");
    expect(rows[0].counterpartyType).toBe("nurse");
    expect(rows[0].monthKey).toBe("2026-06");
    expect(rows[0].invoiced).toBe(false);
    expect(rows[0].patientName).toContain("Mara");
  });
});

describe("generateInvoice", () => {
  it("computes totals, records the invoice, and marks the auths invoiced", () => {
    const s0 = approved();
    const authID = billableAuthorisations(s0, "u-voss")[0].id;
    const { state, invoice } = generateInvoice(s0, {
      doctorID: "u-voss", counterpartyID: "u-sarah", counterpartyType: "nurse",
      periodLabel: "June 2026", authIDs: [authID],
    }, voss, NOW);
    expect(invoice.totalCents).toBe(2750); // $25 + 10% GST
    expect(state.invoices).toHaveLength(1);
    expect(state.authorisations[authID].invoiced).toBe(true);
    expect(billableAuthorisations(state, "u-voss")).toHaveLength(0); // dropped from billable
  });
  it("uses a per-counterparty price override", () => {
    let s = setScriptPrice(approved(), "u-voss", "u-sarah", 4000);
    const authID = billableAuthorisations(s, "u-voss")[0].id;
    const { invoice } = generateInvoice(s, { doctorID: "u-voss", counterpartyID: "u-sarah", counterpartyType: "nurse", periodLabel: "June 2026", authIDs: [authID] }, voss, NOW);
    expect(invoice.subtotalCents).toBe(4000);
    expect(invoice.totalCents).toBe(4400);
  });
  it("throws when nothing is selectable", () => {
    expect(() => generateInvoice(approved(), { doctorID: "u-voss", counterpartyID: "u-sarah", counterpartyType: "nurse", periodLabel: "x", authIDs: ["nope"] }, voss, NOW)).toThrow();
  });
});
```

- [ ] **Step 2: Run** — `npm test -- invoices-ops` → FAIL.

- [ ] **Step 3: Implement** — in `src/lib/demo/backend.ts` add imports and the ops. Add to the value imports: `import { computeInvoice, selectableForInvoice, DEFAULT_SCRIPT_PRICE_CENTS, GST_RATE, type Invoice } from "./invoicing";` and ensure `monthKey` is imported (it is). Append:
```ts
export function scriptPriceKey(doctorID: string, counterpartyID: string): string {
  return `${doctorID}_${counterpartyID}`;
}

export function setScriptPrice(state: DemoState, doctorID: string, counterpartyID: string, priceCents: number): DemoState {
  if (!Number.isInteger(priceCents) || priceCents <= 0) throw new BackendError("validationFailed");
  return { ...state, scriptPricing: { ...state.scriptPricing, [scriptPriceKey(doctorID, counterpartyID)]: priceCents } };
}

export interface BillableAuthorisation {
  id: string;
  counterpartyID: string;
  counterpartyType: "nurse" | "clinic";
  monthKey: string;
  invoiced: boolean;
  patientName: string;
  dateISO: string;
}

export function billableAuthorisations(state: DemoState, doctorID: string): BillableAuthorisation[] {
  return Object.values(state.authorisations)
    .filter((a) => a.doctorID === doctorID)
    .map((a) => {
      const patient = state.patients[a.patientID];
      return {
        id: a.id,
        counterpartyID: a.clinicID ?? a.nurseID,
        counterpartyType: a.clinicID ? "clinic" : "nurse",
        monthKey: monthKey(a.createdAt),
        invoiced: a.invoiced,
        patientName: patient ? fullName(patient) : "",
        dateISO: new Date(a.createdAt).toISOString().slice(0, 10),
      };
    });
}

export interface GenerateInvoiceInput {
  doctorID: string;
  counterpartyID: string;
  counterpartyType: "nurse" | "clinic";
  periodLabel: string;
  authIDs: string[];
}

export function generateInvoice(
  state: DemoState, input: GenerateInvoiceInput, identity: Identity, now: number,
): { state: DemoState; invoice: Invoice } {
  if (identity.role !== "doctor" || identity.user.id !== input.doctorID) throw new BackendError("notPermitted");
  const rows = billableAuthorisations(state, input.doctorID)
    .filter((r) => input.authIDs.includes(r.id) && r.counterpartyID === input.counterpartyID && !r.invoiced);
  if (rows.length === 0) throw new BackendError("validationFailed");
  const priceCents = state.scriptPricing[scriptPriceKey(input.doctorID, input.counterpartyID)] ?? DEFAULT_SCRIPT_PRICE_CENTS;
  const computed = computeInvoice({
    pricePerScriptCents: priceCents, gstRate: GST_RATE,
    authorisations: rows.map((r) => ({ id: r.id, dateISO: r.dateISO, patientName: r.patientName })),
  });
  const invoice: Invoice = {
    id: makeID("inv"),
    doctorID: input.doctorID,
    counterpartyID: input.counterpartyID,
    counterpartyType: input.counterpartyType,
    periodLabel: input.periodLabel,
    ...computed,
    authorisationIDs: rows.map((r) => r.id),
    createdAt: now,
  };
  const invoicedIDs = new Set(rows.map((r) => r.id));
  const authorisations = { ...state.authorisations };
  for (const id of invoicedIDs) authorisations[id] = { ...authorisations[id], invoiced: true };
  return { state: { ...state, authorisations, invoices: [...state.invoices, invoice] }, invoice };
}
```
(Confirm `BackendError` accepts the `"validationFailed"`/`"notPermitted"` codes already used elsewhere in the file; reuse the existing union.)

- [ ] **Step 4: Run** — `npm test -- invoices-ops` → PASS; `npx tsc --noEmit` → clean; `npm test` → all green.
- [ ] **Step 5: Commit**
```bash
git add src/lib/demo/backend.ts src/lib/demo/__tests__/invoices-ops.test.ts
git commit -m "feat(invoices): demo setScriptPrice/generateInvoice/billableAuthorisations (TDD)"
```

---

## Task 4: Live wiring — mapper, hydrate, callable wrappers

**Files:**
- Modify: `src/lib/firebase/mappers.ts`, `src/lib/firebase/hydrate.ts`
- Create: `src/lib/firebase/invoices.ts`

- [ ] **Step 1: `mapInvoice`** — append to `src/lib/firebase/mappers.ts` (add `Invoice`/`InvoiceLine` to a `@/lib/demo/invoicing` import):
```ts
export function mapInvoice(id: string, data: Doc): Invoice {
  const lines = (Array.isArray(data.lines) ? (data.lines as Doc[]) : []).map((l): InvoiceLine => ({
    authorisationID: str(l.authorisationId),
    dateISO: str(l.dateISO),
    patientName: str(l.patientName),
    feeCents: intValue(l.feeCents),
    gstCents: intValue(l.gstCents),
  }));
  return {
    id,
    doctorID: str(data.doctorId),
    counterpartyID: str(data.counterpartyId),
    counterpartyType: data.counterpartyType === "clinic" ? "clinic" : "nurse",
    periodLabel: str(data.periodLabel),
    lines,
    subtotalCents: intValue(data.subtotalCents),
    gstCents: intValue(data.gstCents),
    totalCents: intValue(data.totalCents),
    authorisationIDs: strArray(data.authorisationIds),
    pdfFileId: typeof data.pdfFileId === "string" ? data.pdfFileId : undefined,
    createdAt: toMillis(data.createdAt),
  };
}
```

- [ ] **Step 2: Hydrate invoices + scriptPricing** in `src/lib/firebase/hydrate.ts`:
  - Add `mapInvoice` to the `./mappers` import.
  - Add to `HydrationRows`: `invoices: Row[];` and `scriptPricing: Row[];`.
  - In `assembleState`, build them and include in the return (replace the `invoices: []`/`scriptPricing: {}` from Task 2):
    ```ts
    const invoices = rows.invoices.map((r) => mapInvoice(r.id, r.data));
    const scriptPricing: DemoState["scriptPricing"] = {};
    for (const r of rows.scriptPricing) {
      const cents = typeof r.data.priceCents === "number" ? r.data.priceCents : 0;
      if (cents > 0) scriptPricing[r.id] = cents; // doc id is "{doctorId}_{counterpartyId}"
    }
    return { patients, notesByPatient, authorisations, requests, appointments, ledger, usages: [], formsByPatient, invoices, scriptPricing };
    ```
  - Super-admin branch `assembleState({...})`: add `invoices: await runQuery("invoices"), scriptPricing: await runQuery("scriptPricing"),`.
  - Normal branch: after the billing block, add:
    ```ts
    const invoiceConstraints: QueryConstraint[][] = [
      [where("doctorId", "==", uid)],
      [where("counterpartyType", "==", "nurse"), where("counterpartyId", "==", uid)],
      ...clinicIds.map((cid) => [where("counterpartyType", "==", "clinic"), where("counterpartyId", "==", cid)]),
    ];
    const invoicesById = new Map<string, Row>();
    for (const constraints of invoiceConstraints) {
      for (const row of await runQuery("invoices", ...constraints)) invoicesById.set(row.id, row);
    }
    const scriptPricingRows = await runQuery("scriptPricing", where("doctorId", "==", uid));
    ```
    and add `invoices: [...invoicesById.values()], scriptPricing: scriptPricingRows,` to the normal `assembleState({...})` call.
  - Update `src/lib/firebase/__tests__/hydrate.test.ts`: add `invoices: []`, `scriptPricing: []` to the `HydrationRows` literal (and optionally one invoice row); keep it green.

- [ ] **Step 3: Create `src/lib/firebase/invoices.ts`:**
```ts
"use client";

import { httpsCallable } from "firebase/functions";
import { functions } from "./client";

export async function setScriptPrice(counterpartyID: string, priceCents: number): Promise<void> {
  await httpsCallable(functions(), "setScriptPrice")({ counterpartyId: counterpartyID, priceCents });
}

export interface GenerateInvoiceArgs {
  counterpartyID: string;
  counterpartyType: "nurse" | "clinic";
  periodLabel: string;
  authorisationIDs: string[];
}

export async function generateInvoice(args: GenerateInvoiceArgs): Promise<string> {
  const res = await httpsCallable(functions(), "generateInvoice")({
    counterpartyId: args.counterpartyID,
    counterpartyType: args.counterpartyType,
    periodLabel: args.periodLabel,
    authorisationIds: args.authorisationIDs,
  });
  return (res.data as { invoiceId?: string }).invoiceId ?? "";
}

export async function invoicePdfUrl(path: string): Promise<string> {
  const res = await httpsCallable(functions(), "mintDownloadUrl")({ path });
  const url = (res.data as { url?: string }).url;
  if (!url) throw new Error("mintDownloadUrl returned no url");
  return url;
}
```

- [ ] **Step 4: Run** — `npx tsc --noEmit` → clean; `npm test` → all green.
- [ ] **Step 5: Commit**
```bash
git add src/lib/firebase/mappers.ts src/lib/firebase/hydrate.ts src/lib/firebase/invoices.ts src/lib/firebase/__tests__/hydrate.test.ts
git commit -m "feat(invoices): map + hydrate invoices/scriptPricing + callable wrappers"
```

---

## Task 5: Store actions + accessors

**Files:**
- Modify: `src/lib/demo/store.tsx`

- [ ] **Step 1:** Add `import * as invoicing from "./invoicing";` beside `billing`. Add to `StoreValue`:
```ts
  invoicesFor: (identity: Identity) => ReturnType<typeof invoicing.invoicesFor>;
  scriptPrice: (doctorID: string, counterpartyID: string) => number;
  billableAuthorisations: (doctorID: string) => ReturnType<typeof backend.billableAuthorisations>;
  setScriptPrice: (counterpartyID: string, priceCents: number, identity: Identity) => void;
  generateInvoice: (input: import("./backend").GenerateInvoiceInput, identity: Identity) => void;
```

- [ ] **Step 2:** Add to the `value` object (beside the other accessors):
```ts
      invoicesFor: (id) => invoicing.invoicesFor(state.invoices, id),
      scriptPrice: (did, cid) => state.scriptPricing[backend.scriptPriceKey(did, cid)] ?? invoicing.DEFAULT_SCRIPT_PRICE_CENTS,
      billableAuthorisations: (did) => backend.billableAuthorisations(state, did),
      setScriptPrice: (cid, priceCents, id) => {
        if (!live) { setState((s) => backend.setScriptPrice(s, id.user.id, cid, priceCents)); return; }
        void (async () => {
          try { const m = await import("@/lib/firebase/invoices"); await m.setScriptPrice(cid, priceCents); setRefreshTick((t) => t + 1); }
          catch (e) { setLastSyncError(String(e)); }
        })();
      },
      generateInvoice: (input, id) => {
        if (!live) { setState((s) => backend.generateInvoice(s, input, id, now).state); return; }
        void (async () => {
          try {
            const m = await import("@/lib/firebase/invoices");
            await m.generateInvoice({ counterpartyID: input.counterpartyID, counterpartyType: input.counterpartyType, periodLabel: input.periodLabel, authorisationIDs: input.authIDs });
            setRefreshTick((t) => t + 1);
          } catch (e) { setLastSyncError(String(e)); }
        })();
      },
```
(If the `value` `useMemo` dependency array lists state setters, leave as-is — `setState`/`setRefreshTick`/`setLastSyncError` are stable. Ensure `state`, `now`, `live` remain in deps.)

- [ ] **Step 3: Run** — `npx tsc --noEmit` → clean; `npm test` → all green.
- [ ] **Step 4: Commit**
```bash
git add src/lib/demo/store.tsx
git commit -m "feat(invoices): store actions (pricing/generate) + read accessors"
```

---

## Task 6: UI — pricing + generate + invoices list on /app/billing

**Files:**
- Modify: `src/app/app/billing/page.tsx`

- [ ] **Step 1: Replace `src/app/app/billing/page.tsx`** with the 3a content plus the doctor generate panel and the Invoices section:
```tsx
"use client";

import { useState } from "react";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { partyLabel, monthLabel } from "@/lib/demo/billing";
import { formatAUD, computeInvoice, GST_RATE, DEFAULT_SCRIPT_PRICE_CENTS } from "@/lib/demo/invoicing";
import { DEMO_ACCOUNTS, LUMIERE } from "@/lib/demo/accounts";

export default function BillingPage() {
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  const [openРanel, setOpenPanel] = useState<string | null>(null); // `${monthKey}:${counterpartyID}`
  const [priceInput, setPriceInput] = useState<string>("");

  if (!identity) return null;
  if (store.status === "loading") return <p className="text-ink-soft">Loading…</p>;

  const me = identity;
  const isLive = store.status !== "demo";
  const isDoctor = me.role === "doctor";
  const summary = store.billingSummary(me);
  const invoices = store.invoicesFor(me);
  const heading = isDoctor ? "Authorisations you can bill" : "Billable to you";
  const partyNoun = isDoctor ? "Counterparty" : "Prescribing doctor";

  function openGenerate(monthKey: string, counterpartyID: string, counterpartyType: "nurse" | "clinic") {
    setOpenPanel(`${monthKey}:${counterpartyID}`);
    setPriceInput((store.scriptPrice(me.user.id, counterpartyID) / 100).toFixed(2));
    void counterpartyType;
  }

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-3xl text-ink">Billing</h1>
      <p className="mt-1 text-ink-soft">{heading}</p>

      <div className="mt-5 rounded-card border border-line bg-card p-5 shadow-card">
        <span className="micro">Total billable authorisations</span>
        <p className="mt-1 font-display text-4xl text-ink">{summary.totalCount}</p>
      </div>

      {summary.months.length === 0 ? (
        <p className="mt-6 text-sm text-ink-soft">No billable authorisations yet.</p>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          {summary.months.map((m) => (
            <div key={m.monthKey}>
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-xl text-ink">{monthLabel(m.monthKey)}</h2>
                <span className="micro">{m.count} total</span>
              </div>
              <ul className="mt-2 flex flex-col gap-1.5">
                {m.byParty.map((p) => {
                  const panelKey = `${m.monthKey}:${p.id}`;
                  const canGenerate = isDoctor && (p.type === "nurse" || p.type === "clinic");
                  return (
                    <li key={`${p.type}:${p.id}`} className="rounded-inner border border-line bg-card px-4 py-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-ink"><span className="micro mr-2">{partyNoun}</span>{partyLabel(p.type, p.id, DEMO_ACCOUNTS, LUMIERE)}</span>
                        <span className="flex items-center gap-3">
                          <span className="text-sm font-medium text-ink">{p.count}</span>
                          {canGenerate && (
                            <button type="button" onClick={() => openGenerate(m.monthKey, p.id, p.type as "nurse" | "clinic")}
                              className="rounded-btn border border-line px-3 py-1 text-xs text-ink-soft hover:border-tint">
                              Generate invoice
                            </button>
                          )}
                        </span>
                      </div>
                      {canGenerate && openPanel === panelKey && (
                        <GeneratePanel
                          monthKey={m.monthKey}
                          counterpartyID={p.id}
                          counterpartyType={p.type as "nurse" | "clinic"}
                          priceInput={priceInput}
                          setPriceInput={setPriceInput}
                          onDone={() => setOpenPanel(null)}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      <h2 className="mt-10 font-display text-xl text-ink">Invoices</h2>
      {invoices.length === 0 ? (
        <p className="mt-2 text-sm text-ink-soft">No invoices yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1.5">
          {invoices.map((inv) => (
            <li key={inv.id} className="flex items-center justify-between rounded-inner border border-line bg-card px-4 py-3">
              <span className="text-sm text-ink">
                {inv.periodLabel} · {partyLabel(isDoctor ? inv.counterpartyType : "doctor", isDoctor ? inv.counterpartyID : inv.doctorID, DEMO_ACCOUNTS, LUMIERE)}
                <span className="ml-2 font-medium">{formatAUD(inv.totalCents)}</span>
              </span>
              <InvoiceDownload pdfFileId={inv.pdfFileId} isLive={isLive} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GeneratePanel({ monthKey, counterpartyID, counterpartyType, priceInput, setPriceInput, onDone }: {
  monthKey: string; counterpartyID: string; counterpartyType: "nurse" | "clinic";
  priceInput: string; setPriceInput: (v: string) => void; onDone: () => void;
}) {
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  const me = identity!;
  const rows = store.billableAuthorisations(me.user.id)
    .filter((r) => r.counterpartyID === counterpartyID && r.monthKey === monthKey && !r.invoiced);
  const storedPrice = store.scriptPrice(me.user.id, counterpartyID);
  const previewPrice = Math.round((parseFloat(priceInput) || 0) * 100) || storedPrice || DEFAULT_SCRIPT_PRICE_CENTS;
  const preview = rows.length > 0
    ? computeInvoice({ pricePerScriptCents: previewPrice, gstRate: GST_RATE, authorisations: rows.map((r) => ({ id: r.id, dateISO: r.dateISO, patientName: r.patientName })) })
    : null;

  function savePrice() {
    const cents = Math.round((parseFloat(priceInput) || 0) * 100);
    if (cents > 0) store.setScriptPrice(counterpartyID, cents, me);
  }
  function generate() {
    if (rows.length === 0) return;
    store.generateInvoice({ doctorID: me.user.id, counterpartyID, counterpartyType, periodLabel: monthLabel(monthKey), authIDs: rows.map((r) => r.id) }, me);
    onDone();
  }

  return (
    <div className="mt-3 rounded-inner border border-line p-3">
      <p className="text-sm text-ink-soft">{rows.length} selectable authorisation{rows.length === 1 ? "" : "s"}.</p>
      <div className="mt-2 flex items-end gap-2">
        <label className="block">
          <span className="micro">Price per script (AUD)</span>
          <input value={priceInput} onChange={(e) => setPriceInput(e.target.value)} inputMode="decimal"
            className="mt-1 w-28 rounded-field border border-line bg-card px-3 py-1.5 text-sm text-ink" />
        </label>
        <button type="button" onClick={savePrice} className="rounded-btn border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-tint">Save price</button>
      </div>
      {preview && (
        <p className="mt-2 text-sm text-ink-soft">
          Subtotal {formatAUD(preview.subtotalCents)} · GST {formatAUD(preview.gstCents)} · <span className="text-ink font-medium">Total {formatAUD(preview.totalCents)}</span>
        </p>
      )}
      <div className="mt-3">
        <button type="button" onClick={generate} disabled={rows.length === 0}
          className="rounded-btn px-4 py-2 text-sm font-medium text-card disabled:opacity-50" style={{ background: "var(--color-tint)" }}>
          Generate invoice
        </button>
      </div>
    </div>
  );
}

function InvoiceDownload({ pdfFileId, isLive }: { pdfFileId?: string; isLive: boolean }) {
  const [busy, setBusy] = useState(false);
  if (!isLive) {
    return <span className="text-xs text-ink-soft">PDF available in live mode</span>;
  }
  async function download() {
    if (!pdfFileId) return;
    setBusy(true);
    try { const { invoicePdfUrl } = await import("@/lib/firebase/invoices"); window.open(await invoicePdfUrl(pdfFileId), "_blank", "noopener"); }
    catch { /* surfaced by sync banner elsewhere */ }
    finally { setBusy(false); }
  }
  return (
    <button type="button" onClick={download} disabled={!pdfFileId || busy}
      className="rounded-btn border border-line px-3 py-1 text-xs text-ink-soft hover:border-tint disabled:opacity-50">
      {busy ? "Opening…" : pdfFileId ? "Download PDF" : "Preparing…"}
    </button>
  );
}
```
> NOTE: the `openРanel` identifier above contains a typo placeholder — name the state `openPanel` consistently (`const [openPanel, setOpenPanel] = useState<string | null>(null);`). Use `openPanel` everywhere.

- [ ] **Step 2: Run** — `npx tsc --noEmit` → clean; `npm run lint` → clean; `npm run build` → `/app/billing` compiles.
- [ ] **Step 3: Commit**
```bash
git add "src/app/app/billing/page.tsx"
git commit -m "feat(invoices): pricing + generate panel + invoices list on /app/billing"
```

---

## Task 7: Verification gate + demo smoke + live doc + PR

- [ ] **Step 1: Offline gate** — `rm -rf .next && npm run lint && npx tsc --noEmit && npm test && npm run build` → all green; new `invoicing`/`invoices-ops` tests pass; `/app/billing` compiles.
- [ ] **Step 2: Demo smoke (preview).** Move `.env.local` aside if present. As **Dr Voss** → Billing → on the **Lumière / June 2026** row click **Generate invoice** → panel shows **1 selectable**, price **25.00**, preview **Subtotal $25.00 · GST $2.50 · Total $27.50** → **Generate** → an invoice appears under **Invoices** (`June 2026 · Lumière Clinic · $27.50`) with a **"PDF available in live mode"** note, and the billable count drops to 0. Screenshot. Restore `.env.local`.
- [ ] **Step 3: Live doc** — append a "GST invoices — live checks" section to `docs/superpowers/firebase-live-verification.md` (set a price via `setScriptPrice`, generate for a TEST counterparty+month, confirm the `invoices/{id}` doc + `invoices/{doctorId}/{id}.pdf` + the auths flipping `invoiced`, the counterparty listing + downloading via `mintDownloadUrl`, and re-generating excluding invoiced auths).
- [ ] **Step 4: Commit + PR**
```bash
git add docs/superpowers/firebase-live-verification.md
git commit -m "docs(invoices): live verification checklist for GST invoices"
```
Open the PR with `/create-pr` (base `main`). Body: increment 3b — pricing + GST invoices; ported GST math (demo parity); doctor generate-flow + role-scoped invoices list + live PDF download via mintDownloadUrl; PDF/email server-side (demo shows live-only); builds on 3a.

---

## Self-Review Notes

- **Spec coverage:** invoicing math + `selectableForInvoice`/`formatAUD`/`invoicesFor` (spec §1 → T1) ✓; auth + state extensions (spec §2 → T2) ✓; demo ops (spec §3 → T3) ✓; mapper/hydrate/wrappers (spec §4 → T4) ✓; store actions/accessors (spec §4 → T5) ✓; UI pricing+generate+list+download (spec §5 → T6) ✓; tests + demo + live doc (spec §6 → T7) ✓; caveats (live-only PDF, ported math, no void, doctor-only pricing) reflected ✓.
- **Type consistency:** `computeInvoice`/`selectableForInvoice`/`formatAUD`/`invoicesFor`/`Invoice`/`DEFAULT_SCRIPT_PRICE_CENTS`/`GST_RATE` (T1) used by ops (T3), store (T5), UI (T6); `Authorisation.createdAt/invoiced` (T2) used by `billableAuthorisations`/`mapAuthorisation` (T3/T2); `GenerateInvoiceInput` (T3) used by store (T5) + UI (T6); `mapInvoice` (T4) matches the backend doc field names; callable wrappers (T4) used by store (T5).
- **No placeholders:** every step has full code/commands (the one flagged `openPanel` typo is called out to fix).
- **Wire alignment:** demo `computeInvoice` is the verbatim backend math; mapper field names (`authorisationId`/`counterpartyId`/`priceCents`/`pdfFileId`) match the backend docs; hydrate constraints mirror the `invoices`/`scriptPricing` rules.

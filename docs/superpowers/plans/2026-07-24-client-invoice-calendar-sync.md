# Manual client invoicing + treatment blocks on the calendar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give practitioners a manual client invoice (type description + price, GST toggles) reachable from the patient file and from a calendar appointment check-out, and render Availability treatment blocks on the calendar.

**Architecture:** Reuse the existing invoice/PDF/party machinery. A new pure GST helper (`computeManualInvoice`) feeds a new demo reducer (`buildClientInvoice`/`recordClientInvoice`) that stamps parties exactly like `checkoutClient`/`createServiceInvoice`. A shared `ClientInvoiceComposer` component drives both entry points; live mode generates the PDF without persisting. A `BlockedBands` calendar component mirrors the existing `BusyBlocks`.

**Tech Stack:** Next.js 16 / React 19, TypeScript, Vitest + Testing Library, in-memory demo backend (`src/lib/demo/*`).

## Global Constraints

- Money is **integer cents everywhere** — never floats.
- GST conventions: inclusive → `gst = round(amount / 11)`; on-top → `gst = round(amount × 0.1)` (`GST_RATE = 0.1`).
- Matrix/client invoices leave legacy fields inert: `doctorID: ""`.
- Reducers are pure `(state, …, now) → state`; ids minted via `makeID`; `now` supplied by the caller (`SEED_NOW` in tests, `writeNow()` in the store).
- Demo-mode reducers only run when `!live`; live client-invoicing does **not** persist yet (PDF hand-off only).
- Run a single test file with `npx vitest run <path>`; a single test with `npx vitest run <path> -t "<name>"`.
- Follow existing file patterns; tests live in `__tests__/` beside the code.

---

### Task 1: `computeManualInvoice` GST math

**Files:**
- Modify: `src/lib/demo/invoicing.ts` (add near `computeInclusiveTotals`, ~line 137)
- Test: `src/lib/demo/__tests__/manual-invoice-math.test.ts` (create)

**Interfaces:**
- Consumes: `ComputedInvoice`, `InvoiceLine`, `GST_RATE` (existing in `invoicing.ts`).
- Produces:
  ```ts
  export interface ManualLineInput { id: string; description: string; amountCents: number; }
  export interface ManualGstOptions { chargeGst: boolean; gstIncluded: boolean; }
  export function computeManualInvoice(lines: ManualLineInput[], opts: ManualGstOptions): ComputedInvoice
  ```

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/demo/__tests__/manual-invoice-math.test.ts
import { describe, expect, it } from "vitest";
import { computeManualInvoice } from "../invoicing";

const line = (amountCents: number, id = "l1", description = "Treatment") => ({ id, description, amountCents });

describe("computeManualInvoice", () => {
  it("no GST: gst is zero, total equals the sum of amounts", () => {
    const r = computeManualInvoice([line(10000)], { chargeGst: false, gstIncluded: false });
    expect(r.gstCents).toBe(0);
    expect(r.subtotalCents).toBe(10000);
    expect(r.totalCents).toBe(10000);
    expect(r.lines[0].gstCents).toBe(0);
    expect(r.lines[0].feeCents).toBe(10000);
    expect(r.lines[0].unitCents).toBe(10000);
    expect(r.lines[0].qty).toBe(1);
    expect(r.lines[0].description).toBe("Treatment");
  });

  it("GST included: gst = round(amount/11), net = amount - gst, total = amount", () => {
    const r = computeManualInvoice([line(11000)], { chargeGst: true, gstIncluded: true });
    expect(r.gstCents).toBe(1000);
    expect(r.subtotalCents).toBe(10000);
    expect(r.totalCents).toBe(11000);
    expect(r.lines[0].unitCents).toBe(11000); // the typed (gross) figure shows as unit
  });

  it("GST on top: net = amount, gst = round(amount*0.1), total = amount*1.1", () => {
    const r = computeManualInvoice([line(10000)], { chargeGst: true, gstIncluded: false });
    expect(r.gstCents).toBe(1000);
    expect(r.subtotalCents).toBe(10000);
    expect(r.totalCents).toBe(11000);
    expect(r.lines[0].unitCents).toBe(10000);
  });

  it("sums and rounds per line across multiple lines", () => {
    const r = computeManualInvoice(
      [line(9999, "a"), line(1, "b", "Other")],
      { chargeGst: true, gstIncluded: false },
    );
    expect(r.subtotalCents).toBe(10000);
    expect(r.gstCents).toBe(Math.round(9999 * 0.1) + Math.round(1 * 0.1)); // 1000 + 0 = 1000
    expect(r.totalCents).toBe(11000);
  });

  it("rejects an empty set and non-positive / non-integer amounts", () => {
    expect(() => computeManualInvoice([], { chargeGst: true, gstIncluded: true })).toThrow();
    expect(() => computeManualInvoice([line(0)], { chargeGst: false, gstIncluded: false })).toThrow();
    expect(() => computeManualInvoice([line(-5)], { chargeGst: false, gstIncluded: false })).toThrow();
    expect(() => computeManualInvoice([line(10.5)], { chargeGst: false, gstIncluded: false })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/demo/__tests__/manual-invoice-math.test.ts`
Expected: FAIL — `computeManualInvoice is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add to `src/lib/demo/invoicing.ts` (after `computeInclusiveTotals`):

```ts
// --- Manual client-invoice math (spec: manual client invoicing, 2026-07-24) ---
// A practitioner hand-types each line's description and price. Two per-invoice options
// mirror the retail conventions already in this file: "GST included" is the inclusive
// convention (gst = round(amount/11), like computeInclusiveTotals); "GST on top" is the
// exclusive one (gst = round(amount*0.1), like computeInvoice/createServiceInvoice); no
// GST leaves the line untaxed. Money stays integer cents.
export interface ManualLineInput { id: string; description: string; amountCents: number; }
export interface ManualGstOptions { chargeGst: boolean; gstIncluded: boolean; }

export function computeManualInvoice(inputs: ManualLineInput[], opts: ManualGstOptions): ComputedInvoice {
  if (inputs.length === 0) throw new Error("an invoice needs at least one line");
  const lines: InvoiceLine[] = inputs.map((l) => {
    if (!Number.isInteger(l.amountCents) || l.amountCents <= 0) {
      throw new Error("line amount must be a positive amount of cents");
    }
    let feeCents: number;
    let gstCents: number;
    if (!opts.chargeGst) {
      feeCents = l.amountCents;
      gstCents = 0;
    } else if (opts.gstIncluded) {
      gstCents = Math.round(l.amountCents / 11);
      feeCents = l.amountCents - gstCents;
    } else {
      feeCents = l.amountCents;
      gstCents = Math.round(l.amountCents * GST_RATE);
    }
    return {
      authorisationID: l.id,
      dateISO: "",
      patientName: "",
      feeCents,
      gstCents,
      description: l.description,
      qty: 1,
      unitCents: l.amountCents, // the typed figure — gross when inclusive, net when on-top
    };
  });
  const subtotalCents = lines.reduce((s, l) => s + l.feeCents, 0);
  const gstCents = lines.reduce((s, l) => s + l.gstCents, 0);
  return { lines, subtotalCents, gstCents, totalCents: subtotalCents + gstCents };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/demo/__tests__/manual-invoice-math.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/demo/invoicing.ts src/lib/demo/__tests__/manual-invoice-math.test.ts
git commit -m "feat(invoice): manual client-invoice GST math (included / on-top / none)"
```

---

### Task 2: Types + `createClientInvoice` reducer

**Files:**
- Modify: `src/lib/demo/invoicing.ts` (`InvoiceKind` union ~line 44; `Invoice` interface ~line 88)
- Modify: `src/lib/demo/types.ts` (`AuditAction` union ~line 503)
- Modify: `src/lib/demo/backend.ts` (add near `createServiceInvoice`, ~line 2846)
- Test: `src/lib/demo/__tests__/client-invoice.test.ts` (create)

**Interfaces:**
- Consumes: `computeManualInvoice` (Task 1); existing `patientAccessLevel`, `clientBillTo`, `issuerPartyFor`, `makeID`, `isoDay`, `appendAuditEntry`, `fullName`, `formatAUD`, `ownerDisplayLabel`, `BackendError` (all in `backend.ts`).
- Produces:
  ```ts
  export interface CreateClientInvoiceInput {
    patientID: string;
    lines: { description: string; amountCents: number }[];
    chargeGst: boolean;
    gstIncluded: boolean;
    appointmentID?: string;
  }
  export function buildClientInvoice(state: DemoState, input: CreateClientInvoiceInput, identity: Identity, now: number): Invoice
  export function recordClientInvoice(state: DemoState, invoice: Invoice, identity: Identity, now: number): DemoState
  export function createClientInvoice(state: DemoState, input: CreateClientInvoiceInput, identity: Identity, now: number): { state: DemoState; invoice: Invoice }
  ```

- [ ] **Step 1: Add the type members (no test yet)**

In `src/lib/demo/invoicing.ts`, extend the kind union:
```ts
export type InvoiceKind = "authorisation" | "client-sale" | "service-fee" | "top-up" | "client-invoice";
```
In the same file, add two optional fields to `interface Invoice` (below `totalCreditCents?`):
```ts
  /** Manual client invoice: recorded so the PDF prints the right GST statement. */
  gstIncluded?: boolean;
  /** Links a client invoice raised from a calendar appointment check-out. */
  appointmentID?: string;
```
In `src/lib/demo/types.ts`, add to the `AuditAction` union:
```ts
  | "client_invoice_issued"
```

- [ ] **Step 2: Write the failing test**

```ts
// src/lib/demo/__tests__/client-invoice.test.ts
import { describe, expect, it } from "vitest";
import { BackendError, buildClientInvoice, createClientInvoice } from "../backend";
import { resolveInvoiceKind } from "../invoicing";
import { buildSeedState, SEED_NOW } from "../seed";
import { LUMIERE } from "../accounts";
import { fullName, type DemoState, type Identity, type Patient } from "../types";

const sarahIndependent: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "independent" } };
const sarahClinic: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "clinic", clinic: LUMIERE } };
const ruby: Identity = { user: { id: "u-ruby", name: "Ruby Walsh" }, role: "nurse", context: { kind: "clinic", clinic: LUMIERE } };

function findPatient(state: DemoState, name: string): Patient {
  const p = Object.values(state.patients).find((x) => fullName(x) === name);
  if (!p) throw new Error(`seed patient ${name} missing`);
  return p;
}

const lines = [{ description: "Anti-wrinkle treatment", amountCents: 33000 }];

describe("createClientInvoice", () => {
  it("issues a client-invoice from the OWNING silo, billed to the patient, GST included", () => {
    const state = buildSeedState();
    const claire = findPatient(state, "Claire Donovan"); // nurse:u-sarah owned
    const { state: next, invoice } = createClientInvoice(
      state, { patientID: claire.id, lines, chargeGst: true, gstIncluded: true }, sarahIndependent, SEED_NOW,
    );
    expect(next.invoices.length).toBe(state.invoices.length + 1);
    expect(resolveInvoiceKind(invoice)).toBe("client-invoice");
    expect(invoice.counterpartyType).toBe("client");
    expect(invoice.issuerRef).toEqual({ kind: "nurse", id: "u-sarah" });
    expect(invoice.patientID).toBe(claire.id);
    expect(invoice.billTo?.businessName).toBe("Claire Donovan");
    expect(invoice.doctorID).toBe("");
    expect(invoice.gstIncluded).toBe(true);
    expect(invoice.totalCents).toBe(33000);          // inclusive: total = typed amount
    expect(invoice.gstCents).toBe(Math.round(33000 / 11));
    expect(invoice.lines[0].description).toBe("Anti-wrinkle treatment");
  });

  it("issues from the CLINIC when the patient is clinic-owned (issuer = owner, not operator)", () => {
    const state = buildSeedState();
    const amara = findPatient(state, "Amara Boyd"); // clinic:LUMIERE owned
    const { invoice } = createClientInvoice(
      state, { patientID: amara.id, lines, chargeGst: true, gstIncluded: false }, sarahClinic, SEED_NOW,
    );
    expect(invoice.issuerRef).toEqual({ kind: "clinic", id: LUMIERE.id });
    expect(invoice.totalCents).toBe(33000 + Math.round(33000 * 0.1)); // on-top
    // No service-fee split for the manual tool.
    expect(invoice.kind).toBe("client-invoice");
  });

  it("records the appointment link and a client_invoice_issued audit entry", () => {
    const state = buildSeedState();
    const claire = findPatient(state, "Claire Donovan");
    const { state: next, invoice } = createClientInvoice(
      state, { patientID: claire.id, lines, chargeGst: false, gstIncluded: false, appointmentID: "appt-xyz" }, sarahIndependent, SEED_NOW,
    );
    expect(invoice.appointmentID).toBe("appt-xyz");
    expect(invoice.gstCents).toBe(0);
    expect(Object.values(next.auditLogByID).some((e) => e.action === "client_invoice_issued")).toBe(true);
  });

  it("refuses a viewer with no commercial access and an empty/invalid line set", () => {
    const state = buildSeedState();
    const claire = findPatient(state, "Claire Donovan");
    expect(() => createClientInvoice(state, { patientID: claire.id, lines, chargeGst: false, gstIncluded: false }, ruby, SEED_NOW)).toThrow(BackendError);
    expect(() => createClientInvoice(state, { patientID: claire.id, lines: [], chargeGst: false, gstIncluded: false }, sarahIndependent, SEED_NOW)).toThrow(BackendError);
    expect(() => createClientInvoice(state, { patientID: claire.id, lines: [{ description: " ", amountCents: 100 }], chargeGst: false, gstIncluded: false }, sarahIndependent, SEED_NOW)).toThrow(BackendError);
  });

  it("buildClientInvoice mints an invoice WITHOUT mutating state (live PDF path)", () => {
    const state = buildSeedState();
    const claire = findPatient(state, "Claire Donovan");
    const before = state.invoices.length;
    const invoice = buildClientInvoice(state, { patientID: claire.id, lines, chargeGst: true, gstIncluded: true }, sarahIndependent, SEED_NOW);
    expect(invoice.id).toBeTruthy();
    expect(state.invoices.length).toBe(before); // pure — no append
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/demo/__tests__/client-invoice.test.ts`
Expected: FAIL — `buildClientInvoice`/`createClientInvoice` not exported.

- [ ] **Step 4: Write minimal implementation**

Add to `src/lib/demo/backend.ts` after `createServiceInvoice` (~line 2846). Note `computeManualInvoice` must be imported from `./invoicing` at the top of the file (add it to the existing `import { … } from "./invoicing"` line):

```ts
// --- Manual client invoice (spec: manual client invoicing, 2026-07-24) ---
// A practitioner/clinic hand-types the lines and bills the CLIENT directly. Issuer is the
// OWNING silo (patient.owner) exactly like checkoutClient — the client belongs to that
// book — but there is deliberately NO service-fee split: this interim tool issues one
// client-facing document. Live mode never persists (the store returns buildClientInvoice's
// result for PDF hand-off); demo appends via recordClientInvoice.
export interface CreateClientInvoiceInput {
  patientID: string;
  lines: { description: string; amountCents: number }[];
  chargeGst: boolean;
  gstIncluded: boolean;
  appointmentID?: string;
}

export function buildClientInvoice(state: DemoState, input: CreateClientInvoiceInput, identity: Identity, now: number): Invoice {
  const patient = state.patients[input.patientID];
  if (!patient) throw new BackendError("notFound");
  if (patientAccessLevel(state, identity, patient) === "none") throw new BackendError("notPermitted");
  if (input.lines.length === 0) throw new BackendError("validationFailed");
  const manualLines = input.lines.map((line, i) => {
    if (!line.description.trim()) throw new BackendError("validationFailed");
    if (!Number.isInteger(line.amountCents) || line.amountCents <= 0) throw new BackendError("validationFailed");
    return { id: `${makeID("cil")}-${i}`, description: line.description.trim(), amountCents: line.amountCents };
  });
  const computed = computeManualInvoice(manualLines, { chargeGst: input.chargeGst, gstIncluded: input.gstIncluded });
  return {
    id: makeID("inv"),
    doctorID: "",
    counterpartyID: patient.id,
    counterpartyType: "client",
    periodLabel: isoDay(now),
    ...computed,
    authorisationIDs: [],
    createdAt: now,
    paid: false,
    kind: "client-invoice",
    issuerRef: patient.owner,
    patientID: patient.id,
    gstIncluded: input.chargeGst ? input.gstIncluded : undefined,
    ...(input.appointmentID ? { appointmentID: input.appointmentID } : {}),
    issuer: issuerPartyFor(state, patient.owner),
    billTo: clientBillTo(patient),
  };
}

export function recordClientInvoice(state: DemoState, invoice: Invoice, identity: Identity, now: number): DemoState {
  return appendAuditEntry(
    { ...state, invoices: [...state.invoices, invoice] },
    {
      actor: identity,
      action: "client_invoice_issued",
      targetType: "invoice",
      targetID: invoice.id,
      summary: `client invoice ${formatAUD(invoice.totalCents)} · ${ownerDisplayLabel(state, invoice.issuerRef!)}`,
    },
    now,
  );
}

export function createClientInvoice(state: DemoState, input: CreateClientInvoiceInput, identity: Identity, now: number): { state: DemoState; invoice: Invoice } {
  const invoice = buildClientInvoice(state, input, identity, now);
  return { state: recordClientInvoice(state, invoice, identity, now), invoice };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/demo/__tests__/client-invoice.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/demo/invoicing.ts src/lib/demo/types.ts src/lib/demo/backend.ts src/lib/demo/__tests__/client-invoice.test.ts
git commit -m "feat(invoice): createClientInvoice reducer + client-invoice kind"
```

---

### Task 3: Conditional GST statement on the tax-invoice PDF

**Files:**
- Modify: `src/lib/demo/invoicePdf.ts` (`TaxInvoiceModel` type; `buildTaxInvoiceModel` ~line 77-120; render ~line 305-307)
- Test: `src/lib/demo/__tests__/invoice-pdf-gst-statement.test.ts` (create)

**Interfaces:**
- Consumes: `Invoice`, `InvoiceParty`, `resolveInvoiceKind`.
- Produces: `TaxInvoiceModel.taxStatement: string | null` on the model returned by `buildTaxInvoiceModel`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/demo/__tests__/invoice-pdf-gst-statement.test.ts
import { describe, expect, it } from "vitest";
import { buildTaxInvoiceModel } from "../invoicePdf";
import type { Invoice } from "../invoicing";
import type { InvoiceParty } from "../invoicing";

const issuer: InvoiceParty = { businessName: "Voss Aesthetics", abn: "51824753556", email: "" };
const billTo: InvoiceParty = { businessName: "Claire Donovan", abn: "", email: "" };

function invoice(gstCents: number): Invoice {
  return {
    id: "inv-1", doctorID: "", counterpartyID: "p1", counterpartyType: "client",
    periodLabel: "2026-07-24",
    lines: [{ authorisationID: "l1", dateISO: "", patientName: "", feeCents: 10000, gstCents, description: "Treatment", qty: 1, unitCents: 10000 }],
    subtotalCents: 10000, gstCents, totalCents: 10000 + gstCents, authorisationIDs: [],
    createdAt: 0, paid: false, kind: "client-invoice",
  };
}

describe("buildTaxInvoiceModel — GST statement", () => {
  it("states the total includes GST when GST is charged", () => {
    expect(buildTaxInvoiceModel(invoice(1000), issuer, billTo).taxStatement).toBe("The total price includes GST.");
  });
  it("omits the statement when no GST is charged", () => {
    expect(buildTaxInvoiceModel(invoice(0), issuer, billTo).taxStatement).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/demo/__tests__/invoice-pdf-gst-statement.test.ts`
Expected: FAIL — `taxStatement` is `undefined`, not the expected string / null.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/demo/invoicePdf.ts`:

1. Add `taxStatement: string | null;` to the `TaxInvoiceModel` type (beside `totalText`).
2. In `buildTaxInvoiceModel`'s returned object, add:
```ts
    // Only assert GST when some was charged — a no-GST invoice must not claim registration.
    taxStatement: invoice.gstCents > 0 ? "The total price includes GST." : null,
```
3. Replace the hardcoded render at lines 305-307:
```ts
  // The Example 2 taxable-sale statement (requirement 7) — only when GST applies.
  if (model.taxStatement) {
    writer.setY(writer.currentY() + 14);
    writer.text(model.taxStatement, 10, INK);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/demo/__tests__/invoice-pdf-gst-statement.test.ts`
Expected: PASS (2 tests). Also run the existing PDF suite to confirm no regression:
`npx vitest run src/lib/demo/__tests__/invoice-pdf-matrix.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/demo/invoicePdf.ts src/lib/demo/__tests__/invoice-pdf-gst-statement.test.ts
git commit -m "feat(invoice): print the GST statement only when GST is charged"
```

---

### Task 4: Extract `InvoiceActions` into a shared component

**Files:**
- Create: `src/components/app/InvoiceActions.tsx`
- Modify: `src/app/app/billing/page.tsx` (remove the local `InvoiceActions` function ~line 734-806; import the new module)

**Interfaces:**
- Produces: `export function InvoiceActions({ invoice }: { invoice: Invoice }): JSX.Element`
- Consumes: existing `invoicePartiesFor`, `buildTaxInvoiceModel`, `renderTaxInvoicePdf`, `taxInvoicePdfFilename`, `invoiceNumber`, `invoiceEmail`, `INVOICE_ATTACH_NOTE`, `shareOrMailFile`, `formatAUD`, `useDemoStore`.

- [ ] **Step 1: Create the module by moving the code verbatim**

Create `src/components/app/InvoiceActions.tsx` with `"use client";` at the top, the imports the function needs, and the `InvoiceActions` function **exactly as it currently reads** in `billing/page.tsx` (lines 734-806), exported. Imports to include:
```ts
"use client";
import { useState } from "react";
import { useDemoStore } from "@/lib/demo/store";
import { invoicePartiesFor } from "@/lib/demo/backend";
import { formatAUD, type Invoice } from "@/lib/demo/invoicing";
import { buildTaxInvoiceModel, invoiceNumber, renderTaxInvoicePdf, taxInvoicePdfFilename } from "@/lib/demo/invoicePdf";
import { invoiceEmail, INVOICE_ATTACH_NOTE } from "@/lib/demo/invoiceEmail";
import { shareOrMailFile } from "@/lib/shareFile";
```

- [ ] **Step 2: Wire the billing page to the shared module**

In `src/app/app/billing/page.tsx`: delete the local `function InvoiceActions(…) { … }` (lines ~734-806) and add to the imports:
```ts
import { InvoiceActions } from "@/components/app/InvoiceActions";
```
Remove now-unused imports from `billing/page.tsx` **only if** nothing else in the file uses them (check `renderTaxInvoicePdf`, `taxInvoicePdfFilename`, `invoiceEmail`, `INVOICE_ATTACH_NOTE`, `shareOrMailFile`, `buildTaxInvoiceModel` — leave `invoiceNumber`/`invoicePartiesFor`/`formatAUD` which are used elsewhere in the page).

- [ ] **Step 3: Run the existing billing tests to verify no behavior change**

Run: `npx vitest run src/app/app/billing/__tests__/ src/components/app/__tests__/billing-service-invoice.test.tsx`
Expected: PASS (unchanged). Also typecheck: `npx tsc --noEmit`.

- [ ] **Step 4: Commit**

```bash
git add src/components/app/InvoiceActions.tsx src/app/app/billing/page.tsx
git commit -m "refactor(invoice): extract InvoiceActions into a shared component"
```

---

### Task 5: `ClientInvoiceComposer` component + store wiring

**Files:**
- Create: `src/components/app/ClientInvoiceComposer.tsx`
- Modify: `src/lib/demo/store.tsx` (interface ~line 144; implementation ~line 455)
- Test: `src/components/app/__tests__/client-invoice-composer.test.tsx` (create)

**Interfaces:**
- Consumes: `store.createClientInvoice`, `store.patientAccess`, `computeManualInvoice`, `InvoiceActions` (Task 4), `formatAUD`, `GST_RATE`.
- Produces:
  - Store: `createClientInvoice: (input: import("./backend").CreateClientInvoiceInput, identity: Identity) => import("./invoicing").Invoice`
  - Component: `export function ClientInvoiceComposer({ patient, appointmentID, onIssued }: { patient: Patient; appointmentID?: string; onIssued?: (invoice: Invoice) => void }): JSX.Element | null`

- [ ] **Step 1: Add the store method (interface + impl)**

In `src/lib/demo/store.tsx` interface (near `createServiceInvoice`, ~line 144):
```ts
  createClientInvoice: (input: import("./backend").CreateClientInvoiceInput, identity: Identity) => import("./invoicing").Invoice;
```
In the implementation object (near `createServiceInvoice`, ~line 451). Build once (eager-validate + stable id), persist that exact invoice in demo, return it either way:
```ts
      createClientInvoice: (input, id) => {
        const now = writeNow();
        const invoice = backend.buildClientInvoice(state, input, id, now); // throws on bad input/access
        if (!live) setState((s) => backend.recordClientInvoice(s, invoice, id, now));
        return invoice; // both modes: hand back for the PDF (live never persists yet)
      },
```

- [ ] **Step 2: Write the failing test**

```tsx
// src/components/app/__tests__/client-invoice-composer.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useSyncExternalStore } from "react";
import * as backend from "@/lib/demo/backend";
import { patientAccessLevel } from "@/lib/demo/isolation";
import { buildSeedState, SEED_NOW } from "@/lib/demo/seed";
import { fullName, type DemoState, type Identity, type Patient } from "@/lib/demo/types";

let demoState: DemoState = buildSeedState();
const listeners = new Set<() => void>();
function applyState(u: (s: DemoState) => DemoState) { demoState = u(demoState); for (const l of listeners) l(); }

const sarahIndependent: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "independent" } };
let currentIdentity: Identity = sarahIndependent;

vi.mock("@/lib/demo/auth", () => ({ useDemoAuth: () => ({ identity: currentIdentity, availableIdentities: [] }) }));
vi.mock("@/lib/demo/store", () => ({
  useDemoStore: () => {
    const state = useSyncExternalStore((cb: () => void) => { listeners.add(cb); return () => listeners.delete(cb); }, () => demoState);
    return {
      state, now: SEED_NOW, status: "demo" as const,
      patientAccess: (p: Patient, id: Identity) => patientAccessLevel(state, id, p),
      createClientInvoice: (input: backend.CreateClientInvoiceInput, id: Identity) => {
        const invoice = backend.buildClientInvoice(state, input, id, SEED_NOW);
        applyState((s) => backend.recordClientInvoice(s, invoice, id, SEED_NOW));
        return invoice;
      },
    };
  },
}));

import { ClientInvoiceComposer } from "@/components/app/ClientInvoiceComposer";

function findPatient(name: string): Patient {
  const p = Object.values(demoState.patients).find((x) => fullName(x) === name);
  if (!p) throw new Error(`seed patient ${name} missing`);
  return p;
}

beforeEach(() => { currentIdentity = sarahIndependent; demoState = buildSeedState(); });

describe("ClientInvoiceComposer", () => {
  it("issues a GST-included client invoice from a typed line and shows PDF actions", async () => {
    const claire = findPatient("Claire Donovan");
    render(<ClientInvoiceComposer patient={claire} />);
    await userEvent.type(screen.getByLabelText("Line 1 description"), "Anti-wrinkle treatment");
    await userEvent.type(screen.getByLabelText("Line 1 amount"), "330");
    // Defaults: charge GST on, prices include GST → total 330, GST = round(33000/11).
    expect(screen.getByText("$330.00")).toBeInTheDocument();
    expect(screen.getByText("$30.00")).toBeInTheDocument(); // GST

    const before = demoState.invoices.length;
    await userEvent.click(screen.getByRole("button", { name: "Issue invoice" }));
    expect(demoState.invoices.length).toBe(before + 1);
    const inv = demoState.invoices[demoState.invoices.length - 1];
    expect(inv.kind).toBe("client-invoice");
    expect(inv.totalCents).toBe(33000);
    // PDF hand-off actions appear after issue.
    expect(screen.getByRole("button", { name: /download pdf/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /email invoice/i })).toBeInTheDocument();
  });

  it("toggling GST off drops the GST line and lowers the total-on-top case", async () => {
    const claire = findPatient("Claire Donovan");
    render(<ClientInvoiceComposer patient={claire} />);
    await userEvent.type(screen.getByLabelText("Line 1 description"), "Consult");
    await userEvent.type(screen.getByLabelText("Line 1 amount"), "100");
    await userEvent.click(screen.getByLabelText(/charge gst/i)); // turn OFF
    await userEvent.click(screen.getByRole("button", { name: "Issue invoice" }));
    const inv = demoState.invoices[demoState.invoices.length - 1];
    expect(inv.gstCents).toBe(0);
    expect(inv.totalCents).toBe(10000);
    expect(inv.gstIncluded).toBeUndefined();
  });

  it("renders nothing without commercial access to the patient", () => {
    // Amara Boyd is clinic-owned; Sarah's INDEPENDENT identity has no reach.
    const amara = findPatient("Amara Boyd");
    const { container } = render(<ClientInvoiceComposer patient={amara} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/components/app/__tests__/client-invoice-composer.test.tsx`
Expected: FAIL — cannot resolve `ClientInvoiceComposer`.

- [ ] **Step 4: Write the component**

Create `src/components/app/ClientInvoiceComposer.tsx`, modeled on `ServiceInvoiceComposer` (monotonic line keys) but billing the patient with GST toggles and, after issue, the shared `InvoiceActions`:

```tsx
"use client";

import { useState } from "react";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { computeManualInvoice, formatAUD, type Invoice } from "@/lib/demo/invoicing";
import { InvoiceActions } from "@/components/app/InvoiceActions";
import type { Patient } from "@/lib/demo/types";

interface DraftLine { key: number; description: string; amount: string; }
let nextLineKey = 1;
const emptyLine = (): DraftLine => ({ key: nextLineKey++, description: "", amount: "" });

// "330" / "1,000.50" → integer cents, or null when unparseable/non-positive.
function centsOf(amount: string): number | null {
  const dollars = Number(amount.replace(/,/g, "").trim());
  if (!Number.isFinite(dollars) || dollars <= 0) return null;
  return Math.round(dollars * 100);
}

const CELL = "py-1.5 px-2";
const NUM_CELL = "border-l border-line py-1.5 px-2 text-right";

// Manual client invoice (spec: manual client invoicing, 2026-07-24): a practitioner/clinic
// hand-types each line and bills the CLIENT. Two GST toggles pick the convention. Demo
// persists + returns the invoice; live returns a transient one — either way the PDF actions
// hand it to the practitioner's mail app / downloads. Renders nothing without access.
export function ClientInvoiceComposer({ patient, appointmentID, onIssued }: {
  patient: Patient; appointmentID?: string; onIssued?: (invoice: Invoice) => void;
}) {
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  const [lines, setLines] = useState<DraftLine[]>(() => [emptyLine()]);
  const [chargeGst, setChargeGst] = useState(true);
  const [gstIncluded, setGstIncluded] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<Invoice | null>(null);

  if (!identity) return null;
  if (store.patientAccess(patient, identity) === "none") return null;

  const parsed = lines.map((l) => ({ description: l.description.trim(), cents: centsOf(l.amount) }));
  const previewable = parsed.filter((l) => l.cents !== null) as { description: string; cents: number }[];
  const preview = previewable.length > 0
    ? computeManualInvoice(previewable.map((l, i) => ({ id: `p${i}`, description: l.description, amountCents: l.cents })), { chargeGst, gstIncluded })
    : null;

  function patch(index: number, p: Partial<DraftLine>) {
    setIssued(null); setError(null);
    setLines((rows) => rows.map((row, i) => (i === index ? { ...row, ...p } : row)));
  }

  function issue() {
    setError(null); setIssued(null);
    const out: { description: string; amountCents: number }[] = [];
    for (let i = 0; i < parsed.length; i++) {
      if (!parsed[i].description || parsed[i].cents === null) {
        setError(`Complete line ${i + 1} — a description and a positive amount.`);
        return;
      }
      out.push({ description: parsed[i].description, amountCents: parsed[i].cents! });
    }
    try {
      const invoice = store.createClientInvoice({ patientID: patient.id, lines: out, chargeGst, gstIncluded, appointmentID }, identity!);
      setLines([emptyLine()]);
      setIssued(invoice);
      onIssued?.(invoice);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not issue the invoice");
    }
  }

  return (
    <div className="rounded-card border border-line bg-card p-5 shadow-card">
      <div className="flex flex-col gap-2">
        {lines.map((line, i) => (
          <div key={line.key} className="grid grid-cols-1 gap-2 rounded-field border border-line p-2.5 sm:grid-cols-[2fr_1fr_auto]">
            <input value={line.description} placeholder="Description of services" aria-label={`Line ${i + 1} description`}
              onChange={(e) => patch(i, { description: e.target.value })}
              className="rounded-field border border-line bg-card px-2.5 py-1.5 text-sm text-ink outline-none focus:border-tint" />
            <input value={line.amount} placeholder="Price" inputMode="decimal" aria-label={`Line ${i + 1} amount`}
              onChange={(e) => patch(i, { amount: e.target.value })}
              className="rounded-field border border-line bg-card px-2.5 py-1.5 text-sm text-ink outline-none focus:border-tint" />
            <button type="button" onClick={() => setLines((rows) => rows.filter((_, j) => j !== i))} disabled={lines.length <= 1}
              className="text-sm text-ink-soft hover:text-ink disabled:opacity-40">Remove</button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => setLines((rows) => [...rows, emptyLine()])}
        className="mt-2 rounded-btn border border-line px-3 py-1 text-sm text-ink-soft hover:border-tint/50">Add line</button>

      <div className="mt-3 flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={chargeGst} onChange={(e) => { setChargeGst(e.target.checked); setIssued(null); }}
            style={{ accentColor: "var(--color-tint)" }} />
          Charge GST (10%)
        </label>
        {chargeGst && (
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={gstIncluded} onChange={(e) => { setGstIncluded(e.target.checked); setIssued(null); }}
              style={{ accentColor: "var(--color-tint)" }} />
            Prices include GST (总价含 GST)
          </label>
        )}
      </div>

      {preview && (
        <div className="mt-3 overflow-x-auto rounded-inner border border-line">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-line text-left">
                <th className={`${CELL} font-medium text-ink-soft`}>Description</th>
                <th className={`${NUM_CELL} font-medium text-ink-soft`}>Unit</th>
                <th className={`${NUM_CELL} font-medium text-ink-soft`}>GST</th>
                <th className={`${NUM_CELL} font-medium text-ink-soft`}>Total</th>
              </tr>
            </thead>
            <tbody>
              {preview.lines.map((l) => (
                <tr key={l.authorisationID} className="border-b border-line">
                  <td className={`${CELL} text-ink`}>{l.description}</td>
                  <td className={`${NUM_CELL} text-ink-soft`}>{formatAUD(l.unitCents ?? l.feeCents)}</td>
                  <td className={`${NUM_CELL} text-ink-soft`}>{formatAUD(l.gstCents)}</td>
                  <td className={`${NUM_CELL} text-ink`}>{formatAUD(l.feeCents + l.gstCents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan={2} /><td className={`${CELL} text-right text-ink-soft`}>Subtotal</td><td className={`${NUM_CELL} text-ink-soft`}>{formatAUD(preview.subtotalCents)}</td></tr>
              <tr><td colSpan={2} /><td className="py-0.5 px-2 text-right text-ink-soft">GST</td><td className="border-l border-line py-0.5 px-2 text-right text-ink-soft">{formatAUD(preview.gstCents)}</td></tr>
              <tr className="border-t-2 border-line"><td colSpan={2} /><td className={`${CELL} text-right font-medium text-ink`}>Total</td><td className={`${NUM_CELL} font-medium text-ink`}>{formatAUD(preview.totalCents)}</td></tr>
            </tfoot>
          </table>
        </div>
      )}

      {error && <p className="mt-2 text-sm" style={{ color: "var(--color-rose)" }}>{error}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={issue} className="rounded-btn px-4 py-2 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>
          Issue invoice
        </button>
        {issued && (
          <>
            <span className="text-sm" style={{ color: "var(--color-umber)" }}>Invoice issued — {formatAUD(issued.totalCents)}.</span>
            <InvoiceActions invoice={issued} />
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/app/__tests__/client-invoice-composer.test.tsx`
Expected: PASS (3 tests). Typecheck: `npx tsc --noEmit`.

- [ ] **Step 6: Commit**

```bash
git add src/components/app/ClientInvoiceComposer.tsx src/lib/demo/store.tsx src/components/app/__tests__/client-invoice-composer.test.tsx
git commit -m "feat(invoice): manual client-invoice composer + store wiring"
```

---

### Task 6: Patient-file "Invoice client" section + appointment-history link

**Files:**
- Modify: `src/app/app/patients/[id]/page.tsx` (import + section near `PatientAccountSection` ~line 304; appointment-history rows ~line 416-423)
- Test: `src/app/app/patients/[id]/__tests__/client-invoice-patient-file.test.tsx` (create — mirror the store-mock harness from `collaborator-access.test.tsx`)

**Interfaces:**
- Consumes: `ClientInvoiceComposer` (Task 5), `InvoiceActions` (Task 4); `store.state.invoices`, `store.patientAccess`, `resolveInvoiceKind`, `formatAUD`.
- Produces: an "Invoice client" section (both modes) and, in demo, an issued-invoice list + an "Invoiced" marker on linked appointment-history rows.

- [ ] **Step 1: Write the failing test**

Create `src/app/app/patients/[id]/__tests__/client-invoice-patient-file.test.tsx`. Reuse the store-mock pattern from the sibling `collaborator-access.test.tsx` (open it and copy its `vi.mock` scaffolding for `next/navigation`, `@/lib/demo/auth`, `@/lib/demo/store`, and its param plumbing), then add:

```tsx
// (after the shared harness) — an owner sees the composer and, after issuing, the invoice list.
it("shows the Invoice client section and lists an issued client invoice", async () => {
  const claire = findPatient("Claire Donovan"); // owned by sarahIndependent
  currentIdentity = sarahIndependent;
  renderPatient(claire.id);
  const section = screen.getByRole("heading", { name: "Invoice client" }).closest("section")!;
  await userEvent.type(within(section).getByLabelText("Line 1 description"), "Dermal filler");
  await userEvent.type(within(section).getByLabelText("Line 1 amount"), "500");
  await userEvent.click(within(section).getByRole("button", { name: "Issue invoice" }));
  expect(demoState.invoices.some((i) => i.kind === "client-invoice")).toBe(true);
  // The per-patient issued list shows it.
  expect(within(section).getByText(/INV-/)).toBeInTheDocument();
});
```

(Provide `renderPatient(id)` and `findPatient` helpers in the harness, matching how `collaborator-access.test.tsx` renders the page with a route param.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/app/patients/\[id\]/__tests__/client-invoice-patient-file.test.tsx`
Expected: FAIL — no "Invoice client" heading.

- [ ] **Step 3: Implement the section**

In `src/app/app/patients/[id]/page.tsx`:

1. Add imports:
```ts
import { ClientInvoiceComposer } from "@/components/app/ClientInvoiceComposer";
import { InvoiceActions } from "@/components/app/InvoiceActions";
import { resolveInvoiceKind } from "@/lib/demo/invoicing";
```
2. Immediately before/after `<PatientAccountSection patient={patient} />` (~line 304), add a new section that renders for any viewer with commercial access. `ClientInvoiceComposer` self-guards (returns null without access), so gating the heading on the same check keeps them consistent:
```tsx
{store.patientAccess(patient, identity) !== "none" && (
  <section className="mt-8">
    <h2 className="font-display text-xl text-ink">Invoice client</h2>
    <p className="mt-1 text-sm text-ink-soft">Type each line and price, choose GST, then generate a tax invoice.</p>
    <div className="mt-3">
      <ClientInvoiceComposer patient={patient} />
    </div>
    {/* Demo persists issued client invoices; live hands off the PDF only. */}
    {store.status === "demo" && (() => {
      const issued = store.state.invoices.filter((i) => resolveInvoiceKind(i) === "client-invoice" && i.patientID === patient.id);
      return issued.length === 0 ? null : (
        <ul className="mt-3 flex flex-col gap-1.5">
          {issued.map((inv) => (
            <li key={inv.id} className="flex items-center justify-between gap-3 rounded-inner border border-line bg-card px-4 py-3">
              <span className="text-sm text-ink">{inv.periodLabel} · <span className="font-medium">{formatAUD(inv.totalCents)}</span></span>
              <InvoiceActions invoice={inv} />
            </li>
          ))}
        </ul>
      );
    })()}
  </section>
)}
```
(Ensure `formatAUD` is imported in this file — it already imports from `@/lib/demo/invoicing` for other totals; add it if missing.)
3. In the appointment-history list (~line 416-423), mark rows whose appointment has a client invoice. Just above the `.map`, derive a set:
```ts
const invoicedApptIDs = new Set(
  store.state.invoices.filter((i) => resolveInvoiceKind(i) === "client-invoice" && i.appointmentID).map((i) => i.appointmentID!),
);
```
and inside the row, beside the status:
```tsx
{invoicedApptIDs.has(a.id) && <span className="micro flex-none rounded-full border border-line px-2 py-0.5 text-ink-soft">Invoiced</span>}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/app/patients/\[id\]/__tests__/client-invoice-patient-file.test.tsx`
Expected: PASS. Typecheck: `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/app/patients/[id]/page.tsx" "src/app/app/patients/[id]/__tests__/client-invoice-patient-file.test.tsx"
git commit -m "feat(invoice): Invoice client section + invoiced marker on appointment history"
```

---

### Task 7: Calendar appointment check-out

**Files:**
- Modify: `src/app/app/calendar/page.tsx` (`AppointmentActions`, ~line 1238-1316)
- Test: `src/app/app/calendar/__tests__/calendar-checkout.test.tsx` (create — mirror the harness in `calendar-page.test.tsx`)

**Interfaces:**
- Consumes: `ClientInvoiceComposer` (Task 5); existing `store.state.patients`, `appt.patientID`, `appt.appointmentNote`.
- Produces: a "Check out" control in the appointment detail modal that reveals the composer prefilled with the appointment's patient + `appointmentID`.

- [ ] **Step 1: Write the failing test**

Create `src/app/app/calendar/__tests__/calendar-checkout.test.tsx`. Open `calendar-page.test.tsx` first and reuse its `vi.mock` harness (store/auth/navigation) and its way of seeding an appointment with a patient for the active owner, then:

```tsx
it("checks out an appointment: opens the composer prefilled and links the issued invoice", async () => {
  // (harness seeds a treatment appointment `appt` for Claire on the owner's calendar today)
  renderCalendarOnDay(appt.dateISO);
  await userEvent.click(screen.getByRole("button", { name: new RegExp(appt.patientName!, "i") })); // open detail
  await userEvent.click(screen.getByRole("button", { name: /check out/i }));
  await userEvent.type(screen.getByLabelText("Line 1 description"), "Treatment");
  await userEvent.type(screen.getByLabelText("Line 1 amount"), "200");
  await userEvent.click(screen.getByRole("button", { name: "Issue invoice" }));
  const inv = demoState.invoices.find((i) => i.kind === "client-invoice");
  expect(inv).toBeTruthy();
  expect(inv!.appointmentID).toBe(appt.id);
  expect(inv!.patientID).toBe(appt.patientID);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/app/calendar/__tests__/calendar-checkout.test.tsx`
Expected: FAIL — no "Check out" button.

- [ ] **Step 3: Implement the check-out control**

In `src/app/app/calendar/page.tsx`, import the composer:
```ts
import { ClientInvoiceComposer } from "@/components/app/ClientInvoiceComposer";
```
In `AppointmentActions`, add local state and a button + inline composer. The patient must exist in state:
```tsx
const [checkingOut, setCheckingOut] = useState(false);
const patient = appt.patientID ? store.state.patients[appt.patientID] : undefined;
```
Render a "Check out" button when `patient` exists and the viewer can manage (`canManage`), e.g. inside the actions row:
```tsx
{patient && canManage && (
  <button type="button" onClick={() => setCheckingOut((v) => !v)}
    className="rounded-btn border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-tint">
    {checkingOut ? "Hide check out" : "Check out"}
  </button>
)}
```
Below the actions row, when `checkingOut && patient`, render the composer prefilled and dismissing on issue:
```tsx
{checkingOut && patient && (
  <div className="mt-3 border-t border-line pt-3">
    <ClientInvoiceComposer patient={patient} appointmentID={appt.id} onIssued={() => setCheckingOut(false)} />
  </div>
)}
```
(Seed the first line from `appt.appointmentNote` is optional — the composer starts empty; leave the note out to keep the composer's internal state self-contained, or add a `seedDescription?` prop later. Not required for the test.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/app/calendar/__tests__/calendar-checkout.test.tsx`
Expected: PASS. Also run `npx vitest run src/app/app/calendar/__tests__/calendar-page.test.tsx` to confirm no regression. Typecheck: `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/app/app/calendar/page.tsx src/app/app/calendar/__tests__/calendar-checkout.test.tsx
git commit -m "feat(calendar): check out an appointment to generate a client invoice"
```

---

### Task 8: Treatment blocks on the calendar

**Files:**
- Modify: `src/lib/demo/backend.ts` (add selector near `treatmentAvailabilityForOwner`, ~line 1262)
- Modify: `src/lib/demo/store.tsx` (interface + impl near `treatmentAvailabilityForOwner`)
- Modify: `src/app/app/calendar/page.tsx` (`BlockedBands` component + render in `DayTimeline` and the `WeekView` day columns, beside `<BusyBlocks>`)
- Test: `src/lib/demo/__tests__/treatment-blocks-calendar.test.ts` (create)

**Interfaces:**
- Consumes: `treatmentAvailabilityForOwner`, `TreatmentBlock`.
- Produces:
  ```ts
  export function treatmentBlocksForOwnerOnDay(state: DemoState, ownerID: string, dateISO: string): TreatmentBlock[]
  ```
  Store: `treatmentBlocksForOwnerOnDay: (ownerID: string, dateISO: string) => import("./types").TreatmentBlock[]`

- [ ] **Step 1: Write the failing test (selector)**

```ts
// src/lib/demo/__tests__/treatment-blocks-calendar.test.ts
import { describe, expect, it } from "vitest";
import { addTreatmentBlock, treatmentBlocksForOwnerOnDay } from "../backend";
import { buildSeedState } from "../seed";

describe("treatmentBlocksForOwnerOnDay", () => {
  it("returns only the owner's blocks on the given day", () => {
    const seeded = buildSeedState();
    const owner = "u-voss";
    const { state } = addTreatmentBlock(seeded, owner, { dateISO: "2026-07-24", startMinute: 720, endMinute: 780 });
    const { state: state2 } = addTreatmentBlock(state, owner, { dateISO: "2026-07-25", startMinute: 600, endMinute: 660 });
    const today = treatmentBlocksForOwnerOnDay(state2, owner, "2026-07-24");
    expect(today).toHaveLength(1);
    expect(today[0].startMinute).toBe(720);
    expect(treatmentBlocksForOwnerOnDay(state2, "u-other", "2026-07-24")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/demo/__tests__/treatment-blocks-calendar.test.ts`
Expected: FAIL — `treatmentBlocksForOwnerOnDay` not exported.

- [ ] **Step 3: Implement the selector + store expose**

In `src/lib/demo/backend.ts`, after `treatmentAvailabilityForOwner`:
```ts
// Treatment blocks for one owner on one day — the calendar renders these as busy bands
// (2026-07-24: Availability blocks now sync to the calendar view).
export function treatmentBlocksForOwnerOnDay(state: DemoState, ownerID: string, dateISO: string): TreatmentBlock[] {
  return treatmentAvailabilityForOwner(state, ownerID).blocks.filter((b) => b.dateISO === dateISO);
}
```
In `src/lib/demo/store.tsx`, add to the interface and implementation (near `treatmentAvailabilityForOwner`):
```ts
  treatmentBlocksForOwnerOnDay: (ownerID: string, dateISO: string) => import("./types").TreatmentBlock[];
```
```ts
      treatmentBlocksForOwnerOnDay: (ownerID, dateISO) => backend.treatmentBlocksForOwnerOnDay(state, ownerID, dateISO),
```

- [ ] **Step 4: Run selector test to verify it passes**

Run: `npx vitest run src/lib/demo/__tests__/treatment-blocks-calendar.test.ts`
Expected: PASS.

- [ ] **Step 5: Add `BlockedBands` and render it**

In `src/app/app/calendar/page.tsx`, add a component beside `BusyBlocks` (reuse the same geometry constants `WIN_START`, `WIN_END`, `PX_PER_MIN`, `TEXT_MIN_PX`):
```tsx
// Availability treatment blocks as muted, non-interactive bands (2026-07-24: blocks added
// under Availability → Treatment now show on the calendar). Solid muted fill distinguishes
// them from the external-calendar "Busy" hatch; pointer-events-none so empty-slot taps pass through.
function BlockedBands({ ownerID, dateISO }: { ownerID: string; dateISO: string }) {
  const store = useDemoStore();
  const blocks = store.treatmentBlocksForOwnerOnDay(ownerID, dateISO)
    .map((b) => ({ start: Math.max(b.startMinute, WIN_START), end: Math.min(b.endMinute, WIN_END) }))
    .filter((b) => b.end > b.start);
  if (blocks.length === 0) return null;
  return (
    <>
      {blocks.map((b) => {
        const height = (b.end - b.start) * PX_PER_MIN;
        return (
          <div key={`${b.start}-${b.end}`} aria-hidden
            className="pointer-events-none absolute inset-x-0 overflow-hidden rounded-[6px]"
            style={{ top: (b.start - WIN_START) * PX_PER_MIN, height, background: "var(--color-paper-deep)", border: "1px solid var(--color-line)" }}>
            {height >= TEXT_MIN_PX && <span className="micro block px-1.5 pt-0.5 text-ink-faint">Blocked</span>}
          </div>
        );
      })}
    </>
  );
}
```
Render it right after each `<BusyBlocks ownerID=… dateISO=… />` — one in `DayTimeline` (~line 323) and one in the `WeekView` day columns (~line 872):
```tsx
<BusyBlocks ownerID={ownerID} dateISO={dateISO} />
<BlockedBands ownerID={ownerID} dateISO={dateISO} />
```
(In `WeekView` the day loop variable is `iso`, so use `dateISO={iso}` there.)

- [ ] **Step 6: Write + run the render test**

Add to `src/app/app/calendar/__tests__/calendar-checkout.test.tsx` (or a new render test in the calendar `__tests__`) a case that seeds a block via `addTreatmentBlock` for the owner on the shown day and asserts a "Blocked" band renders:
```tsx
it("renders an Availability treatment block as a busy band on the calendar", () => {
  demoState = addTreatmentBlock(demoState, ownerID, { dateISO: shownISO, startMinute: 600, endMinute: 660 }).state;
  renderCalendarOnDay(shownISO);
  expect(screen.getByText("Blocked")).toBeInTheDocument();
});
```
Run: `npx vitest run src/app/app/calendar/__tests__/`
Expected: PASS. Typecheck: `npx tsc --noEmit`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/demo/backend.ts src/lib/demo/store.tsx src/app/app/calendar/page.tsx src/lib/demo/__tests__/treatment-blocks-calendar.test.ts src/app/app/calendar/__tests__/calendar-checkout.test.tsx
git commit -m "feat(calendar): render Availability treatment blocks as busy bands"
```

---

### Task 9: Full-suite verification + browser check

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: PASS (no regressions across billing, calendar, checkout, PDF suites).

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 3: Manual browser check (demo)**

Start the `web` dev server (worktree config — the `web-demo` config cds to the main checkout and would serve stale code), open `/app`, and verify:
1. Patient file → "Invoice client": type a line + price, toggle GST, Issue → Download/Email appear; the invoice shows in the per-patient list; the linked appointment shows "Invoiced".
2. Calendar → open an appointment with a patient → "Check out" → issue → invoice links to the appointment.
3. Availability → Treatment → add a Blocked time → Calendar shows a "Blocked" band on that day/week.

- [ ] **Step 4: Commit any fixes, then finalize**

```bash
git add -A && git commit -m "test: full-suite verification for client invoicing + calendar blocks"
```

## Self-Review

- **Spec coverage:** A1 → Task 1; A2 types → Task 2; A2 PDF statement → Task 3; A3 reducer/store → Tasks 2 & 5; A4 composer → Task 5 (InvoiceActions extraction → Task 4); A5 patient file → Task 6; A6 calendar check-out → Task 7; Feature B → Task 8; testing/verification → Task 9. All covered.
- **Placeholder scan:** every code step has concrete code; test/harness reuse points name the exact sibling file to copy from.
- **Type consistency:** `CreateClientInvoiceInput`, `buildClientInvoice`, `recordClientInvoice`, `createClientInvoice`, `computeManualInvoice`, `ManualLineInput`, `ManualGstOptions`, `treatmentBlocksForOwnerOnDay`, `taxStatement`, and the new `Invoice` fields (`gstIncluded`, `appointmentID`) / `InvoiceKind` `"client-invoice"` / `AuditAction` `"client_invoice_issued"` are used identically across tasks.

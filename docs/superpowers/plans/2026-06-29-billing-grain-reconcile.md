# Billing Grain Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the billing dashboard count un-invoiced authorisations (line items) instead of `billingEvents` (per approved request), so the count matches invoicing and decrements as invoices are generated; remove the now-redundant web `billingEvents`/`ledger` read path.

**Architecture:** Re-point `billingSummary` at `state.authorisations` (filter `!invoiced`, derive counterparty/month), keep the same role scoping/grouping + `BillingSummary` shape (UI unchanged); then delete the dead web `BillingEvent`/`ledger` machinery.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest. No new deps.

**Source of truth:** `docs/superpowers/specs/2026-06-29-billing-grain-reconcile-design.md`.

**Existing context:**
- `src/lib/demo/billing.ts` — `monthKey`, `billingSummary(ledger, identity)` (over `BillingEvent`), `isVisible`, `partyLabel`, `monthLabel`.
- `src/lib/demo/types.ts` — `Authorisation { …, doctorID, nurseID, clinicID, createdAt, invoiced }`; `BillingEvent`; `DemoState.ledger`.
- `src/lib/demo/backend.ts` — `emptyState()` (`ledger: []`), `approveRequest` (builds `BillingEvent` + `ledger:[...]`), `billableAuthorisations`.
- `src/lib/firebase/{mappers.ts (mapBillingEvent), hydrate.ts (billingEvents query + ledger in assembleState)}`.
- `src/lib/demo/store.tsx` — `billingSummary: (id) => billing.billingSummary(state.ledger, id)`.

---

## Task 1: Re-point `billingSummary` to authorisations (TDD)

**Files:**
- Modify: `src/lib/demo/billing.ts`, `src/lib/demo/store.tsx`
- Rewrite test: `src/lib/demo/__tests__/billing.test.ts`

- [ ] **Step 1: Rewrite the test** — `src/lib/demo/__tests__/billing.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { billingSummary, partyLabel, monthKey, monthLabel } from "@/lib/demo/billing";
import type { Authorisation, Identity, MedicationItem } from "@/lib/demo/types";
import { DEMO_ACCOUNTS, LUMIERE } from "@/lib/demo/accounts";

const doctor: Identity = { user: { id: "u-voss", name: "Dr Elena Voss" }, role: "doctor", context: { kind: "independent" } };
const nurseIndep: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "independent" } };
const clinicAdmin: Identity = { user: { id: "u-ava", name: "Ava Lim" }, role: "clinicAdmin", context: { kind: "clinic", clinic: LUMIERE } };

const med: MedicationItem = { name: "Profhilo", dosage: "2", category: "skinBooster", unit: "millilitres", areas: [] };
function auth(over: Partial<Authorisation>): Authorisation {
  return {
    id: "a", requestID: "r", patientID: "p", doctorID: "u-voss", nurseID: "u-sarah", clinicID: LUMIERE.id,
    medication: med, repeatsRemaining: 5, expiresAt: 0, createdAt: Date.UTC(2026, 5, 26), invoiced: false, ...over,
  };
}

describe("billingSummary (authorisation-based)", () => {
  it("a doctor sees un-invoiced auths grouped by counterparty", () => {
    const s = billingSummary([auth({ id: "a1" }), auth({ id: "a2" })], doctor);
    expect(s.totalCount).toBe(2);
    expect(s.months[0].monthKey).toBe("2026-06");
    expect(s.months[0].byParty).toEqual([{ id: LUMIERE.id, type: "clinic", count: 2 }]);
  });
  it("excludes invoiced authorisations", () => {
    const s = billingSummary([auth({ id: "a1", invoiced: true }), auth({ id: "a2" })], doctor);
    expect(s.totalCount).toBe(1);
  });
  it("a clinic admin groups by the doctor", () => {
    const s = billingSummary([auth({ id: "a1" })], clinicAdmin);
    expect(s.months[0].byParty).toEqual([{ id: "u-voss", type: "doctor", count: 1 }]);
  });
  it("an independent nurse sees clinic-billed auths as not theirs", () => {
    const s = billingSummary([auth({ id: "a1" })], nurseIndep);
    expect(s.totalCount).toBe(0);
  });
  it("an independent nurse sees nurse-counterparty auths (no clinic)", () => {
    const s = billingSummary([auth({ id: "a1", clinicID: null })], nurseIndep);
    expect(s.totalCount).toBe(1);
    expect(s.months[0].byParty).toEqual([{ id: "u-voss", type: "doctor", count: 1 }]);
  });
});

describe("partyLabel", () => {
  it("resolves clinic + user ids, falling back to the id", () => {
    expect(partyLabel("clinic", LUMIERE.id, DEMO_ACCOUNTS, LUMIERE)).toBe("Lumière Clinic");
    expect(partyLabel("doctor", "u-voss", DEMO_ACCOUNTS, LUMIERE)).toBe("Dr Elena Voss");
    expect(partyLabel("nurse", "u-unknown", DEMO_ACCOUNTS, LUMIERE)).toBe("u-unknown");
  });
});

describe("monthKey / monthLabel", () => {
  it("formats UTC month key and a human label", () => {
    expect(monthKey(Date.UTC(2026, 5, 26))).toBe("2026-06");
    expect(monthLabel("2026-06")).toBe("June 2026");
    expect(monthLabel("bogus")).toBe("bogus");
  });
});
```

- [ ] **Step 2: Run** — `npm test -- billing.test` → FAIL (signature mismatch). (If filter flakes, `npm test`.)

- [ ] **Step 3: Rewrite `src/lib/demo/billing.ts`** — replace the import + `isVisible` + `billingSummary` (keep `monthKey`, `partyLabel`, `monthLabel`, the `Billing*` interfaces):
```ts
import type { Authorisation, ClinicRef, Identity } from "./types";
import type { DemoAccount } from "./accounts";
```
```ts
interface BillableRow { doctorID: string; counterpartyType: "nurse" | "clinic"; counterpartyID: string; monthKey: string; }

function isVisible(r: BillableRow, identity: Identity): boolean {
  if (identity.role === "doctor") return r.doctorID === identity.user.id;
  const clinicId = identity.context.kind === "clinic" ? identity.context.clinic.id : null;
  // Clinic-context users see their clinic's rows; independent nurses match nurse-type rows by user id.
  if (r.counterpartyType === "clinic") return clinicId !== null && r.counterpartyID === clinicId;
  return r.counterpartyType === "nurse" && r.counterpartyID === identity.user.id;
}

// Counts un-invoiced authorisations (line items). Doctors group by the counterparty
// they bill; everyone else groups by the doctor billing them.
export function billingSummary(authorisations: Authorisation[], identity: Identity): BillingSummary {
  const rows: BillableRow[] = authorisations
    .filter((a) => !a.invoiced)
    .map((a) => ({
      doctorID: a.doctorID,
      counterpartyType: a.clinicID ? "clinic" : "nurse",
      counterpartyID: a.clinicID ?? a.nurseID,
      monthKey: monthKey(a.createdAt),
    }));
  const visible = rows.filter((r) => isVisible(r, identity));
  const byMonth = new Map<string, Map<string, BillingParty>>();
  for (const r of visible) {
    const party: BillingParty = identity.role === "doctor"
      ? { id: r.counterpartyID, type: r.counterpartyType, count: 0 }
      : { id: r.doctorID, type: "doctor", count: 0 };
    const month = byMonth.get(r.monthKey) ?? new Map<string, BillingParty>();
    const key = `${party.type}:${party.id}`;
    const existing = month.get(key);
    if (existing) existing.count += 1;
    else month.set(key, { ...party, count: 1 });
    byMonth.set(r.monthKey, month);
  }
  const months: BillingMonth[] = [...byMonth.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([mk, parties]) => {
      const byParty = [...parties.values()].sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
      return { monthKey: mk, count: byParty.reduce((sum, p) => sum + p.count, 0), byParty };
    });
  return { totalCount: visible.length, months };
}
```

- [ ] **Step 4: Re-point the store** — `src/lib/demo/store.tsx`:
```ts
      billingSummary: (id) => billing.billingSummary(Object.values(state.authorisations), id),
```

- [ ] **Step 5: Run** — `npm test -- billing.test` → PASS; `npx tsc --noEmit` → clean (`state.ledger` still exists, just unused now); `npm test` → all green.
- [ ] **Step 6: Commit**
```bash
git add src/lib/demo/billing.ts src/lib/demo/store.tsx src/lib/demo/__tests__/billing.test.ts
git commit -m "feat(billing): count un-invoiced authorisations instead of billing events"
```

---

## Task 2: Remove the redundant web billingEvents/ledger machinery

**Files:**
- Modify: `src/lib/demo/types.ts`, `src/lib/demo/backend.ts`, `src/lib/firebase/mappers.ts`, `src/lib/firebase/hydrate.ts`, `src/lib/demo/__tests__/backend.test.ts`, `src/lib/firebase/__tests__/hydrate.test.ts`

- [ ] **Step 1: `types.ts`** — delete the `BillingEvent` interface, and remove `ledger: BillingEvent[];` from `DemoState`.

- [ ] **Step 2: `backend.ts`** — remove `BillingEvent` from the `./types` import; in `emptyState()` delete `ledger: [],`; in `approveRequest` delete the `const event: BillingEvent = {…}` block and the `ledger: [...state.ledger, event],` line from the returned state. (Keep the `createdAt`/`invoiced` fields on `granted` and the `monthKey` import — still used by `billableAuthorisations`.)

- [ ] **Step 3: `mappers.ts`** — delete the `mapBillingEvent` function and remove `BillingEvent` from the `@/lib/demo/types` import.

- [ ] **Step 4: `hydrate.ts`** —
  - Remove `mapBillingEvent` from the `./mappers` import.
  - Remove `billingEvents: Row[];` from `HydrationRows`.
  - In `assembleState`, delete the `const ledger = rows.billingEvents.map(...)` line and remove `ledger` from the returned object (keep `invoices`/`scriptPricing`).
  - Delete the super-admin branch's `billingEvents: await runQuery("billingEvents"),`.
  - Delete the normal branch's `billingConstraints`/`billingById` block and the `billingEvents: [...billingById.values()],` from the `assembleState({...})` call.

- [ ] **Step 5: Fix tests:**
  - `src/lib/demo/__tests__/backend.test.ts` — remove the `const event = next.ledger[0]` block and its `expect(event.*)` assertions (keep the `granted`/status/prescriber assertions).
  - `src/lib/firebase/__tests__/hydrate.test.ts` — remove the `billingEvents: [...]` row from the `HydrationRows` literal and the `state.ledger` assertions (keep `invoices`/`scriptPricing`).

- [ ] **Step 6: Run** — `npx tsc --noEmit` → clean; `npm run lint` → clean; `npm test` → all green; `npm run build` → compiles.
- [ ] **Step 7: Commit**
```bash
git add src/lib/demo/types.ts src/lib/demo/backend.ts src/lib/firebase/mappers.ts src/lib/firebase/hydrate.ts src/lib/demo/__tests__/backend.test.ts src/lib/firebase/__tests__/hydrate.test.ts
git commit -m "refactor(billing): drop redundant web billingEvents/ledger read path"
```

---

## Task 3: Verification + demo smoke + live doc + PR

- [ ] **Step 1: Offline gate** — `rm -rf .next && npm run lint && npx tsc --noEmit && npm test && npm run build` → all green.
- [ ] **Step 2: Demo smoke (preview).** Move `.env.local` aside if present. As **Dr Voss** → Billing shows **2** total billable authorisations (Lumière/June). Generate the invoice → the count drops to **0**, the June row disappears, and the invoice is listed (count now consistent with invoicing). Screenshot. Restore `.env.local`.
- [ ] **Step 3: Live doc** — in `docs/superpowers/firebase-live-verification.md`, update the **Billing dashboard** and **GST invoices** sections: remove the "Known grain mismatch" caveat; state the dashboard now counts un-invoiced authorisations and decrements as invoices are generated.
- [ ] **Step 4: Commit + PR**
```bash
git add docs/superpowers/firebase-live-verification.md
git commit -m "docs(billing): dashboard counts un-invoiced authorisations (grain reconciled)"
```
Open the PR with `/create-pr` (base `main`). Body: reconciles the billing grain — dashboard now counts un-invoiced authorisations (line items), matching invoicing and decrementing on generation; removes the redundant web billingEvents/ledger read path (backend collection untouched). **Stacks on #16 (3b)** — merge after #16.

---

## Self-Review Notes

- **Spec coverage:** re-point `billingSummary` to authorisations + same scoping/shape (spec §1 → T1) ✓; remove web billingEvents/ledger machinery (spec §2 → T2) ✓; tests rewritten (spec §3 → T1/T2) ✓; verify + demo + live doc (spec §4 → T3) ✓.
- **Green commits:** T1 leaves `ledger` in state (unused) so tsc stays clean; T2 removes it wholesale with its consumers + tests in one commit.
- **Type consistency:** `billingSummary(authorisations, identity)` (T1) called with `Object.values(state.authorisations)` (store); `BillableRow` fields mirror the old `BillingEvent` ones so `isVisible`/grouping are unchanged in behaviour; `Authorisation.invoiced`/`createdAt`/`clinicID`/`nurseID` all exist (3b).
- **No placeholders:** every step has full code/commands.

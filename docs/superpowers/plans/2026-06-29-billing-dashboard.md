# Billing Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A read-only, role-aware billing dashboard showing billable authorisation counts (one per approved request) grouped by month × counterparty, wiring up the ledger and aligning it to the backend `billingEvents`.

**Architecture:** Extend `BillingEvent` to the backend shape + a pure `monthKey`; record it on approval; a pure `billingSummary` aggregation (TDD); a mapper + role-scoped live hydrate of `billingEvents`; a `/app/billing` page + nav link.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest. No new deps.

**Source of truth:** `docs/superpowers/specs/2026-06-29-billing-dashboard-design.md`; iOS `backend/functions/src/{index,domain}.ts`.

**Existing context:**
- `src/lib/demo/types.ts:152` — `BillingEvent { id, requestID, patientID, counterpartyID, createdAt }`; `DemoState.ledger: BillingEvent[]` (line 194). `Identity = { user: {id,name}, role: "nurse"|"doctor"|"clinicAdmin"|"superAdmin", context: {kind:"independent"} | {kind:"clinic", clinic: ClinicRef} }`.
- `src/lib/demo/backend.ts` `approveRequest` — builds the `BillingEvent` (`counterpartyID: clinicID ?? request.nurse.id`) and appends to `ledger`.
- `src/lib/demo/accounts.ts` — `DEMO_ACCOUNTS: DemoAccount[]` (`{ label, identities: Identity[] }`), `LUMIERE: ClinicRef`.
- `src/lib/firebase/hydrate.ts` — `HydrationRows`, pure `assembleState` (currently `ledger: []` at line 45), `runQuery(path, ...constraints)`, role-scoped `hydrate(claims)` with `claims.uid` / `claims.clinics` / `claims.roles`; dedup-by-Map pattern (authorisations).
- `src/lib/firebase/mappers.ts` — `str`, `toMillis`, `Doc`.
- `src/lib/demo/store.tsx` — `import * as backend from "./backend"`; read accessors like `formsForPatient: (pid) => backend.formsForPatient(state, pid)`; `state.ledger` reachable via `store.state`.
- `src/components/app/AppShell.tsx:11` — `NAV` array.

---

## Task 1: Extend `BillingEvent` + `monthKey` + record on approval (TDD)

**Files:**
- Modify: `src/lib/demo/types.ts`, `src/lib/demo/backend.ts`
- Create: `src/lib/demo/billing.ts` (just `monthKey` for now; aggregation in Task 2)
- Modify: the approveRequest test (`src/lib/demo/__tests__/backend.test.ts`)

- [ ] **Step 1: Extend the type** — replace `BillingEvent` in `src/lib/demo/types.ts:152`:
```ts
export interface BillingEvent {
  id: string;
  requestID: string;
  patientID: string;
  doctorID: string;
  counterpartyType: "nurse" | "clinic";
  counterpartyID: string; // clinic id, or nurse id when independent
  monthKey: string;       // "YYYY-MM" (UTC), matches backend billingEvents
  createdAt: number;
}
```

- [ ] **Step 2: Create `src/lib/demo/billing.ts`** with the pure `monthKey` (ported from backend `domain.monthKey`). No type imports yet — Task 2 adds them with the aggregation (adding them now would be unused and fail `tsc`/lint):
```ts
// UTC "YYYY-MM", matching the backend domain.monthKey.
export function monthKey(millis: number): string {
  const d = new Date(millis);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
```

- [ ] **Step 3: Record the new fields on approval** — in `src/lib/demo/backend.ts`, add `import { monthKey } from "./billing";` and replace the `event` construction in `approveRequest`:
```ts
  const event: BillingEvent = {
    id: makeID("ev"),
    requestID: request.id,
    patientID: request.patientID,
    counterpartyID: clinicID ?? request.nurse.id,
    createdAt: now,
  };
```
with:
```ts
  const event: BillingEvent = {
    id: makeID("ev"),
    requestID: request.id,
    patientID: request.patientID,
    doctorID: request.doctorID,
    counterpartyType: clinicID ? "clinic" : "nurse",
    counterpartyID: clinicID ?? request.nurse.id,
    monthKey: monthKey(now),
    createdAt: now,
  };
```

- [ ] **Step 4: Update the approveRequest billing test.** In `src/lib/demo/__tests__/backend.test.ts`, find the assertion on the created billing event (search for `ledger` / `counterpartyID`) and extend it to assert the new fields, e.g.:
```ts
    const event = next.ledger[next.ledger.length - 1];
    expect(event.doctorID).toBe("u-voss");
    expect(event.counterpartyType).toBe("clinic");
    expect(event.monthKey).toMatch(/^\d{4}-\d{2}$/);
```
(Adapt to the existing test's variable names; keep the existing count assertion.)

- [ ] **Step 5: Run** — `npm test` → green (the extended event + test); `npx tsc --noEmit` → clean.
- [ ] **Step 6: Commit**
```bash
git add src/lib/demo/types.ts src/lib/demo/billing.ts src/lib/demo/backend.ts src/lib/demo/__tests__/backend.test.ts
git commit -m "feat(billing): align BillingEvent to backend shape + monthKey (TDD)"
```

---

## Task 2: Pure billing aggregation (TDD)

**Files:**
- Modify: `src/lib/demo/billing.ts`
- Test: `src/lib/demo/__tests__/billing.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/demo/__tests__/billing.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { billingSummary, partyLabel, monthKey, monthLabel } from "@/lib/demo/billing";
import type { BillingEvent, Identity } from "@/lib/demo/types";
import { DEMO_ACCOUNTS, LUMIERE } from "@/lib/demo/accounts";

const doctor: Identity = { user: { id: "u-voss", name: "Dr Elena Voss" }, role: "doctor", context: { kind: "independent" } };
const nurseIndep: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "independent" } };
const clinicAdmin: Identity = { user: { id: "u-ava", name: "Ava Lim" }, role: "clinicAdmin", context: { kind: "clinic", clinic: LUMIERE } };

const clinicEvent: BillingEvent = {
  id: "ev1", requestID: "r1", patientID: "p1", doctorID: "u-voss",
  counterpartyType: "clinic", counterpartyID: LUMIERE.id, monthKey: "2026-06", createdAt: Date.UTC(2026, 5, 26),
};

describe("billingSummary", () => {
  it("a doctor sees the event grouped by counterparty (the clinic)", () => {
    const s = billingSummary([clinicEvent], doctor);
    expect(s.totalCount).toBe(1);
    expect(s.months).toHaveLength(1);
    expect(s.months[0].monthKey).toBe("2026-06");
    expect(s.months[0].byParty).toEqual([{ id: LUMIERE.id, type: "clinic", count: 1 }]);
  });
  it("a clinic admin sees it grouped by the doctor", () => {
    const s = billingSummary([clinicEvent], clinicAdmin);
    expect(s.totalCount).toBe(1);
    expect(s.months[0].byParty).toEqual([{ id: "u-voss", type: "doctor", count: 1 }]);
  });
  it("an independent nurse sees nothing (the event is billable to the clinic)", () => {
    const s = billingSummary([clinicEvent], nurseIndep);
    expect(s.totalCount).toBe(0);
    expect(s.months).toEqual([]);
  });
  it("sorts months descending and parties by count", () => {
    const older: BillingEvent = { ...clinicEvent, id: "ev0", monthKey: "2026-05" };
    const s = billingSummary([clinicEvent, older], doctor);
    expect(s.months.map((m) => m.monthKey)).toEqual(["2026-06", "2026-05"]);
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

- [ ] **Step 2: Run** — `npm test -- billing.test` → FAIL (missing exports).

- [ ] **Step 3: Implement** — add the imports at the top of `src/lib/demo/billing.ts` (`import type { BillingEvent, Identity, ClinicRef } from "./types";` and `import type { DemoAccount } from "./accounts";`), then append:
```ts
export interface BillingParty { id: string; type: "doctor" | "nurse" | "clinic"; count: number; }
export interface BillingMonth { monthKey: string; count: number; byParty: BillingParty[]; }
export interface BillingSummary { totalCount: number; months: BillingMonth[]; }

function isVisible(e: BillingEvent, identity: Identity): boolean {
  if (identity.role === "doctor") return e.doctorID === identity.user.id;
  const clinicId = identity.context.kind === "clinic" ? identity.context.clinic.id : null;
  if (e.counterpartyType === "clinic") return clinicId !== null && e.counterpartyID === clinicId;
  return e.counterpartyType === "nurse" && e.counterpartyID === identity.user.id;
}

// Doctors group by the counterparty they bill; everyone else groups by the doctor billing them.
export function billingSummary(ledger: BillingEvent[], identity: Identity): BillingSummary {
  const visible = ledger.filter((e) => isVisible(e, identity));
  const byMonth = new Map<string, Map<string, BillingParty>>();
  for (const e of visible) {
    const party: BillingParty = identity.role === "doctor"
      ? { id: e.counterpartyID, type: e.counterpartyType, count: 0 }
      : { id: e.doctorID, type: "doctor", count: 0 };
    const month = byMonth.get(e.monthKey) ?? new Map<string, BillingParty>();
    const key = `${party.type}:${party.id}`;
    const existing = month.get(key);
    if (existing) existing.count += 1;
    else month.set(key, { ...party, count: 1 });
    byMonth.set(e.monthKey, month);
  }
  const months: BillingMonth[] = [...byMonth.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([mk, parties]) => {
      const byParty = [...parties.values()].sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
      return { monthKey: mk, count: byParty.reduce((sum, p) => sum + p.count, 0), byParty };
    });
  return { totalCount: visible.length, months };
}

export function partyLabel(type: BillingParty["type"], id: string, accounts: DemoAccount[], clinic: ClinicRef): string {
  if (type === "clinic") return clinic.id === id ? clinic.name : id;
  for (const acc of accounts) for (const idn of acc.identities) {
    if (idn.user.id === id) return idn.user.name;
  }
  return id;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return key;
  return `${MONTH_NAMES[m - 1]} ${y}`;
}
```

- [ ] **Step 4: Run** — `npm test -- billing.test` → PASS; `npx tsc --noEmit` → clean.
- [ ] **Step 5: Commit**
```bash
git add src/lib/demo/billing.ts src/lib/demo/__tests__/billing.test.ts
git commit -m "feat(billing): role-aware billing summary aggregation (TDD)"
```

---

## Task 3: Mapper + live hydrate of `billingEvents`

**Files:**
- Modify: `src/lib/firebase/mappers.ts`, `src/lib/firebase/hydrate.ts`

- [ ] **Step 1: Add the mapper** — append to `src/lib/firebase/mappers.ts` (uses existing `str`/`toMillis`/`Doc`; add `BillingEvent` to the `@/lib/demo/types` import):
```ts
export function mapBillingEvent(id: string, data: Doc): BillingEvent {
  return {
    id,
    requestID: str(data.requestId),
    patientID: str(data.patientId),
    doctorID: str(data.doctorId),
    counterpartyType: data.counterpartyType === "clinic" ? "clinic" : "nurse",
    counterpartyID: str(data.counterpartyId),
    monthKey: str(data.monthKey),
    createdAt: toMillis(data.createdAt),
  };
}
```
(Note: the backend `billingEvents` doc has no `patientId` field; `str(undefined)` → `""`, which is fine — the dashboard doesn't use it.)

- [ ] **Step 2: Hydrate the collection** — in `src/lib/firebase/hydrate.ts`:
  - Add `mapBillingEvent` to the `./mappers` import.
  - Add `billingEvents: Row[]` to `HydrationRows`.
  - In `assembleState`, replace `ledger: []` with a mapped ledger. Change the return line to build it:
    ```ts
    const ledger = rows.billingEvents.map((r) => mapBillingEvent(r.id, r.data));
    return { patients, notesByPatient, authorisations, requests, appointments, ledger, usages: [], formsByPatient };
    ```
  - In the **super-admin** branch's `assembleState({...})` call, add `billingEvents: await runQuery("billingEvents"),`.
  - In the normal branch, after the appointments block, add the role-scoped query (mirrors the rules):
    ```ts
    const billingConstraints: QueryConstraint[][] = [
      [where("doctorId", "==", uid)],
      [where("counterpartyType", "==", "nurse"), where("counterpartyId", "==", uid)],
      ...clinicIds.map((cid) => [where("counterpartyType", "==", "clinic"), where("counterpartyId", "==", cid)]),
    ];
    const billingById = new Map<string, Row>();
    for (const constraints of billingConstraints) {
      for (const row of await runQuery("billingEvents", ...constraints)) billingById.set(row.id, row);
    }
    ```
  - Add `billingEvents: [...billingById.values()],` to the normal branch's `assembleState({...})` call.

- [ ] **Step 3: Fix the hydrate test** — `src/lib/firebase/__tests__/hydrate.test.ts` builds a `HydrationRows` literal for `assembleState`; add `billingEvents: []` to it (and optionally one billing row). Run `npm test -- hydrate` → green.

- [ ] **Step 4: Run** — `npx tsc --noEmit` → clean; `npm test` → all green.
- [ ] **Step 5: Commit**
```bash
git add src/lib/firebase/mappers.ts src/lib/firebase/hydrate.ts src/lib/firebase/__tests__/hydrate.test.ts
git commit -m "feat(billing): map + role-scoped hydrate of billingEvents"
```

---

## Task 4: Store accessor + billing page + nav link

**Files:**
- Modify: `src/lib/demo/store.tsx`, `src/components/app/AppShell.tsx`
- Create: `src/app/app/billing/page.tsx`

- [ ] **Step 1: Store accessor.** In `src/lib/demo/store.tsx`, add `import * as billing from "./billing";` (beside the `backend` import). Add to the `StoreValue` interface:
```ts
  billingSummary: (identity: Identity) => import("./billing").BillingSummary;
```
Add to the `value` object (beside the other read accessors, e.g. after `activeAuthorisations`):
```ts
      billingSummary: (id) => billing.billingSummary(state.ledger, id),
```

- [ ] **Step 2: Nav link.** In `src/components/app/AppShell.tsx`, add to `NAV` (after Authorisations):
```ts
  { href: "/app/billing", label: "Billing" },
```

- [ ] **Step 3: Create `src/app/app/billing/page.tsx`:**
```tsx
"use client";

import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { partyLabel, monthLabel } from "@/lib/demo/billing";
import { DEMO_ACCOUNTS, LUMIERE } from "@/lib/demo/accounts";

export default function BillingPage() {
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  if (!identity) return null;
  if (store.status === "loading") return <p className="text-ink-soft">Loading…</p>;

  const summary = store.billingSummary(identity);
  const isDoctor = identity.role === "doctor";
  const heading = isDoctor ? "Authorisations you can bill" : "Billable to you";
  const partyNoun = isDoctor ? "Counterparty" : "Prescribing doctor";

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
                {m.byParty.map((p) => (
                  <li key={`${p.type}:${p.id}`} className="flex items-center justify-between rounded-inner border border-line bg-card px-4 py-3">
                    <span className="text-sm text-ink">
                      <span className="micro mr-2">{partyNoun}</span>{partyLabel(p.type, p.id, DEMO_ACCOUNTS, LUMIERE)}
                    </span>
                    <span className="text-sm font-medium text-ink">{p.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run** — `npx tsc --noEmit` → clean; `npm run lint` → clean; `npm run build` → `/app/billing` compiles.
- [ ] **Step 5: Commit**
```bash
git add src/lib/demo/store.tsx src/components/app/AppShell.tsx "src/app/app/billing/page.tsx"
git commit -m "feat(billing): billing dashboard page + nav link + store accessor"
```

---

## Task 5: Verification gate + demo smoke + live doc + PR

- [ ] **Step 1: Offline gate**
```bash
rm -rf .next && npm run lint && npx tsc --noEmit && npm test && npm run build
```
Expected: all green; new `billing` tests pass; `/app/billing` compiles.

- [ ] **Step 2: Demo-mode smoke (preview).** If `.env.local` exists, move it aside; start the dev server. Sign in as **Dr Elena Voss** → click **Billing** → total **1**, with a **June 2026** section listing **Lumière Clinic · 1**. Sign out, sign in as **Sarah Chen** (default independent identity) → Billing total **0**, "No billable authorisations yet." Sign in as **Ava Lim (Clinic Admin)** → total **1**, June 2026 listing **Dr Elena Voss · 1**. Screenshot the doctor view. Restore `.env.local`.

- [ ] **Step 3: Document live verification** — append a "Billing dashboard — live checks" section to `docs/superpowers/firebase-live-verification.md`: as a TEST doctor, approve a request → open Billing → confirm the count appears under the right month + counterparty; sign in as the TEST nurse/clinic-admin counterparty → confirm they see it grouped by doctor; confirm the role scoping matches the deployed `billingEvents` rules. Note: counts are approved-request grain; $ and invoices arrive in 3b.

- [ ] **Step 4: Commit + PR**
```bash
git add docs/superpowers/firebase-live-verification.md
git commit -m "docs(billing): live verification checklist for the billing dashboard"
```
Open the PR with `/create-pr` (base `main`). PR body: increment 3a — read-only role-aware billing dashboard (counts by month × counterparty); aligns `BillingEvent` to the backend `billingEvents` + adds live hydrate; counts = approved-request grain; party names via demo accounts (no live directory); pricing + GST invoices are 3b.

---

## Self-Review Notes

- **Spec coverage:** BillingEvent alignment + monthKey + approval recording (spec §1 → T1) ✓; mapper + role-scoped hydrate (spec §2 → T3) ✓; pure `billingSummary`/`partyLabel`/`monthLabel` (spec §3 → T2) ✓; store accessor + `/app/billing` + nav (spec §4 → T4) ✓; tests + demo smoke + live doc (spec §5 → T2/T5) ✓; caveats (counts grain, no money, name fallback, billingMonthly unused) reflected ✓.
- **Type consistency:** `BillingEvent` extended fields (T1) consumed by `billingSummary`/`mapBillingEvent` (T2/T3); `billingSummary(ledger, identity): BillingSummary` (T2) used by store (T4) + page; `partyLabel(type, id, accounts, clinic)` / `monthLabel(key)` (T2) used by the page (T4); `monthKey` (T1) used in backend (T1) + tests; hydrate `assembleState` now consumes `rows.billingEvents`.
- **No placeholders:** every step has full code/commands.
- **Wire alignment:** mapper field names (`requestId`/`doctorId`/`counterpartyType`/`counterpartyId`/`monthKey`/`createdAt`) match the backend `billingEvents` doc; hydrate constraints mirror the `billingEvents` Firestore rules.

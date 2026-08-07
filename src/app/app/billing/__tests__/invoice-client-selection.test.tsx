// Owner feedback 07/08 (supersedes invoice-client selection, 2026-07-26): the Invoice tab
// no longer carries the full-book "Invoice a client" picker — issuing lives on the client's
// file, and the tab shows issued client invoices only (the Client invoices stream).
// Seed-backed store mock (client-invoice-composer pattern) kept from the picker tests.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import * as backend from "@/lib/demo/backend";
import { invoicesFor } from "@/lib/demo/invoicing";
import { patientAccessLevel } from "@/lib/demo/isolation";
import { buildSeedState, SEED_NOW } from "@/lib/demo/seed";
import { fullName, type DemoState, type Identity, type Patient } from "@/lib/demo/types";

let demoState: DemoState = buildSeedState();
const listeners = new Set<() => void>();
function applyState(u: (s: DemoState) => DemoState) { demoState = u(demoState); for (const l of listeners) l(); }

const sarahIndependent: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "independent" } };
let currentIdentity: Identity = sarahIndependent;
let storeMode: { status: "demo" | "ready"; matrixEnabled: boolean } = { status: "demo", matrixEnabled: true };

vi.mock("next/navigation", () => ({ usePathname: () => "/app", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/demo/auth", () => ({
  useDemoAuth: () => ({ identity: currentIdentity, availableIdentities: [currentIdentity], selectIdentity: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("@/lib/demo/store", () => ({
  useDemoStore: () => {
    const state = useSyncExternalStore((cb: () => void) => { listeners.add(cb); return () => listeners.delete(cb); }, () => demoState);
    return {
      state, now: SEED_NOW, status: storeMode.status, matrixEnabled: storeMode.matrixEnabled,
      serviceInvoicingEnabled: true,
      billingSummary: () => ({ totalCount: 0, months: [] }),
      invoicesFor: (id: Identity) => invoicesFor(state.invoices, id),
      billableAuthorisations: () => [],
      scriptPrice: () => 2500,
      setScriptPrice: vi.fn(),
      generateInvoice: vi.fn(),
      deleteInvoice: vi.fn(),
      markInvoicePaid: vi.fn(),
      finalizeServiceFee: vi.fn(),
      customTimeframeCount: () => 0,
      clinicBusinessStats: () => null,
      cooperationRelationships: () => [],
      clinicEmployments: () => [],
      patientAccess: (p: Patient, id: Identity) => patientAccessLevel(state, id, p),
      createServiceInvoice: vi.fn(),
      createClientInvoice: vi.fn(),
    };
  },
}));

import BillingPage from "@/app/app/billing/page";

// An invoice Sarah issued to her own client, recorded the way the file composer does it.
function issueToClaire() {
  const claire = Object.values(demoState.patients).find((p) => fullName(p) === "Claire Donovan")!;
  const invoice = backend.buildClientInvoice(demoState, {
    patientID: claire.id,
    lines: [{ description: "Consult", amountCents: 10000 }],
    chargeGst: false, gstIncluded: false,
  }, sarahIndependent, SEED_NOW);
  applyState((s) => backend.recordClientInvoice(s, invoice, sarahIndependent, SEED_NOW));
}

beforeEach(() => {
  demoState = buildSeedState();
  currentIdentity = sarahIndependent;
  storeMode = { status: "demo", matrixEnabled: true };
});

describe("Invoice tab — issued client invoices only (07/08)", () => {
  it("no longer offers the full-book client picker", () => {
    render(<BillingPage />);
    expect(screen.queryByRole("heading", { name: "Invoice a client" })).not.toBeInTheDocument();
    // No per-client Invoice rows either — Claire is in Sarah's book but gets no row here.
    expect(screen.queryByText("Claire Donovan")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Invoice" })).not.toBeInTheDocument();
  });

  it("lists an issued client invoice in the Client invoices stream with the file pointer", () => {
    issueToClaire();
    render(<BillingPage />);
    const section = screen.getByTestId("client-invoices");
    expect(within(section).getByText(/Claire Donovan/)).toBeInTheDocument();
    expect(within(section).getByText("$100.00")).toBeInTheDocument();
    // The pointer to where issuing lives now.
    expect(within(section).getByText(/issue a new invoice from the client/i)).toBeInTheDocument();
  });

  it("shows the stream in live mode too (client invoices are stored records, 02/08)", () => {
    issueToClaire();
    storeMode = { status: "ready", matrixEnabled: false };
    render(<BillingPage />);
    expect(screen.getByTestId("client-invoices")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Invoice a client" })).not.toBeInTheDocument();
  });
});

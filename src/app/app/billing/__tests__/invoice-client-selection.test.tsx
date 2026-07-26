// Invoice-page client selection (spec: invoice-client visibility + selection, 2026-07-26):
// the "Invoice a client" section opens to every clinical role in both modes, and each row
// expands the manual composer inline so an invoice can be issued without leaving the page.
// Seed-backed store mock (client-invoice-composer pattern) so patientAccess is the real gate.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
const voss: Identity = { user: { id: "u-voss", name: "Dr Elena Voss" }, role: "doctor", context: { kind: "independent" } };
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
      createClientInvoice: (input: backend.CreateClientInvoiceInput, id: Identity) => {
        const invoice = backend.buildClientInvoice(state, input, id, SEED_NOW);
        if (storeMode.matrixEnabled) applyState((s) => backend.recordClientInvoice(s, invoice, id, SEED_NOW));
        return invoice;
      },
    };
  },
}));

import BillingPage from "@/app/app/billing/page";

beforeEach(() => {
  demoState = buildSeedState();
  currentIdentity = sarahIndependent;
  storeMode = { status: "demo", matrixEnabled: true };
});

describe("Invoice a client — selection", () => {
  it("expands the manual composer inline for the picked client and issues to them", async () => {
    render(<BillingPage />);
    const section = screen.getByRole("heading", { name: "Invoice a client" }).closest("section")!;
    const claire = Object.values(demoState.patients).find((p) => fullName(p) === "Claire Donovan")!;
    const row = within(section).getByText("Claire Donovan").closest("li")!;

    await userEvent.click(within(row).getByRole("button", { name: "Invoice" }));
    expect(within(row).getByText(/billing to/i)).toHaveTextContent("Billing to Claire Donovan");

    await userEvent.type(within(row).getByLabelText("Line 1 description"), "Consult");
    await userEvent.type(within(row).getByLabelText("Line 1 amount"), "100");
    const before = demoState.invoices.length;
    await userEvent.click(within(row).getByRole("button", { name: "Issue invoice" }));
    expect(demoState.invoices.length).toBe(before + 1);
    const inv = demoState.invoices[demoState.invoices.length - 1];
    expect(inv.kind).toBe("client-invoice");
    expect(inv.patientID).toBe(claire.id);
  });

  it("opens to doctors too", () => {
    currentIdentity = voss;
    render(<BillingPage />);
    expect(screen.getByRole("heading", { name: "Invoice a client" })).toBeInTheDocument();
  });

  it("shows the empty state for an identity with no invoiceable clients", () => {
    currentIdentity = { user: { id: "u-nobody", name: "Dr Nobody" }, role: "doctor", context: { kind: "independent" } };
    render(<BillingPage />);
    expect(screen.getByText(/no clients you can invoice yet/i)).toHaveTextContent(/your book/);
  });

  it("renders in live mode with the not-stored note instead of the old explainer", () => {
    storeMode = { status: "ready", matrixEnabled: false };
    render(<BillingPage />);
    expect(screen.getByRole("heading", { name: "Invoice a client" })).toBeInTheDocument();
    expect(screen.getByText(/aren't stored/i)).toBeInTheDocument();
    expect(screen.queryByText(/isn't available in live mode/i)).not.toBeInTheDocument();
  });
});

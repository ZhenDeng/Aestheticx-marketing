// Nurse Invoice page + manual service-invoice composer (spec: manual-service-invoicing,
// 20/07 feedback): the nurse page is populated (clinic composer + streams — the client
// picker left the page 07/08), and any employed practitioner can hand-write a service
// invoice to their clinic. The store mock runs the REAL reducers over seed state
// (patient-account test pattern) so interactions exercise true behavior.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useSyncExternalStore } from "react";
import * as backend from "@/lib/demo/backend";
import * as invoicing from "@/lib/demo/invoicing";
import { billingSummary } from "@/lib/demo/billing";
import { patientAccessLevel } from "@/lib/demo/isolation";
import { buildSeedState, SEED_NOW } from "@/lib/demo/seed";
import { LUMIERE } from "@/lib/demo/accounts";
import type { DemoState, Identity, Patient } from "@/lib/demo/types";

let demoState: DemoState = buildSeedState();
const listeners = new Set<() => void>();
function applyState(updater: (s: DemoState) => DemoState) {
  demoState = updater(demoState);
  for (const l of listeners) l();
}

const sarahClinic: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "clinic", clinic: LUMIERE } };
const voss: Identity = { user: { id: "u-voss", name: "Dr Elena Voss" }, role: "doctor", context: { kind: "independent" } };
const solo: Identity = { user: { id: "u-solo", name: "Dr Ines Solo" }, role: "doctor", context: { kind: "independent" } };

let currentIdentity: Identity = sarahClinic;
let matrixEnabled = true;

vi.mock("next/navigation", () => ({ usePathname: () => "/app/billing", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/demo/auth", () => ({
  useDemoAuth: () => ({ identity: currentIdentity, availableIdentities: [], selectIdentity: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("@/lib/demo/store", () => ({
  useDemoStore: () => {
    const state = useSyncExternalStore(
      (cb: () => void) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
      () => demoState,
    );
    return {
      state,
      now: SEED_NOW,
      status: "demo" as const,
      matrixEnabled,
      serviceInvoicingEnabled: true,
      billingSummary: (id: Identity) => billingSummary(Object.values(state.authorisations), id),
      invoicesFor: (id: Identity) => invoicing.invoicesFor(state.invoices, id),
      scriptPrice: () => 2500,
      billableAuthorisations: (did: string) => backend.billableAuthorisations(state, did),
      customTimeframeCount: () => 0,
      clinicBusinessStats: () => null,
      cooperationRelationships: () => Object.values(state.cooperationRelationshipsByID),
      clinicEmployments: () => state.clinicEmployments,
      patientAccess: (p: Patient, id: Identity) => patientAccessLevel(state, id, p),
      setScriptPrice: vi.fn(),
      generateInvoice: vi.fn(),
      deleteInvoice: vi.fn(),
      markInvoicePaid: vi.fn(),
      finalizeServiceFee: vi.fn(),
      createServiceInvoice: (input: backend.CreateServiceInvoiceInput, id: Identity) =>
        applyState((s) => backend.createServiceInvoice(s, input, id, SEED_NOW)),
    };
  },
}));

import BillingPage from "@/app/app/billing/page";

beforeEach(() => {
  currentIdentity = sarahClinic;
  matrixEnabled = true;
  demoState = buildSeedState();
});

describe("nurse Invoice page", () => {
  // 07/08: the full-book client picker left the Invoice tab — issuing lives on the
  // client's file, and the tab keeps issued records only (invoice-client-selection test).
  it("live mode: the clinic composer stays available without the client picker", () => {
    matrixEnabled = false;
    render(<BillingPage />);
    expect(screen.queryByText("Invoice a client")).not.toBeInTheDocument();
    expect(screen.getByText("Invoice the clinic")).toBeInTheDocument();
    expect(screen.queryByText(/client invoicing isn.t available in live mode yet/i)).not.toBeInTheDocument();
  });
});

describe("Invoice the clinic — composer", () => {
  it("issues a final service-fee invoice from handwritten lines with a live totals preview", async () => {
    render(<BillingPage />);
    const section = screen.getByText("Invoice the clinic").closest("section")!;
    await userEvent.type(within(section).getByLabelText("Line 1 description"), "Cosmetic nursing services — June");
    await userEvent.type(within(section).getByLabelText("Line 1 amount"), "1000");
    await userEvent.click(within(section).getByRole("button", { name: "Add line" }));
    await userEvent.type(within(section).getByLabelText("Line 2 description"), "Travel");
    await userEvent.type(within(section).getByLabelText("Line 2 amount"), "50");

    // GST-exclusive preview: 1050 + 105 GST = 1155.
    expect(within(section).getByText("$1,050.00")).toBeInTheDocument();
    expect(within(section).getByText("$105.00")).toBeInTheDocument();
    expect(within(section).getByText("$1,155.00")).toBeInTheDocument();

    const before = demoState.invoices.length;
    await userEvent.click(within(section).getByRole("button", { name: "Issue invoice" }));
    expect(demoState.invoices.length).toBe(before + 1);
    const invoice = demoState.invoices[demoState.invoices.length - 1];
    expect(invoicing.resolveInvoiceKind(invoice)).toBe("service-fee");
    expect(invoice.draft).toBeFalsy();
    expect(invoice.counterpartyID).toBe(LUMIERE.id);
    expect(within(section).getByText(/service invoice issued/i)).toBeInTheDocument();

    // The issued invoice lands in the practitioner's Service fees stream.
    expect(within(screen.getByTestId("service-fees")).getByText("$1,155.00")).toBeInTheDocument();
  });

  it("GST toggles switch the preview convention: inclusive backs GST out, unchecked charges none", async () => {
    render(<BillingPage />);
    const section = screen.getByText("Invoice the clinic").closest("section")!;
    await userEvent.type(within(section).getByLabelText("Line 1 description"), "Services");
    await userEvent.type(within(section).getByLabelText("Line 1 amount"), "1100");

    // Default exclusive: 1100 + 110 GST = 1210, quoted ex GST.
    expect(within(section).getByPlaceholderText("Amount ex GST")).toBeInTheDocument();
    expect(within(section).getByText("$1,210.00")).toBeInTheDocument();

    // Prices include GST: the typed figure is the total; GST = 1100/11 = 100.
    await userEvent.click(within(section).getByLabelText("Prices include GST"));
    expect(within(section).getByPlaceholderText("Amount inc GST")).toBeInTheDocument();
    expect(within(section).getByText("$1,000.00")).toBeInTheDocument();
    expect(within(section).getByText("$100.00")).toBeInTheDocument();
    expect(within(section).getByText("$1,100.00")).toBeInTheDocument();

    // Charge GST off hides the inclusive toggle and taxes nothing.
    await userEvent.click(within(section).getByLabelText("Charge GST (10%)"));
    expect(within(section).queryByLabelText("Prices include GST")).not.toBeInTheDocument();
    expect(within(section).getByPlaceholderText("Amount")).toBeInTheDocument();
    expect(within(section).getByText("$0.00")).toBeInTheDocument();

    const before = demoState.invoices.length;
    await userEvent.click(within(section).getByRole("button", { name: "Issue invoice" }));
    expect(demoState.invoices.length).toBe(before + 1);
    const invoice = demoState.invoices[demoState.invoices.length - 1];
    expect(invoice.gstCents).toBe(0);
    expect(invoice.totalCents).toBe(110000);
  });

  it("refuses to issue an incomplete line and points at it", async () => {
    render(<BillingPage />);
    const section = screen.getByText("Invoice the clinic").closest("section")!;
    await userEvent.type(within(section).getByLabelText("Line 1 amount"), "100");
    const before = demoState.invoices.length;
    await userEvent.click(within(section).getByRole("button", { name: "Issue invoice" }));
    expect(demoState.invoices.length).toBe(before);
    expect(within(section).getByText(/line 1/i)).toBeInTheDocument();
  });

  it("shows for an employed doctor alongside their authorisation billing", () => {
    currentIdentity = voss; // seeded employee-kind relationship with Lumière
    render(<BillingPage />);
    expect(screen.getByText("Invoice the clinic")).toBeInTheDocument();
    expect(screen.getByText("Total approved requests")).toBeInTheDocument();
  });

  it("hides for a practitioner with no clinic membership", () => {
    currentIdentity = solo;
    render(<BillingPage />);
    expect(screen.queryByText("Invoice the clinic")).not.toBeInTheDocument();
  });
});

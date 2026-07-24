// Patient-file "Invoice client" section (spec: manual client invoicing, 2026-07-24). The
// store mock runs the REAL client-invoice reducers over seed state; clinical selectors are
// stubbed (they don't affect this surface).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Suspense, useSyncExternalStore } from "react";
import * as backend from "@/lib/demo/backend";
import { patientAccessLevel } from "@/lib/demo/isolation";
import { buildSeedState, SEED_NOW } from "@/lib/demo/seed";
import { fullName, type DemoState, type Identity, type Patient } from "@/lib/demo/types";

let demoState: DemoState = buildSeedState();
const listeners = new Set<() => void>();
function applyState(u: (s: DemoState) => DemoState) { demoState = u(demoState); for (const l of listeners) l(); }

const sarahIndependent: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "independent" } };
let currentIdentity: Identity = sarahIndependent;

vi.mock("next/navigation", () => ({ usePathname: () => "/app", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/app/ConsultCall", () => ({ useConsultCall: () => ({ start: vi.fn(), active: false }) }));
vi.mock("@/components/app/PatientAvatar", () => ({ PatientAvatarPicker: () => null, PatientAvatar: () => null }));
vi.mock("@/lib/demo/auth", () => ({ useDemoAuth: () => ({ identity: currentIdentity, availableIdentities: [] }) }));
vi.mock("@/lib/demo/store", () => ({
  useDemoStore: () => {
    const state = useSyncExternalStore((cb: () => void) => { listeners.add(cb); return () => listeners.delete(cb); }, () => demoState);
    return {
      status: "demo" as const, now: SEED_NOW, state, matrixEnabled: true,
      patientAccess: (p: Patient, id: Identity) => patientAccessLevel(state, id, p),
      walletEntries: () => [], walletBalance: () => 0, priceListFor: () => [],
      topUpWallet: vi.fn(), checkoutClient: vi.fn(), finalizeServiceFee: vi.fn(),
      visibleNotesForPatient: () => [], openRequestsForPatient: () => [],
      activeAuthorisations: () => [], activeEmergencyAuthorisations: () => [],
      formsForPatient: () => [], appointmentsForPatient: () => [], searchPatients: () => [],
      recordAdminAccess: vi.fn(), deletePatient: vi.fn(), mergePatients: vi.fn(),
      saveGeneralNote: vi.fn(), retryAftercare: vi.fn(), withdrawRequest: vi.fn(),
      createClientInvoice: (input: backend.CreateClientInvoiceInput, id: Identity) => {
        const invoice = backend.buildClientInvoice(state, input, id, SEED_NOW);
        applyState((s) => backend.recordClientInvoice(s, invoice, id, SEED_NOW));
        return invoice;
      },
    };
  },
}));

import PatientFilePage from "@/app/app/patients/[id]/page";

function findPatientId(name: string): string {
  const p = Object.values(demoState.patients).find((x) => fullName(x) === name);
  if (!p) throw new Error(`seed patient ${name} missing`);
  return p.id;
}

async function renderFile(id: string) {
  await act(async () => {
    render(<Suspense fallback={null}><PatientFilePage params={Promise.resolve({ id })} /></Suspense>);
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => { currentIdentity = sarahIndependent; demoState = buildSeedState(); });

describe("patient file — Invoice client", () => {
  it("shows the Invoice client section and lists an issued client invoice", async () => {
    const id = findPatientId("Claire Donovan"); // owned by sarahIndependent
    await renderFile(id);
    const section = screen.getByRole("heading", { name: "Invoice client" }).closest("section")!;
    await userEvent.type(within(section).getByLabelText("Line 1 description"), "Dermal filler");
    await userEvent.type(within(section).getByLabelText("Line 1 amount"), "500");
    await userEvent.click(within(section).getByRole("button", { name: "Issue invoice" }));
    expect(demoState.invoices.some((i) => i.kind === "client-invoice")).toBe(true);
    expect(within(section).getByText(/INV-/)).toBeInTheDocument();
  });
});

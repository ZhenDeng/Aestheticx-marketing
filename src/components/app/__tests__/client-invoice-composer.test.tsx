// Manual client-invoice composer (spec: manual client invoicing, 2026-07-24). The store mock
// runs the REAL reducers over seed state (billing-service-invoice pattern).
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
    // Defaults: charge GST on, prices include GST → subtotal 300, GST 30, total 330.
    expect(screen.getByText("$300.00")).toBeInTheDocument();          // subtotal (net) — unique
    expect(screen.getAllByText("$30.00").length).toBeGreaterThan(0);  // GST = round(33000/11)
    expect(screen.getAllByText("$330.00").length).toBeGreaterThan(0); // unit + total

    const before = demoState.invoices.length;
    await userEvent.click(screen.getByRole("button", { name: "Issue invoice" }));
    expect(demoState.invoices.length).toBe(before + 1);
    const inv = demoState.invoices[demoState.invoices.length - 1];
    expect(inv.kind).toBe("client-invoice");
    expect(inv.totalCents).toBe(33000);
    expect(screen.getByRole("button", { name: /download pdf/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /email invoice/i })).toBeInTheDocument();
  });

  it("toggling GST off drops the GST line and yields the on-top-free total", async () => {
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
    const amara = findPatient("Amara Boyd"); // clinic-owned; Sarah's INDEPENDENT id has no reach
    const { container } = render(<ClientInvoiceComposer patient={amara} />);
    expect(container).toBeEmptyDOMElement();
  });
});

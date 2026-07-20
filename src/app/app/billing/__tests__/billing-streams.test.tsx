// Role-aware billing streams (delta spec: invoicing — "Invoice access by direction and
// kind"; design-ui.md §4): client invoices, drafted/issued service fees, received
// service fees — alongside the untouched doctor authorisation flow.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyState } from "@/lib/demo/backend";
import { invoicesFor, type Invoice, type InvoiceParty } from "@/lib/demo/invoicing";
import { LUMIERE } from "@/lib/demo/accounts";
import type { Identity } from "@/lib/demo/types";

const sarahClinic: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "clinic", clinic: LUMIERE } };
const ava: Identity = { user: { id: "u-ava", name: "Ava Lim" }, role: "clinicAdmin", context: { kind: "clinic", clinic: LUMIERE } };
const voss: Identity = { user: { id: "u-voss", name: "Dr Elena Voss" }, role: "doctor", context: { kind: "independent" } };

const NOW = Date.UTC(2026, 6, 16);
const sarahParty: InvoiceParty = { businessName: "Sarah Chen", abn: "", email: "" };
const clinicParty: InvoiceParty = { businessName: "Lumière Clinic Pty Ltd", abn: "82 601 443 218", email: "" };
const claireParty: InvoiceParty = { businessName: "Claire Donovan", abn: "", email: "" };

let n = 0;
function inv(partial: Partial<Invoice>): Invoice {
  return {
    id: `inv-${++n}`, doctorID: "", counterpartyID: "", counterpartyType: "client",
    periodLabel: "2026-07-16", lines: [], subtotalCents: 40910, gstCents: 4090, totalCents: 45000,
    authorisationIDs: [], createdAt: NOW, paid: false, ...partial,
  };
}

const sarahTopUp = inv({ kind: "top-up", issuerRef: { kind: "nurse", id: "u-sarah" }, patientID: "p1", issuer: sarahParty, billTo: claireParty, giftCents: 100000, totalCreditCents: 500000, paid: true });
const clinicSale = inv({ kind: "client-sale", issuerRef: { kind: "clinic", id: LUMIERE.id }, patientID: "p2", issuer: clinicParty, billTo: claireParty });
const sarahFeeDraft = inv({ kind: "service-fee", draft: true, issuerRef: { kind: "nurse", id: "u-sarah" }, counterpartyID: LUMIERE.id, counterpartyType: "clinic", issuer: sarahParty, billTo: clinicParty, subtotalCents: 15000, gstCents: 1500, totalCents: 16500 });
const sarahFeeFinal = inv({ kind: "service-fee", draft: false, issuerRef: { kind: "nurse", id: "u-sarah" }, counterpartyID: LUMIERE.id, counterpartyType: "clinic", issuer: sarahParty, billTo: clinicParty, subtotalCents: 15000, gstCents: 1500, totalCents: 16500 });
const legacyDoctorInvoice = inv({ doctorID: "u-voss", counterpartyID: "u-sarah", counterpartyType: "nurse", kind: undefined, periodLabel: "June 2026" });

let currentIdentity: Identity = sarahClinic;
let invoices: Invoice[] = [];
const finalizeServiceFee = vi.fn();
let storeOverrides: Record<string, unknown> = {};

vi.mock("next/navigation", () => ({ usePathname: () => "/app", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/demo/auth", () => ({
  useDemoAuth: () => ({ identity: currentIdentity, availableIdentities: [currentIdentity], selectIdentity: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("@/lib/demo/store", () => ({
  useDemoStore: () => ({
    state: emptyState(),
    now: NOW,
    status: "demo" as const,
    matrixEnabled: true,
    billingSummary: () => ({ totalCount: 0, months: [] }),
    invoicesFor: (id: Identity) => invoicesFor(invoices, id),
    billableAuthorisations: () => [],
    scriptPrice: () => 2500,
    setScriptPrice: vi.fn(),
    generateInvoice: vi.fn(),
    deleteInvoice: vi.fn(),
    markInvoicePaid: vi.fn(),
    finalizeServiceFee,
    customTimeframeCount: () => 0,
    clinicBusinessStats: () => null,
    // 20/07 manual-service-invoicing surfaces (no relationships/patients in this fixture,
    // so the composer and client picker stay dormant).
    serviceInvoicingEnabled: true,
    cooperationRelationships: () => [],
    patientAccess: () => "none" as const,
    createServiceInvoice: vi.fn(),
    ...storeOverrides,
  }),
}));

import BillingPage from "@/app/app/billing/page";

beforeEach(() => {
  finalizeServiceFee.mockReset();
  storeOverrides = {};
  currentIdentity = sarahClinic;
  invoices = [sarahTopUp, clinicSale, sarahFeeDraft, sarahFeeFinal, legacyDoctorInvoice];
});

describe("nurse streams", () => {
  it("lists issued client documents with kind chips, scoped to the ACTIVE identity's silo", () => {
    render(<BillingPage />);
    const section = screen.getByTestId("client-invoices");
    // Clinic-context Sarah sees the clinic-issued sale but NOT her independent-book
    // top-up (client documents stay in the silo that owns the client).
    expect(within(section).getAllByText(/claire donovan/i)).toHaveLength(1);
    expect(within(section).queryByText(/top-up/i)).not.toBeInTheDocument();
    expect(within(section).getByText(/client sale/i)).toBeInTheDocument();
  });

  it("shows the drafted service fee with a Finalize action that calls the store", async () => {
    render(<BillingPage />);
    const section = screen.getByTestId("service-fees");
    expect(within(section).getByText(/draft/i)).toBeInTheDocument();
    await userEvent.click(within(section).getByRole("button", { name: /finalize/i }));
    expect(finalizeServiceFee).toHaveBeenCalledWith(sarahFeeDraft.id, sarahClinic);
  });
});

describe("matrix mark-paid affordance", () => {
  it("shows Mark paid on an unpaid client invoice for the issuer and calls the store", async () => {
    const markInvoicePaid = vi.fn();
    storeOverrides = { markInvoicePaid };
    currentIdentity = ava;
    render(<BillingPage />);
    const section = screen.getByTestId("client-invoices");
    await userEvent.click(within(section).getByRole("button", { name: /mark paid/i }));
    expect(markInvoicePaid).toHaveBeenCalledWith(clinicSale.id, ava);
  });
});

describe("clinic admin streams", () => {
  it("shows clinic-issued client invoices and received FINALIZED service fees without a finalize action", () => {
    currentIdentity = ava;
    render(<BillingPage />);
    const clientSection = screen.getByTestId("client-invoices");
    expect(within(clientSection).getByText(/claire donovan/i)).toBeInTheDocument();
    const received = screen.getByTestId("received-service-fees");
    expect(within(received).getByText(/sarah chen/i)).toBeInTheDocument();
    expect(within(received).getByText("$165.00")).toBeInTheDocument();
    expect(within(received).queryByText(/draft/i)).not.toBeInTheDocument();
    expect(within(received).queryByRole("button", { name: /finalize/i })).not.toBeInTheDocument();
  });
});

describe("doctor stream regression", () => {
  it("keeps the authorisation invoice list free of matrix documents", () => {
    currentIdentity = voss;
    render(<BillingPage />);
    // The legacy invoice renders in the classic list…
    expect(screen.getByText(/june 2026/i)).toBeInTheDocument();
    // …and with no matrix documents of his own, the new sections stay hidden.
    expect(screen.queryByTestId("client-invoices")).not.toBeInTheDocument();
    expect(screen.queryByTestId("service-fees")).not.toBeInTheDocument();
  });
});

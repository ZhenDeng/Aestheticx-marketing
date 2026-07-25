// A nurse employed at a clinic (grant, no baked clinic identity) can invoice that clinic
// (spec: 2026-07-25). The composer surfaces the clinic via heldIdentities' grant derivation.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ClinicEmployment, Identity } from "@/lib/demo/types";

// Independent nurse — NO baked clinic identity; the only clinic comes from the grant.
const indie: Identity = { user: { id: "u-indie", name: "Indie Nurse" }, role: "nurse", context: { kind: "independent" } };
const createServiceInvoice = vi.fn();
let clinicEmployments: ClinicEmployment[] = [];

vi.mock("@/lib/demo/auth", () => ({
  useDemoAuth: () => ({ identity: indie, availableIdentities: [], selectIdentity: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("@/lib/demo/store", () => ({
  useDemoStore: () => ({
    serviceInvoicingEnabled: true,
    cooperationRelationships: () => [],
    clinicEmployments: () => clinicEmployments,
    createServiceInvoice,
  }),
}));

import { ServiceInvoiceComposer } from "@/components/app/ServiceInvoiceComposer";

beforeEach(() => {
  createServiceInvoice.mockReset();
  clinicEmployments = [];
});

describe("ServiceInvoiceComposer — employed nurse", () => {
  it("renders nothing when the nurse has no clinic membership", () => {
    const { container } = render(<ServiceInvoiceComposer />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lets a granted nurse issue a service invoice to the clinic", async () => {
    clinicEmployments = [{ id: "u-indie_clinic-lumiere", nurseID: "u-indie", nurseName: "Indie Nurse", clinicID: "clinic-lumiere", clinicName: "Lumière Clinic", grantedAt: 1 }];
    render(<ServiceInvoiceComposer />);
    await act(async () => {});
    expect(screen.getByText(/Lumière Clinic/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Line 1 description"), "June nursing");
    await userEvent.type(screen.getByLabelText("Line 1 amount"), "1000");
    await userEvent.click(screen.getByRole("button", { name: /issue invoice/i }));
    expect(createServiceInvoice).toHaveBeenCalledWith(
      { clinicID: "clinic-lumiere", lines: [{ description: "June nursing", amountCents: 100000 }] },
      indie,
    );
  });
});

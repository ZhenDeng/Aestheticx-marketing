// Clinic counterparties in the create-relationship form (spec: cooperation-linking).
// The backend callable + rules + edit rows always supported counterpartyType 'clinic';
// the create form was nurse-only because no clinic directory existed to pick from —
// so a clinic could never be linked to a doctor (19/07 bug 2).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Identity } from "@/lib/demo/types";

const admin: Identity = { user: { id: "u-admin", name: "Priya Nair" }, role: "superAdmin", context: { kind: "independent" } };

const setCooperationRelationship = vi.fn();
let clinicDirectory: { id: string; label: string }[] = [];

vi.mock("@/lib/demo/auth", () => ({
  useDemoAuth: () => ({ identity: admin, availableIdentities: [admin], selectIdentity: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("@/lib/demo/store", () => ({
  useDemoStore: () => ({
    accounts: () => [
      { id: "u-nurse", name: "Yinghua Xu", email: "nurse@example.com", roles: ["nurse"], mustChangePassword: false },
    ],
    cooperationRelationships: () => [],
    clinics: () => clinicDirectory,
    listDoctors: () => Promise.resolve([{ doctorId: "u-voss", doctorName: "Dr Elias Voss" }]),
    catalogProducts: () => [],
    businessEntities: () => [],
    resetUserPassword: vi.fn(),
    deleteUserAccount: vi.fn(),
    createUser: vi.fn(),
    setCooperationRelationship,
    setProduct: vi.fn(),
    setProductActive: vi.fn(),
    setBusinessEntity: vi.fn(),
    setBusinessEntityActive: vi.fn(),
  }),
}));

import { AdminConsole } from "@/components/admin/AdminConsole";

async function openCreateForm() {
  render(<AdminConsole live />);
  await act(async () => {});
  await userEvent.click(screen.getByRole("button", { name: "Add cooperation relationship" }));
}

beforeEach(() => {
  setCooperationRelationship.mockClear();
  clinicDirectory = [{ id: "clinic-lumiere", label: "Lumière Clinic" }];
});

describe("create-relationship counterparty types", () => {
  it("offers a Nurse/Clinic counterparty toggle, defaulting to Nurse", async () => {
    await openCreateForm();
    const nurseToggle = screen.getByRole("button", { name: "Nurse" });
    const clinicToggle = screen.getByRole("button", { name: "Clinic" });
    expect(nurseToggle).toHaveAttribute("aria-pressed", "true");
    expect(clinicToggle).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByLabelText("Nurse", { selector: "select" })).toBeInTheDocument();
  });

  it("links a clinic to a doctor: picks from the directory and submits counterpartyType clinic", async () => {
    await openCreateForm();
    await userEvent.click(screen.getByRole("button", { name: "Clinic" }));
    const clinicSelect = screen.getByLabelText("Clinic", { selector: "select" });
    expect(clinicSelect).toHaveValue("clinic-lumiere");
    await userEvent.click(screen.getByRole("button", { name: "Create relationship" }));
    expect(setCooperationRelationship).toHaveBeenCalledWith(
      expect.objectContaining({
        doctorID: "u-voss",
        counterpartyType: "clinic",
        counterpartyID: "clinic-lumiere",
        counterpartyName: "Lumière Clinic",
        status: "active",
        authRequestsAllowed: true,
        invoiceApplies: true,
      }),
      admin,
    );
  });

  it("still creates nurse relationships exactly as before", async () => {
    await openCreateForm();
    await userEvent.click(screen.getByRole("button", { name: "Create relationship" }));
    expect(setCooperationRelationship).toHaveBeenCalledWith(
      expect.objectContaining({
        counterpartyType: "nurse",
        counterpartyID: "u-nurse",
        counterpartyName: "Yinghua Xu",
      }),
      admin,
    );
  });

  it("with no clinics provisioned, explains instead of offering an empty picker, and disables Create", async () => {
    clinicDirectory = [];
    await openCreateForm();
    await userEvent.click(screen.getByRole("button", { name: "Clinic" }));
    expect(screen.getByText(/no clinic accounts yet/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Clinic", { selector: "select" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create relationship" })).toBeDisabled();
    // The toggle stays usable — switching back restores the nurse flow.
    await userEvent.click(screen.getByRole("button", { name: "Nurse" }));
    expect(screen.getByLabelText("Nurse", { selector: "select" })).toBeInTheDocument();
  });
});

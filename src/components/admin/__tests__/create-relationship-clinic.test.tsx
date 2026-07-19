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
let clinicDirectory: { id: string; label: string; unnamed?: boolean }[] = [];
let existingRelationships: unknown[] = [];

vi.mock("@/lib/demo/auth", () => ({
  useDemoAuth: () => ({ identity: admin, availableIdentities: [admin], selectIdentity: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("@/lib/demo/store", () => ({
  useDemoStore: () => ({
    accounts: () => [
      { id: "u-nurse", name: "Yinghua Xu", email: "nurse@example.com", roles: ["nurse"], mustChangePassword: false },
    ],
    cooperationRelationships: () => existingRelationships,
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
  setCooperationRelationship.mockReset();
  clinicDirectory = [{ id: "clinic-lumiere", label: "Lumière Clinic" }];
  existingRelationships = [];
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

  it("links a clinic to a doctor: picks from the directory and submits counterpartyType clinic (kinds [employee] by default)", async () => {
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
        relationshipKinds: ["employee"],
        status: "active",
        authRequestsAllowed: true,
        invoiceApplies: true,
      }),
      admin,
    );
  });

  it("offers the Employee/Prescriber kind chips only for clinic counterparties; both can be selected", async () => {
    await openCreateForm();
    // Nurse counterparty: no kind choice.
    expect(screen.queryByRole("button", { name: "Prescriber" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clinic" }));
    expect(screen.getByRole("button", { name: "Employee" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Prescriber" })).toHaveAttribute("aria-pressed", "false");
    // Selecting Prescriber alongside Employee submits both kinds.
    await userEvent.click(screen.getByRole("button", { name: "Prescriber" }));
    await userEvent.click(screen.getByRole("button", { name: "Create relationship" }));
    expect(setCooperationRelationship).toHaveBeenCalledWith(
      expect.objectContaining({ counterpartyType: "clinic", relationshipKinds: ["employee", "prescriber"] }),
      admin,
    );
  });

  it("submits a prescriber-only set and never lets the set go empty", async () => {
    await openCreateForm();
    await userEvent.click(screen.getByRole("button", { name: "Clinic" }));
    await userEvent.click(screen.getByRole("button", { name: "Prescriber" }));
    await userEvent.click(screen.getByRole("button", { name: "Employee" })); // deselect employee
    // Deselecting the last remaining kind is a no-op — prescriber stays selected.
    await userEvent.click(screen.getByRole("button", { name: "Prescriber" }));
    expect(screen.getByRole("button", { name: "Prescriber" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Create relationship" }));
    expect(setCooperationRelationship).toHaveBeenCalledWith(
      expect.objectContaining({ counterpartyType: "clinic", relationshipKinds: ["prescriber"] }),
      admin,
    );
  });

  it("still creates nurse relationships exactly as before, with no kinds", async () => {
    await openCreateForm();
    await userEvent.click(screen.getByRole("button", { name: "Create relationship" }));
    expect(setCooperationRelationship).toHaveBeenCalledWith(
      expect.objectContaining({
        counterpartyType: "nurse",
        counterpartyID: "u-nurse",
        counterpartyName: "Yinghua Xu",
        relationshipKinds: undefined,
      }),
      admin,
    );
  });

  it("refuses to re-create an existing pair — the upsert would silently resurrect a removed gate", async () => {
    existingRelationships = [{
      id: "u-voss_clinic_clinic-lumiere", doctorID: "u-voss", doctorName: "Dr Elias Voss",
      counterpartyType: "clinic", counterpartyID: "clinic-lumiere", counterpartyName: "Lumière Clinic",
      status: "inactive", authRequestsAllowed: true, invoiceApplies: true, priceCentsOverride: 30000,
      createdAt: 1, updatedAt: 2,
    }];
    await openCreateForm();
    await userEvent.click(screen.getByRole("button", { name: "Clinic" }));
    await userEvent.click(screen.getByRole("button", { name: "Create relationship" }));
    expect(setCooperationRelationship).not.toHaveBeenCalled();
    expect(screen.getByText(/already have a relationship \(currently removed\)/)).toBeInTheDocument();
  });

  it("refuses to link an unnamed clinic — the synthetic label must never persist as counterpartyName", async () => {
    clinicDirectory = [{ id: "xY3kf9", label: "Unnamed clinic (xY3kf9…)", unnamed: true }];
    await openCreateForm();
    await userEvent.click(screen.getByRole("button", { name: "Clinic" }));
    await userEvent.click(screen.getByRole("button", { name: "Create relationship" }));
    expect(setCooperationRelationship).not.toHaveBeenCalled();
    expect(screen.getByText(/no name yet/i)).toBeInTheDocument();
  });

  it("surfaces a store rejection as an inline error for a clinic relationship", async () => {
    setCooperationRelationship.mockImplementation(() => { throw new Error("relationship already exists"); });
    await openCreateForm();
    await userEvent.click(screen.getByRole("button", { name: "Clinic" }));
    await userEvent.click(screen.getByRole("button", { name: "Create relationship" }));
    expect(screen.getByText("relationship already exists")).toBeInTheDocument();
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

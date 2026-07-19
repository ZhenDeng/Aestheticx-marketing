// Business entities on account rows (20/07 feedback): the standalone section is gone; each
// account row shows its entity (clinic-admin accounts resolve their clinic-keyed entity via
// clinicIDs) with inline Edit, and an account without one offers a pre-scoped add.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BusinessEntity, Identity } from "@/lib/demo/types";

const admin: Identity = { user: { id: "u-admin", name: "Priya Nair" }, role: "superAdmin", context: { kind: "independent" } };

const setBusinessEntity = vi.fn();
const setBusinessEntityActive = vi.fn();
let entities: BusinessEntity[] = [];

vi.mock("@/lib/demo/auth", () => ({
  useDemoAuth: () => ({ identity: admin, availableIdentities: [admin], selectIdentity: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("@/lib/demo/store", () => ({
  useDemoStore: () => ({
    accounts: () => [
      { id: "u-ava", name: "Ava Lim", email: "ava@example.com", roles: ["clinicAdmin"], clinicIDs: ["clinic-lumiere"], mustChangePassword: false },
      { id: "u-voss", name: "Dr Elias Voss", email: "voss@example.com", roles: ["doctor"], clinicIDs: [], mustChangePassword: false },
    ],
    cooperationRelationships: () => [],
    clinics: () => [],
    listDoctors: () => Promise.resolve([]),
    catalogProducts: () => [],
    businessEntities: () => entities,
    resetUserPassword: vi.fn(),
    deleteUserAccount: vi.fn(),
    createUser: vi.fn(),
    setCooperationRelationship: vi.fn(),
    setProduct: vi.fn(),
    setProductActive: vi.fn(),
    setBusinessEntity,
    setBusinessEntityActive,
  }),
}));

import { AdminConsole } from "@/components/admin/AdminConsole";

async function renderSettled() {
  render(<AdminConsole live />);
  await act(async () => {});
}

function rowOf(name: string): HTMLElement {
  return screen.getByText(name).closest("li")!;
}

beforeEach(() => {
  setBusinessEntity.mockReset();
  setBusinessEntityActive.mockReset();
  entities = [
    { id: "clinic-lumiere", type: "clinic", legalName: "Lumière Clinic Pty Ltd", tradingName: "Lumière", abn: "82601443218", isActive: true },
  ];
});

describe("AccountEntityLine", () => {
  it("shows the clinic-keyed entity on the account that administers the clinic", async () => {
    await renderSettled();
    const row = rowOf("Ava Lim");
    expect(within(row).getByText(/Lumière · Lumière Clinic Pty Ltd/)).toBeInTheDocument();
    expect(within(row).getByText(/ABN 82601443218/)).toBeInTheDocument();
  });

  it("edits an existing entity in place through the row's Edit", async () => {
    await renderSettled();
    await userEvent.click(within(rowOf("Ava Lim")).getByRole("button", { name: "Edit" }));
    const legal = screen.getByDisplayValue("Lumière Clinic Pty Ltd");
    await userEvent.clear(legal);
    await userEvent.type(legal, "Lumière Group Pty Ltd");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(setBusinessEntity).toHaveBeenCalledWith(
      expect.objectContaining({ id: "clinic-lumiere", type: "clinic", legalName: "Lumière Group Pty Ltd" }),
      admin,
    );
  });

  it("offers a pre-scoped add for an account without an entity (no free-text owner id)", async () => {
    await renderSettled();
    const row = rowOf("Dr Elias Voss");
    await userEvent.click(within(row).getByRole("button", { name: "Add business entity" }));
    expect(screen.getByText("Owner id · u-voss")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("e.g. clinic-lumiere")).not.toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText("e.g. Lumière Clinic Pty Ltd"), "Voss Aesthetics Pty Ltd");
    await userEvent.click(screen.getByRole("button", { name: "Add entity" }));
    expect(setBusinessEntity).toHaveBeenCalledWith(
      expect.objectContaining({ id: "u-voss", type: "independentDoctor", legalName: "Voss Aesthetics Pty Ltd" }),
      admin,
    );
  });

  it("toggles an entity's active state from the row", async () => {
    await renderSettled();
    await userEvent.click(within(rowOf("Ava Lim")).getByRole("button", { name: "Deactivate" }));
    expect(setBusinessEntityActive).toHaveBeenCalledWith("clinic-lumiere", false, admin);
  });
});

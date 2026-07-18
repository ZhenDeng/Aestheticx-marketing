import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Identity } from "@/lib/demo/types";

// Extends the admin-console coverage (components/admin was ~21%) to the per-account actions
// (reset password, delete-with-confirm) and the presence of the catalog / business-entity /
// cooperation management sections. Reuses the live-mode store-mock shape.

const admin: Identity = { user: { id: "u-admin", name: "Priya Nair" }, role: "superAdmin", context: { kind: "independent" } };

const resetUserPassword = vi.fn(async () => {});
const deleteUserAccount = vi.fn(async () => {});

vi.mock("@/lib/demo/auth", () => ({
  useDemoAuth: () => ({ identity: admin, availableIdentities: [admin], selectIdentity: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("@/lib/demo/store", () => ({
  useDemoStore: () => ({
    accounts: () => [
      { id: "u-nurse", name: "Yinghua Xu", email: "nurse@example.com", roles: ["nurse"], mustChangePassword: false },
      { id: "u-admin", name: "Priya Nair", email: "admin@example.com", roles: ["superAdmin"], mustChangePassword: false },
    ],
    cooperationRelationships: () => [],
    listDoctors: () => Promise.resolve([]),
    catalogProducts: () => [],
    businessEntities: () => [],
    resetUserPassword,
    deleteUserAccount,
    createUser: vi.fn(),
    setCooperationRelationship: vi.fn(),
    setProduct: vi.fn(),
    setProductActive: vi.fn(),
    setBusinessEntity: vi.fn(),
    setBusinessEntityActive: vi.fn(),
  }),
}));

import { AdminConsole } from "@/components/admin/AdminConsole";

async function renderSettled() {
  render(<AdminConsole live />);
  await act(async () => {});
}

beforeEach(() => {
  resetUserPassword.mockClear();
  deleteUserAccount.mockClear();
});

describe("AdminConsole per-account actions", () => {
  it("sends a password reset for the account's email and reflects the sent state", async () => {
    const user = userEvent.setup();
    await renderSettled();
    await user.click(screen.getAllByRole("button", { name: /reset password/i })[0]);
    expect(resetUserPassword).toHaveBeenCalledWith("nurse@example.com");
    expect(await screen.findByRole("button", { name: /reset sent/i })).toBeInTheDocument();
  });

  it("requires a confirm before deleting an account login", async () => {
    const user = userEvent.setup();
    await renderSettled();
    // The other account's row (not the admin's own) carries the Delete action.
    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    expect(deleteUserAccount).not.toHaveBeenCalled(); // first click only arms the confirm

    expect(screen.getByText(/delete login\? records kept/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^confirm$/i }));
    expect(deleteUserAccount).toHaveBeenCalledWith("u-nurse");
  });

  it("can back out of a delete via Cancel", async () => {
    const user = userEvent.setup();
    await renderSettled();
    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(screen.queryByText(/delete login\?/i)).not.toBeInTheDocument();
    expect(deleteUserAccount).not.toHaveBeenCalled();
  });

  it("renders the account, cooperation, catalog and business-entity management sections", async () => {
    await renderSettled();
    for (const heading of ["Accounts", "Cooperation relationships", "Product catalog", "Business entities"]) {
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    }
  });
});

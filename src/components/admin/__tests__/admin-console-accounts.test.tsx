import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Identity } from "@/lib/demo/types";

// 17/07 feedback: the manual "Repair access" button is gone (recovery is automatic at
// sign-in via the claims self-heal), and account rows must wrap their action buttons
// instead of pushing the page past the horizontal viewport.

const admin: Identity = { user: { id: "u-admin", name: "Priya Nair" }, role: "superAdmin", context: { kind: "independent" } };

vi.mock("@/lib/demo/auth", () => ({
  useDemoAuth: () => ({ identity: admin, availableIdentities: [admin], selectIdentity: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("@/lib/demo/store", () => ({
  useDemoStore: () => ({
    accounts: () => [
      { id: "u-yinghua", name: "Yinghua Xu", email: "nurse@example.com", roles: ["nurse"], mustChangePassword: false },
      { id: "u-admin", name: "Priya Nair", email: "admin@example.com", roles: ["superAdmin"], mustChangePassword: false },
    ],
    cooperationRelationships: () => [],
    listDoctors: () => Promise.resolve([]),
    catalogProducts: () => [],
    businessEntities: () => [],
    resetUserPassword: vi.fn(),
    deleteUserAccount: vi.fn(),
    createUser: vi.fn(),
    setCooperationRelationship: vi.fn(),
    setProduct: vi.fn(),
    setProductActive: vi.fn(),
    setBusinessEntity: vi.fn(),
    setBusinessEntityActive: vi.fn(),
  }),
}));

import { AdminConsole } from "@/components/admin/AdminConsole";

describe("AdminConsole accounts list (17/07 feedback)", () => {
  it("renders no Repair access button — recovery is automatic at sign-in", () => {
    render(<AdminConsole live />);
    expect(screen.queryByRole("button", { name: /repair access/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/repairing/i)).not.toBeInTheDocument();
  });

  it("keeps the remaining per-account actions", () => {
    render(<AdminConsole live />);
    expect(screen.getAllByRole("button", { name: /reset password/i })).toHaveLength(2);
    // Own row gets no delete action (self-deletion is blocked server-side).
    expect(screen.getAllByRole("button", { name: /^delete$/i })).toHaveLength(1);
  });

  it("lets account rows wrap their actions instead of overflowing horizontally", () => {
    render(<AdminConsole live />);
    for (const row of screen.getAllByRole("listitem")) {
      // Every accounts-list row must be a wrapping flex container so the action
      // cluster can drop below the identity line at narrow widths.
      if (row.textContent?.includes("Reset password")) {
        expect(row.className).toMatch(/flex-wrap/);
      }
    }
    const resetButton = screen.getAllByRole("button", { name: /reset password/i })[0];
    expect(resetButton.parentElement?.className).toMatch(/flex-wrap/);
  });
});

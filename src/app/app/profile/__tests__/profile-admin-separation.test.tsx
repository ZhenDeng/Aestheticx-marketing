import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Identity } from "@/lib/demo/types";

// Constitution §16/Rule 7: the admin console no longer lives inside the (clinical) Profile page —
// it moved to the Admin module. Profile only links out to it for a super admin.

let currentIdentity: Identity;
const profile = { ahpra: "", abn: "", phone: "" };
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/demo/auth", () => ({
  useDemoAuth: () => ({ identity: currentIdentity, availableIdentities: [currentIdentity], selectIdentity: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("@/lib/demo/store", () => ({
  useDemoStore: () => ({
    status: "ready" as const,
    profileForUser: () => profile,
    addressForIdentity: () => "",
    updateProfile: vi.fn(),
    setAddressForIdentity: vi.fn(),
  }),
}));

import ProfilePage from "@/app/app/profile/page";

const admin: Identity = { user: { id: "u-admin", name: "Priya Nair" }, role: "superAdmin", context: { kind: "independent" } };
const doctor: Identity = { user: { id: "u-voss", name: "Dr Voss" }, role: "doctor", context: { kind: "independent" } };

describe("Profile — admin console moved out (constitution §16)", () => {
  it("for a super admin links to the admin console but embeds none of it", () => {
    currentIdentity = admin;
    render(<ProfilePage />);
    const link = screen.getByRole("link", { name: /admin console/i });
    expect(link).toHaveAttribute("href", "/app/admin");
    // The management surfaces must NOT be embedded on the profile page anymore — the console's
    // own "Accounts" heading and its create controls only exist when AdminConsole is rendered.
    expect(screen.queryByRole("heading", { name: /^Accounts$/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Add cooperation relationship/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Create user · assign roles/i)).not.toBeInTheDocument();
  });

  it("shows a doctor no admin console link", () => {
    currentIdentity = doctor;
    render(<ProfilePage />);
    expect(screen.queryByRole("link", { name: /admin console/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Platform administration/i)).not.toBeInTheDocument();
  });
});

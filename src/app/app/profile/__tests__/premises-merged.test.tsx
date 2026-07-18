import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Identity } from "@/lib/demo/types";

// 16/07 feedback enhancement 1: ONE merged "Premises of administration" surface in
// Profile for nurse-role accounts — it leads with the currently selected place of
// practice, clicking it opens the selectable list (switching persists selectedPremiseId,
// the same field the dashboard switcher and authorisation stamping read), and the
// management actions live at the bottom. The free-text Address block disappears for
// nurses (the active premise IS the address); non-nurse accounts keep it.

const nurse: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "independent" } };
const doctor: Identity = { user: { id: "u-voss", name: "Dr Elena Voss" }, role: "doctor", context: { kind: "independent" } };

let currentIdentity: Identity;
let profile: Record<string, unknown>;
const updateProfile = vi.fn();

vi.mock("next/navigation", () => ({ usePathname: () => "/app", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/demo/auth", () => ({
  useDemoAuth: () => ({ identity: currentIdentity, availableIdentities: [currentIdentity], selectIdentity: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("@/lib/demo/store", () => ({
  useDemoStore: () => ({
    status: "ready" as const,
    profileForUser: () => profile,
    addressForIdentity: () => "",
    updateProfile,
    setAddressForIdentity: vi.fn(),
  }),
}));

import ProfilePage from "@/app/app/profile/page";

const ADDRESS_PLACEHOLDER = "14 Acland St, St Kilda VIC";

beforeEach(() => {
  updateProfile.mockReset();
  profile = {
    ahpra: "", abn: "", phone: "", address: "", principalPlace: "",
    premises: [
      { id: "p1", name: "Harbour Clinic", address: "1 Quay St, Sydney" },
      { id: "p2", name: "Westside Rooms", address: "22 West St, Parramatta" },
    ],
    defaultPremiseId: "p1",
    selectedPremiseId: "p2",
  };
});

describe("Profile — merged premises of administration (16/07 enhancement 1)", () => {
  it("nurse: no free-text Address block — the active premise is the address display", () => {
    currentIdentity = nurse;
    render(<ProfilePage />);
    expect(screen.queryByPlaceholderText(ADDRESS_PLACEHOLDER)).not.toBeInTheDocument();
    // The current selection leads the card and is clickable.
    const current = screen.getByRole("button", { name: /westside rooms/i });
    expect(current).toHaveAttribute("aria-expanded", "false");
    expect(current).toHaveTextContent("22 West St, Parramatta");
  });

  it("clicking the current selection opens the list; picking another premise switches it", async () => {
    currentIdentity = nurse;
    render(<ProfilePage />);
    await userEvent.click(screen.getByRole("button", { name: /westside rooms/i }));
    await userEvent.click(screen.getByRole("button", { name: /harbour clinic/i }));
    expect(updateProfile).toHaveBeenCalledWith({ selectedPremiseId: "p1" }, nurse);
  });

  it("management actions sit at the bottom of the open list (Add after every row)", async () => {
    currentIdentity = nurse;
    render(<ProfilePage />);
    await userEvent.click(screen.getByRole("button", { name: /westside rooms/i }));
    const row = screen.getByRole("button", { name: /harbour clinic/i });
    const add = screen.getByRole("button", { name: /add premise/i });
    expect(row.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Per-row management stays reachable.
    expect(screen.getAllByRole("button", { name: /^edit$/i })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /^delete$/i })).toHaveLength(2);
  });

  it("doctor (no nurse role): the Address block renders as before", () => {
    currentIdentity = doctor;
    profile = { ...profile, premises: [] };
    render(<ProfilePage />);
    expect(screen.getByPlaceholderText(ADDRESS_PLACEHOLDER)).toBeInTheDocument();
  });
});

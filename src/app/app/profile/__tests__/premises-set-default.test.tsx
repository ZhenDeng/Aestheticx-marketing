import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Identity } from "@/lib/demo/types";

// Owner feedback 06/08: the "Default" badge could never be moved. Editing a premise's address
// always worked; what was missing was any way to say WHICH premise is the default — selecting a
// row set selectedPremiseId only. These lock the new per-row control.

const nurse: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "independent" } };

const A = { id: "p-a", name: "Bondi rooms", address: "1 A St, Bondi NSW 2026" };
const B = { id: "p-b", name: "Surry rooms", address: "2 B St, Surry Hills NSW 2010" };

let profile: Record<string, unknown>;
const updateProfile = vi.fn();

vi.mock("next/navigation", () => ({ usePathname: () => "/app", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/demo/auth", () => ({
  useDemoAuth: () => ({ identity: nurse, availableIdentities: [nurse], selectIdentity: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("@/lib/demo/store", () => ({
  useDemoStore: () => ({
    status: "ready" as const,
    profileForUser: () => profile,
    addressForIdentity: () => "",
    updateProfile,
    setAddressForIdentity: vi.fn(),
    clinicByID: () => null,
  }),
}));

import ProfilePage from "@/app/app/profile/page";

beforeEach(() => {
  updateProfile.mockReset();
  profile = {
    ahpra: "", abn: "", phone: "", address: "", principalPlace: "",
    premises: [A, B], defaultPremiseId: A.id, selectedPremiseId: A.id,
  };
});

/** The premises list is behind the current-selection card. Returns the list rows — the card
 *  header repeats the active premise's name, so queries must be scoped to the list. */
async function openList() {
  const { container } = render(<ProfilePage />);
  await userEvent.click(screen.getByRole("button", { name: /bondi rooms/i }));
  const rows = [...container.querySelectorAll("li")];
  return (name: string) => rows.find((li) => li.textContent?.includes(name))!;
}

describe("Profile — changing which premise is the default", () => {
  it("offers 'Set as default' on a premise that is not the default", async () => {
    const row = await openList();
    expect(row(B.name)).toHaveTextContent(/set as default/i);
  });

  it("does not offer it on the premise that is already the default", async () => {
    const row = await openList();
    expect(row(A.name)).not.toHaveTextContent(/set as default/i);
  });

  it("moves the default without touching the current selection", async () => {
    await openList();
    await userEvent.click(screen.getByRole("button", { name: /set as default/i }));
    expect(updateProfile).toHaveBeenCalledWith({ defaultPremiseId: B.id }, nurse);
  });

  // Three actions beside the name squeezed "Sarah Chen Aesthetics" down to "Sarah" at 375px.
  it("stacks the row's actions under the premise on mobile, side-by-side from sm up", async () => {
    const row = await openList();
    const actions = row(B.name).querySelector("div > div")!;
    expect(actions.parentElement!.className).toMatch(/\bflex-col\b/);
    expect(actions.parentElement!.className).toMatch(/\bsm:flex-row\b/);
  });

  it("is separate from picking the premise to work from", async () => {
    await openList();
    // Clicking the row itself still only changes the selection, as before.
    await userEvent.click(screen.getByRole("button", { name: /surry rooms/i }));
    expect(updateProfile).toHaveBeenCalledWith({ selectedPremiseId: B.id }, nurse);
  });
});

// 02/08 owner request: the doctor's electronic-signature card on the dashboard — drawn
// once, saved on the profile, printed in the approval PDF's signature block. Canvas
// drawing itself is exercised in E2E (jsdom has no 2D context); this covers the card's
// states and the profile write on removal.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyState } from "@/lib/demo/backend";
import type { DemoState, Identity, UserProfile } from "@/lib/demo/types";

const voss: Identity = { user: { id: "u-voss", name: "Dr Elena Voss" }, role: "doctor", context: { kind: "independent" } };
const sarah: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "independent" } };

const NOON = Date.UTC(2026, 7, 2, 2, 0);

let state: DemoState;
let identity: Identity = voss;
let profile: UserProfile;
const updateProfile = vi.fn();

vi.mock("next/navigation", () => ({ usePathname: () => "/app", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/demo/auth", () => ({
  useDemoAuth: () => ({ identity, availableIdentities: [identity], selectIdentity: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("@/lib/demo/store", () => ({
  useDemoStore: () => ({
    state,
    now: NOON,
    status: "ready" as const,
    profileForUser: () => profile,
    pendingRequestsForDoctor: () => [],
    markAppointment: vi.fn(),
    updateProfile,
    rehydrate: vi.fn(),
  }),
}));

import DashboardPage from "@/app/app/dashboard/page";

beforeEach(() => {
  updateProfile.mockReset();
  identity = voss;
  profile = { ahpra: "", abn: "", phone: "", address: "", principalPlace: "", premises: [] };
  state = emptyState();
});

describe("Dashboard — doctor electronic signature", () => {
  it("offers the signature pad to a doctor with none saved", () => {
    render(<DashboardPage />);
    expect(screen.getByRole("heading", { name: /electronic signature/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save signature/i })).toBeDisabled(); // gated on a drawing
    expect(screen.queryByAltText(/your saved signature/i)).not.toBeInTheDocument();
  });

  it("shows the saved signature with Replace/Remove instead of the pad", () => {
    profile = { ...profile, signatureDataUrl: "data:image/jpeg;base64,QUJD" };
    render(<DashboardPage />);
    expect(screen.getByAltText(/your saved signature/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /replace signature/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save signature/i })).not.toBeInTheDocument();
  });

  it("Remove clears the profile signature for the doctor identity", async () => {
    profile = { ...profile, signatureDataUrl: "data:image/jpeg;base64,QUJD" };
    render(<DashboardPage />);
    await userEvent.click(screen.getByRole("button", { name: /^remove$/i }));
    expect(updateProfile).toHaveBeenCalledWith({ signatureDataUrl: "" }, voss);
  });

  it("never renders for an account with no doctor identity", () => {
    identity = sarah;
    render(<DashboardPage />);
    expect(screen.queryByRole("heading", { name: /electronic signature/i })).not.toBeInTheDocument();
  });
});

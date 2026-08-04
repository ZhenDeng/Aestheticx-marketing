import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ClinicRef, Identity } from "@/lib/demo/types";

// Owner feedback 04/08 bug 1: switching "Practise as" from one clinic nurse identity to
// another left "Premises of administration" showing the previous (personal) selection.
// A clinic-context nurse's premise of administration IS the employing clinic's address —
// submitRequest stamps null and the documents print the clinic's premise — so the profile
// must show the CLINIC's premise for a clinic identity, switching automatically with it.
// The personal premise manager belongs to the independent identity only.

const clinicWithAddress: ClinicRef = { id: "clinic-mara", name: "Mara.H Skin&Aesthetics Clinic", address: "12 Harbour Rd, Mosman NSW 2088" };
const clinicNoAddress: ClinicRef = { id: "clinic-internal", name: "Internal Clinic" };

const nurseAt = (clinic: ClinicRef): Identity => ({
  user: { id: "u-zhexia", name: "Zhexia Shah Wang" },
  role: "nurse",
  context: { kind: "clinic", clinic },
});

let currentIdentity: Identity;
let clinicDirectory: Record<string, ClinicRef>;
const updateProfile = vi.fn();

vi.mock("next/navigation", () => ({ usePathname: () => "/app", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/demo/auth", () => ({
  useDemoAuth: () => ({ identity: currentIdentity, availableIdentities: [currentIdentity], selectIdentity: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("@/lib/demo/store", () => ({
  useDemoStore: () => ({
    status: "ready" as const,
    profileForUser: () => ({
      ahpra: "", abn: "", phone: "", address: "", principalPlace: "",
      premises: [{ id: "p1", name: "My Home Rooms", address: "1 Personal St, Sydney" }],
      defaultPremiseId: "p1",
      selectedPremiseId: "p1",
    }),
    addressForIdentity: () => "",
    updateProfile,
    setAddressForIdentity: vi.fn(),
    clinicByID: (id: string) => clinicDirectory[id] ?? null,
  }),
}));

import ProfilePage from "@/app/app/profile/page";

beforeEach(() => {
  updateProfile.mockReset();
  clinicDirectory = {};
});

describe("Profile — premises of administration follows the active clinic identity", () => {
  it("clinic nurse: shows the CLINIC's premise, not the personal premise list", () => {
    currentIdentity = nurseAt(clinicWithAddress);
    render(<ProfilePage />);
    const section = screen.getByText("Premises of administration").closest("section")!;
    expect(section).toHaveTextContent("Mara.H Skin&Aesthetics Clinic");
    expect(section).toHaveTextContent("12 Harbour Rd, Mosman NSW 2088");
    // The personal premise manager stays with the independent identity.
    expect(screen.queryByText("My Home Rooms")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add premise/i })).not.toBeInTheDocument();
  });

  it("switching to a different clinic identity switches the premise display with it", () => {
    currentIdentity = nurseAt(clinicWithAddress);
    const { unmount } = render(<ProfilePage />);
    expect(screen.getByText("12 Harbour Rd, Mosman NSW 2088")).toBeInTheDocument();
    unmount();
    currentIdentity = nurseAt({ id: "clinic-internal", name: "Internal Clinic", address: "3 George St, Sydney NSW 2000" });
    render(<ProfilePage />);
    expect(screen.getByText("3 George St, Sydney NSW 2000")).toBeInTheDocument();
    expect(screen.queryByText("12 Harbour Rd, Mosman NSW 2088")).not.toBeInTheDocument();
  });

  it("falls back to the store's clinic directory when the identity's ClinicRef has no address", () => {
    currentIdentity = nurseAt(clinicNoAddress);
    clinicDirectory = { "clinic-internal": { id: "clinic-internal", name: "Internal Clinic", address: "3 George St, Sydney NSW 2000" } };
    render(<ProfilePage />);
    expect(screen.getByText("3 George St, Sydney NSW 2000")).toBeInTheDocument();
  });

  it("explains instead of guessing when no address is resolvable", () => {
    currentIdentity = nurseAt(clinicNoAddress);
    render(<ProfilePage />);
    const section = screen.getByText("Premises of administration").closest("section")!;
    expect(section).toHaveTextContent("Internal Clinic");
    expect(section).toHaveTextContent(/managed by the clinic/i);
  });

  it("independent nurse keeps the personal premise manager", () => {
    currentIdentity = { user: { id: "u-zhexia", name: "Zhexia Shah Wang" }, role: "nurse", context: { kind: "independent" } };
    render(<ProfilePage />);
    expect(screen.getByText("My Home Rooms")).toBeInTheDocument();
  });
});

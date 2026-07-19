import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Identity, UserProfile } from "@/lib/demo/types";

// Provisioning requires a phone of every account (userAdmin.ts) and a principal place of practice
// of every doctor — both print on the Clause 68C direction and are stamped onto each authorisation
// at approval. Editing let a doctor take them straight back out again: from that moment every
// authorisation they approve stamps nothing, and every direction drawn from it is permanently
// blocked for the nurse holding it, with no signal to the doctor that they caused it.

let currentIdentity: Identity;
let profile: UserProfile;
const updateProfile = vi.fn();
const setAddressForIdentity = vi.fn();

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
    setAddressForIdentity,
  }),
}));

import ProfilePage from "@/app/app/profile/page";

const doctor: Identity = { user: { id: "u-voss", name: "Dr Voss" }, role: "doctor", context: { kind: "independent" } };
const admin: Identity = { user: { id: "u-admin", name: "Priya Nair" }, role: "superAdmin", context: { kind: "independent" } };

const save = () => screen.getByRole("button", { name: /save/i });
const phoneField = () => screen.getByLabelText(/^phone/i) as HTMLInputElement;

beforeEach(() => {
  updateProfile.mockClear();
  setAddressForIdentity.mockClear();
  currentIdentity = doctor;
  profile = {
    ahpra: "MED0001", abn: "", phone: "02 9388 4410", address: "",
    principalPlace: "A. Voss Medical, 88 Oxford St, Paddington NSW 2021", premises: [],
  };
});

describe("A required contact field cannot be cleared", () => {
  it("refuses to save a doctor's cleared phone, and explains the consequence", async () => {
    const user = userEvent.setup();
    render(<ProfilePage />);

    await user.clear(phoneField());
    await user.click(save());

    expect(updateProfile).not.toHaveBeenCalled();
    // Not merely "required" — say what it breaks, since the doctor never sees the consequence.
    expect(screen.getByRole("alert").textContent).toMatch(/direction/i);
  });

  it("refuses to save a doctor's cleared principal place of practice", async () => {
    const user = userEvent.setup();
    render(<ProfilePage />);

    await user.clear(screen.getByLabelText(/principal place of practice/i));
    await user.click(save());

    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("treats whitespace as blank", async () => {
    const user = userEvent.setup();
    render(<ProfilePage />);

    await user.clear(phoneField());
    await user.type(phoneField(), "   ");
    await user.click(save());

    expect(updateProfile).not.toHaveBeenCalled();
  });

  // A refused save must apply NOTHING: a partial save would leave the form showing values that
  // were never stored, with no way for the user to tell which took.
  it("applies no part of a save that carries a blank required field", async () => {
    const user = userEvent.setup();
    render(<ProfilePage />);

    await user.clear(screen.getByLabelText(/ahpra/i));
    await user.type(screen.getByLabelText(/ahpra/i), "MED9999");
    await user.clear(phoneField());
    await user.click(save());

    expect(updateProfile).not.toHaveBeenCalled();
    expect(setAddressForIdentity).not.toHaveBeenCalled();
  });

  // Found by driving it in a browser, not by the tests above: a stored message went stale.
  // Restoring the original value makes the form clean, so the Save button disappears — leaving
  // the user reading an error about a field they had already fixed, with no way to dismiss it.
  it("clears the refusal as soon as the field is corrected, without a second save", async () => {
    const user = userEvent.setup();
    render(<ProfilePage />);

    await user.clear(phoneField());
    await user.click(save());
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await user.type(phoneField(), "02 9000 3333");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(phoneField()).toHaveAttribute("aria-invalid", "false");
  });

  // Reporting only the first blocked field would send a doctor with a fresh profile round the
  // loop twice: fix phone, save, meet a brand-new error about a field that was blank all along.
  // The direction dialog marks every missing field at once; this matches it.
  it("marks every blocked field at once, not just the first", async () => {
    const user = userEvent.setup();
    render(<ProfilePage />);

    await user.clear(phoneField());
    await user.clear(screen.getByLabelText(/principal place of practice/i));
    await user.click(save());

    expect(phoneField()).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(/principal place of practice/i)).toHaveAttribute("aria-invalid", "true");

    const message = screen.getByRole("alert").textContent ?? "";
    expect(message).toMatch(/phone number/i);
    expect(message).toMatch(/principal place of practice/i);
    // Plural agreement, since two fields are named.
    expect(message).toMatch(/are required/i);
  });

  it("still saves a valid change, showing no refusal", async () => {
    const user = userEvent.setup();
    render(<ProfilePage />);

    await user.clear(phoneField());
    await user.type(phoneField(), "02 9000 1111");
    await user.click(save());

    expect(updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ phone: "02 9000 1111" }),
      expect.anything(),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // Principal place is a doctor field; an account holding no doctor role is neither shown it
  // nor required to supply one.
  it("does not require a principal place of an account that holds no doctor role", async () => {
    const user = userEvent.setup();
    currentIdentity = admin;
    profile = { ...profile, principalPlace: "" };
    render(<ProfilePage />);

    expect(screen.queryByLabelText(/principal place of practice/i)).not.toBeInTheDocument();

    await user.clear(phoneField());
    await user.type(phoneField(), "02 9000 2222");
    await user.click(save());

    expect(updateProfile).toHaveBeenCalled();
  });
});

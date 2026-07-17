import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Identity } from "@/lib/demo/types";

// FirstLoginPassword is the forced password-change gate (live-only). 0% coverage. It gates submit
// behind the PasswordPolicy AND a matching confirmation, and has a special recovery message for
// FirstLoginConfirmError (password saved, server confirmation failed). These tests pin all three.

function baseAuth() {
  return {
    identity: { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "independent" } } as Identity,
    completeFirstLogin: vi.fn(async () => {}),
    signOut: vi.fn(),
  };
}
let auth: ReturnType<typeof baseAuth>;
vi.mock("@/lib/demo/auth", () => ({ useDemoAuth: () => auth }));

import { FirstLoginPassword } from "@/components/app/FirstLoginPassword";

const VALID = "Str0ng!pass"; // 8+, upper, number, symbol

beforeEach(() => {
  auth = baseAuth();
});

function fields() {
  const inputs = document.querySelectorAll('input[type="password"]');
  return { pw: inputs[0] as HTMLInputElement, confirm: inputs[1] as HTMLInputElement };
}

describe("FirstLoginPassword", () => {
  it("greets the signed-in user by name", () => {
    render(<FirstLoginPassword />);
    expect(screen.getByText(/Welcome, Sarah Chen/)).toBeInTheDocument();
  });

  it("keeps submit disabled until the policy is satisfied and the confirmation matches", async () => {
    const user = userEvent.setup();
    render(<FirstLoginPassword />);
    const submit = screen.getByRole("button", { name: /set password & continue/i });
    const { pw, confirm } = fields();

    expect(submit).toBeDisabled();

    // Weak password → still disabled.
    await user.type(pw, "short");
    expect(submit).toBeDisabled();

    // Strong password but no confirmation → disabled.
    await user.clear(pw);
    await user.type(pw, VALID);
    expect(submit).toBeDisabled();

    // Matching confirmation → enabled.
    await user.type(confirm, VALID);
    expect(submit).toBeEnabled();
  });

  it("warns when the confirmation does not match and blocks submit", async () => {
    const user = userEvent.setup();
    render(<FirstLoginPassword />);
    const { pw, confirm } = fields();

    await user.type(pw, VALID);
    await user.type(confirm, VALID + "x");

    expect(screen.getByText(/don.?t match/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /set password & continue/i })).toBeDisabled();
  });

  it("submits the new password via completeFirstLogin when valid", async () => {
    const user = userEvent.setup();
    render(<FirstLoginPassword />);
    const { pw, confirm } = fields();

    await user.type(pw, VALID);
    await user.type(confirm, VALID);
    await user.click(screen.getByRole("button", { name: /set password & continue/i }));

    expect(auth.completeFirstLogin).toHaveBeenCalledWith(VALID);
  });

  it("shows the recovery message for a FirstLoginConfirmError (password saved, confirm failed)", async () => {
    const confirmErr = new Error("confirm failed");
    confirmErr.name = "FirstLoginConfirmError";
    auth.completeFirstLogin = vi.fn(async () => {
      throw confirmErr;
    });
    const user = userEvent.setup();
    render(<FirstLoginPassword />);
    const { pw, confirm } = fields();

    await user.type(pw, VALID);
    await user.type(confirm, VALID);
    await user.click(screen.getByRole("button", { name: /set password & continue/i }));

    expect(await screen.findByText(/new password is saved/i)).toBeInTheDocument();
    // Re-enabled so the user can resubmit and finish confirmation.
    expect(screen.getByRole("button", { name: /set password & continue/i })).toBeEnabled();
  });

  it("shows a generic error for any other failure", async () => {
    auth.completeFirstLogin = vi.fn(async () => {
      throw new Error("network down");
    });
    const user = userEvent.setup();
    render(<FirstLoginPassword />);
    const { pw, confirm } = fields();

    await user.type(pw, VALID);
    await user.type(confirm, VALID);
    await user.click(screen.getByRole("button", { name: /set password & continue/i }));

    expect(await screen.findByText(/could not be set/i)).toBeInTheDocument();
  });

  it("lets the user sign out instead of setting a password", async () => {
    const user = userEvent.setup();
    render(<FirstLoginPassword />);
    await user.click(screen.getByRole("button", { name: /sign out/i }));
    expect(auth.signOut).toHaveBeenCalled();
  });
});

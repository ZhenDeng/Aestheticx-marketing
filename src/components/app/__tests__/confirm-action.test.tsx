import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmAction } from "../ConfirmAction";

// 16/07 feedback bug 3 (safety step): destructive actions get an explicit inline
// two-step — the app's established confirming idiom (account/patient/relationship
// deletes) extracted into one shared component so calendar cancel and invoice delete
// use identical grammar.

describe("ConfirmAction", () => {
  it("renders the idle trigger only", () => {
    render(<ConfirmAction label="Cancel" prompt="Cancel this appointment?" confirmLabel="Cancel appointment" onConfirm={() => {}} />);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.queryByText("Cancel this appointment?")).not.toBeInTheDocument();
  });

  it("asks before executing: trigger → prompt + confirm/keep, nothing fired yet", async () => {
    const onConfirm = vi.fn();
    render(<ConfirmAction label="Cancel" prompt="Cancel this appointment?" confirmLabel="Cancel appointment" onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Cancel this appointment?")).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cancel appointment" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep" })).toBeInTheDocument();
  });

  it("Keep declines: returns to idle without firing", async () => {
    const onConfirm = vi.fn();
    render(<ConfirmAction label="Cancel" prompt="Cancel this appointment?" confirmLabel="Cancel appointment" onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.queryByText("Cancel this appointment?")).not.toBeInTheDocument();
  });

  it("confirming fires once and resets to idle", async () => {
    const onConfirm = vi.fn();
    render(<ConfirmAction label="Cancel" prompt="Cancel this appointment?" confirmLabel="Cancel appointment" onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel appointment" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });
});

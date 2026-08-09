import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import PasswordInput from "@/components/app/PasswordInput";

// The reveal toggle swaps the input between password and text without losing the
// value, and its accessible name flips so screen readers track the state.

describe("PasswordInput", () => {
  it("starts obscured and reveals on toggle, keeping the value", async () => {
    const user = userEvent.setup();
    render(<PasswordInput defaultValue="secret" />);

    const input = document.querySelector("input") as HTMLInputElement;
    expect(input.type).toBe("password");

    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(input.type).toBe("text");
    expect(input.value).toBe("secret");

    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input.type).toBe("password");
  });

  it("does not submit the surrounding form when toggled", async () => {
    const user = userEvent.setup();
    let submitted = false;
    render(
      <form onSubmit={(e) => { e.preventDefault(); submitted = true; }}>
        <PasswordInput defaultValue="x" />
      </form>,
    );
    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(submitted).toBe(false);
  });
});

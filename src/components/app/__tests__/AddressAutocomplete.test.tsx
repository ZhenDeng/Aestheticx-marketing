import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

// The address combobox sits on clinical and admin forms whose values print onto legal
// documents. What matters is that suggestions ASSIST without ever taking over: typed text is
// always kept, a geocoder outage is invisible, and selecting does not re-trigger a lookup.

const searchAddresses = vi.fn();
vi.mock("@/lib/addressSearch", () => ({ searchAddresses: (...args: unknown[]) => searchAddresses(...args) }));

import { AddressAutocomplete } from "@/components/app/AddressAutocomplete";

function Harness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <AddressAutocomplete value={value} onChange={setValue} debounceMs={0} ariaLabel="Address" />
      <output>{value}</output>
    </form>
  );
}

const MELBOURNE = [
  { id: "a", label: "12 Smith Street, Richmond VIC 3121" },
  { id: "b", label: "12 Smith Street, Fitzroy VIC 3065" },
];

beforeEach(() => {
  searchAddresses.mockReset();
  searchAddresses.mockResolvedValue(MELBOURNE);
});

describe("AddressAutocomplete", () => {
  it("suggests matching addresses once the user types", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole("combobox"), "12 Smith");
    expect(await screen.findByRole("option", { name: /Richmond VIC 3121/ })).toBeInTheDocument();
  });

  it("fills the field with the chosen suggestion", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole("combobox"), "12 Smith");
    await user.click(await screen.findByRole("option", { name: /Fitzroy VIC 3065/ }));

    expect(screen.getByRole("combobox")).toHaveValue("12 Smith Street, Fitzroy VIC 3065");
    // Dismissed after selection — the filled value must not immediately re-open a list.
    await waitFor(() => expect(screen.queryByRole("option")).not.toBeInTheDocument());
  });

  it("selects with the keyboard without submitting the form", async () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    const user = userEvent.setup();
    function KeyboardHarness() {
      const [value, setValue] = useState("");
      return (
        <form onSubmit={onSubmit}>
          <AddressAutocomplete value={value} onChange={setValue} debounceMs={0} ariaLabel="Address" />
        </form>
      );
    }
    render(<KeyboardHarness />);
    const input = screen.getByRole("combobox");
    await user.type(input, "12 Smith");
    await screen.findByRole("option", { name: /Richmond/ });

    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(input).toHaveValue("12 Smith Street, Fitzroy VIC 3065");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("dismisses the list on Escape and keeps the typed text", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole("combobox");
    await user.type(input, "12 Smith");
    await screen.findByRole("option", { name: /Richmond/ });

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(input).toHaveValue("12 Smith");
  });

  it("keeps free text when the geocoder returns nothing", async () => {
    searchAddresses.mockResolvedValue([]);
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole("combobox");
    await user.type(input, "Lot 7 Bushmans Rd");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(input).toHaveValue("Lot 7 Bushmans Rd");
  });

  it("does not look up an address it was mounted with", async () => {
    render(<Harness initial="12 Smith Street, Richmond VIC 3121" />);
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveValue("12 Smith Street, Richmond VIC 3121"));
    expect(searchAddresses).not.toHaveBeenCalled();
  });

  it("does not look up a query shorter than four characters", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole("combobox"), "12 ");
    expect(searchAddresses).not.toHaveBeenCalled();
  });
});

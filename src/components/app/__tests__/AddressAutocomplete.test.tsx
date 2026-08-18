import { act, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AddressPrediction } from "@/lib/firebase/addressLookup";

import { AddressAutocomplete } from "@/components/app/AddressAutocomplete";

const SESSION_ONE = "d9428888-122b-4a8f-a585-89e1f51ed487";
const SESSION_TWO = "745dce9c-2ad7-4948-a456-8de53be4fe4e";
const PREDICTIONS: AddressPrediction[] = [
  { placeId: "place-1", label: "12 Smith Street, Richmond VIC 3121, Australia" },
  { placeId: "place-2", label: "12 Smith Street, Fitzroy VIC 3065, Australia" },
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function Harness({
  autocomplete = vi.fn().mockResolvedValue(PREDICTIONS),
  resolve = vi.fn().mockResolvedValue("12 Smith Street, Richmond VIC 3121, Australia"),
  onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault()),
}: {
  autocomplete?: (input: string, sessionToken: string) => Promise<AddressPrediction[]>;
  resolve?: (placeId: string, input: string, sessionToken: string) => Promise<string>;
  onSubmit?: (event: React.FormEvent) => void;
}) {
  const [address, setAddress] = useState("");
  return (
    <form onSubmit={onSubmit}>
      <label>
        Address
        <AddressAutocomplete
          value={address}
          onChange={setAddress}
          className="address-field"
          autocomplete={autocomplete}
          resolve={resolve}
        />
      </label>
      <output>{address}</output>
    </form>
  );
}

function typeAddress(value: string) {
  const input = screen.getByRole("combobox", { name: "Address" });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value } });
  return input;
}

async function advance(milliseconds = 250) {
  await act(async () => {
    vi.advanceTimersByTime(milliseconds);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(globalThis.crypto, "randomUUID")
    .mockReturnValueOnce(SESSION_ONE)
    .mockReturnValue(SESSION_TWO);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("AddressAutocomplete", () => {
  it("starts one UUID session at four trimmed characters and debounces lookup for 250 ms", async () => {
    const autocomplete = vi.fn().mockResolvedValue(PREDICTIONS);
    render(<Harness autocomplete={autocomplete} />);

    typeAddress("123");
    await advance(250);
    expect(autocomplete).not.toHaveBeenCalled();

    typeAddress("1234");
    await advance(249);
    expect(autocomplete).not.toHaveBeenCalled();
    await advance(1);
    expect(autocomplete).toHaveBeenCalledWith("1234", SESSION_ONE);

    typeAddress("12345");
    await advance();
    expect(autocomplete).toHaveBeenLastCalledWith("12345", SESSION_ONE);
    expect(globalThis.crypto.randomUUID).toHaveBeenCalledTimes(1);
  });

  it("continues accepting lookup results after the Strict Mode effect probe", async () => {
    render(<StrictMode><Harness /></StrictMode>);

    typeAddress("12 Smith");
    await advance();

    expect(screen.getByRole("option", { name: /Richmond/ })).toBeInTheDocument();
  });

  it("clears old predictions immediately and ignores late replies for stale queries", async () => {
    const first = deferred<AddressPrediction[]>();
    const second = deferred<AddressPrediction[]>();
    const autocomplete = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    render(<Harness autocomplete={autocomplete} />);

    typeAddress("12 Smith");
    await advance();
    await act(async () => first.resolve(PREDICTIONS));
    expect(screen.getByRole("option", { name: /Richmond/ })).toBeInTheDocument();

    typeAddress("34 Jones");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    await advance();

    typeAddress("56 Brown");
    await act(async () => second.resolve([
      { placeId: "stale", label: "34 Jones Road, Melbourne VIC 3000, Australia" },
    ]));
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("does not automatically activate or resolve the first prediction", async () => {
    const resolve = vi.fn().mockResolvedValue("resolved");
    render(<Harness resolve={resolve} />);

    const input = typeAddress("12 Smith");
    await advance();
    expect(screen.getByRole("option", { name: /Richmond/ })).toHaveAttribute("aria-selected", "false");
    expect(input).not.toHaveAttribute("aria-activedescendant");

    expect(fireEvent.keyDown(input, { key: "Enter" })).toBe(true);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("moves the active descendant with arrow keys and scrolls it into view", async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    render(<Harness />);

    const input = typeAddress("12 Smith");
    await advance();
    const options = screen.getAllByRole("option");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute("aria-activedescendant", options[0].id);
    expect(options[0]).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute("aria-activedescendant", options[1].id);
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input).toHaveAttribute("aria-activedescendant", options[0].id);
    expect(scrollIntoView).toHaveBeenCalledTimes(3);
  });

  it("resolves an explicitly active option on Enter without submitting its form", async () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    const resolve = vi.fn().mockResolvedValue("Unit 5/12 Smith Street, Richmond VIC 3121, Australia");
    render(<Harness resolve={resolve} onSubmit={onSubmit} />);

    const input = typeAddress("Unit 5/12 Smith");
    await advance();
    screen.getAllByRole("option");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(fireEvent.keyDown(input, { key: "Enter" })).toBe(false);
    await act(async () => {});

    expect(resolve).toHaveBeenCalledWith("place-1", "Unit 5/12 Smith", SESSION_ONE);
    expect(input).toHaveValue("Unit 5/12 Smith Street, Richmond VIC 3121, Australia");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("closes on Escape and blur without changing the exact typed text", async () => {
    render(<Harness />);
    const input = typeAddress(" 12 Smith ");
    await advance();
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveValue(" 12 Smith ");

    typeAddress("12 Smiths");
    await advance();
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.blur(input);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveValue("12 Smiths");
  });

  it.each([
    ["pointer", (option: HTMLElement) => fireEvent.pointerDown(option)],
    ["assistive-technology click", (option: HTMLElement) => fireEvent.click(option)],
  ])("resolves a prediction through %s activation", async (_name, activate) => {
    const resolve = vi.fn().mockResolvedValue("12 Smith Street, Richmond VIC 3121, Australia");
    render(<Harness resolve={resolve} />);
    const input = typeAddress("12 Smith");
    await advance();

    activate(screen.getByRole("option", { name: /Richmond/ }));
    await act(async () => {});

    expect(resolve).toHaveBeenCalledWith("place-1", "12 Smith", SESSION_ONE);
    expect(input).toHaveValue("12 Smith Street, Richmond VIC 3121, Australia");
  });

  it("never lets a late resolution overwrite text changed after selection", async () => {
    const pending = deferred<string>();
    const resolve = vi.fn().mockReturnValue(pending.promise);
    const autocomplete = vi.fn().mockResolvedValue(PREDICTIONS);
    render(<Harness autocomplete={autocomplete} resolve={resolve} />);
    const input = typeAddress("12 Smith");
    await advance();

    fireEvent.click(screen.getByRole("option", { name: /Richmond/ }));
    fireEvent.change(input, { target: { value: "Lot 7 Bushmans Rd" } });
    await advance();
    expect(autocomplete).toHaveBeenLastCalledWith("Lot 7 Bushmans Rd", SESSION_TWO);
    await act(async () => pending.resolve("12 Smith Street, Richmond VIC 3121, Australia"));

    expect(input).toHaveValue("Lot 7 Bushmans Rd");
  });

  it("preserves exact free text when lookup or resolution fails", async () => {
    const autocomplete = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(PREDICTIONS);
    const resolve = vi.fn().mockRejectedValue(new Error("details unavailable"));
    render(<Harness autocomplete={autocomplete} resolve={resolve} />);
    const input = typeAddress(" Lot 7 Bushmans Rd ");
    await advance();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveValue(" Lot 7 Bushmans Rd ");

    typeAddress("Unit 5/12 Smith");
    await advance();
    fireEvent.click(screen.getByRole("option", { name: /Richmond/ }));
    await act(async () => {});

    expect(input).toHaveValue("Unit 5/12 Smith");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("keeps native street-address autofill and settles its session on blur", async () => {
    const autocomplete = vi.fn().mockResolvedValue(PREDICTIONS);
    render(<Harness autocomplete={autocomplete} />);
    const input = screen.getByRole("combobox", { name: "Address" });
    expect(input).toHaveAttribute("autocomplete", "street-address");

    fireEvent.focus(input);
    fireEvent.input(input, {
      target: { value: "12 Smith Street, Richmond VIC 3121, Australia" },
      inputType: "insertReplacementText",
    });
    fireEvent.blur(input);
    await advance();
    expect(autocomplete).not.toHaveBeenCalled();

    typeAddress("34 Jones");
    await advance();
    expect(autocomplete).toHaveBeenCalledWith("34 Jones", SESSION_TWO);
  });

  it("shows compliant Google Maps attribution only while predictions are displayed", async () => {
    const autocomplete = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce(PREDICTIONS);
    render(<Harness autocomplete={autocomplete} />);
    typeAddress("12 Smith");
    await advance();
    expect(screen.queryByText("Google Maps")).not.toBeInTheDocument();

    typeAddress("12 Smiths");
    await advance();
    const attribution = screen.getByText("Google Maps");
    expect(attribution).toHaveAttribute("translate", "no");
    expect(attribution).toHaveStyle({
      color: "#5e5e5e",
      fontFamily: "sans-serif",
      fontSize: "12px",
      fontWeight: "400",
      whiteSpace: "nowrap",
    });
    expect(screen.getByRole("listbox").parentElement).toContainElement(attribution);
  });
});

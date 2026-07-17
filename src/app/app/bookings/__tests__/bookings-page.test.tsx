import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { bookingLinkUrl } from "@/lib/demo/booking";
import type { Identity } from "@/lib/demo/types";

// BookingsPage (0% coverage) is the per-user booking-link sharing surface: it mints the user's
// token on first visit, renders the share URL + a copy button, and points approvals at the
// calendar. Uses the REAL bookingLinkUrl helper with mocked auth/store hooks.

const nurse: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "independent" } };

const ensureBookingToken = vi.fn();
function makeStore(over: Partial<ReturnType<typeof base>> = {}) {
  return { ...base(), ...over };
}
function base() {
  return {
    status: "demo" as "loading" | "error" | "demo" | "ready",
    bookingTokenForUser: (_id: string) => "tok-123" as string | undefined,
    ensureBookingToken,
  };
}
let store: ReturnType<typeof base>;
let identity: Identity | null;
vi.mock("@/lib/demo/auth", () => ({ useDemoAuth: () => ({ identity }) }));
vi.mock("@/lib/demo/store", () => ({ useDemoStore: () => store }));

import BookingsPage from "@/app/app/bookings/page";

beforeEach(() => {
  identity = nurse;
  store = makeStore();
  ensureBookingToken.mockReset();
});

describe("BookingsPage", () => {
  it("renders nothing without an identity", () => {
    identity = null;
    const { container } = render(<BookingsPage />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a loading state while the store hydrates", () => {
    store = makeStore({ status: "loading" });
    render(<BookingsPage />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("shows a recoverable error state", () => {
    store = makeStore({ status: "error" });
    render(<BookingsPage />);
    expect(screen.getByText(/could not load data/i)).toBeInTheDocument();
  });

  it("renders the share URL derived from the user's token", () => {
    render(<BookingsPage />);
    const url = bookingLinkUrl("tok-123");
    expect(screen.getByDisplayValue(url)).toBeInTheDocument();
  });

  it("shows the demo-mode banner in demo status", () => {
    render(<BookingsPage />);
    expect(screen.getByText(/demo link/i)).toBeInTheDocument();
  });

  it("mints a token on first visit when the user has none", () => {
    store = makeStore({ bookingTokenForUser: () => undefined });
    render(<BookingsPage />);
    expect(ensureBookingToken).toHaveBeenCalledWith(nurse);
    expect(screen.getByText(/preparing your link/i)).toBeInTheDocument();
  });

  it("does not re-mint when a token already exists", () => {
    render(<BookingsPage />);
    expect(ensureBookingToken).not.toHaveBeenCalled();
  });

  it("copies the link to the clipboard", async () => {
    const user = userEvent.setup();
    // userEvent v14 installs a getter-only clipboard stub during setup() — spy on its
    // writeText rather than reassigning navigator.clipboard.
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    render(<BookingsPage />);

    await user.click(screen.getByRole("button", { name: /^copy$/i }));
    expect(writeText).toHaveBeenCalledWith(bookingLinkUrl("tok-123"));
    await waitFor(() => expect(screen.getByRole("button", { name: /copied/i })).toBeInTheDocument());
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { DEMO_MODE_KEY } from "@/lib/demo/demoMode";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }), usePathname: () => "/app/dashboard" }));

import { DemoAuthProvider } from "@/lib/demo/auth";
import { AuthGuard } from "@/components/app/AuthGuard";

function SignedOut() {
  return (
    <DemoAuthProvider>
      <AuthGuard>
        <div>secret</div>
      </AuthGuard>
    </DemoAuthProvider>
  );
}

beforeEach(() => {
  replace.mockClear();
  window.sessionStorage.clear();
  window.history.pushState({}, "", "/");
});

// No Firebase mock here, so isFirebaseConfigured() is false and the provider is in demo mode —
// which is also the mode a sandbox tab lands in. A signed-out sandbox visitor must bounce to
// the demo picker, not to a live form they have no account for.
describe("AuthGuard", () => {
  it("redirects a signed-out sandbox visitor to /demo", () => {
    render(<SignedOut />);
    expect(replace).toHaveBeenCalledWith("/demo");
    expect(screen.queryByText("secret")).not.toBeInTheDocument();
  });

  it("carries the requested in-app path through ?next=", async () => {
    window.history.pushState({}, "", "/app/calendar?view=week");
    render(<SignedOut />);
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/demo?next=%2Fapp%2Fcalendar%3Fview%3Dweek"),
    );
  });

  it("still targets /demo when the tab carries the sandbox flag", async () => {
    window.sessionStorage.setItem(DEMO_MODE_KEY, "1");
    window.history.pushState({}, "", "/app/patients");
    render(<SignedOut />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/demo?next=%2Fapp%2Fpatients"));
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// The live counterpart to AuthGuard.test.tsx: on a Firebase-configured deployment with no
// sandbox flag, a signed-out visitor must be sent to the real login, not the demo picker.
vi.mock("@/lib/firebase/client", () => ({ isFirebaseConfigured: () => true }));

type WatchCb = (user: { uid: string } | null) => void | Promise<void>;
vi.mock("@/lib/firebase/auth", () => ({
  // Report "signed out" immediately so the guard resolves and redirects.
  watchUser: (cb: WatchCb) => { void cb(null); return () => {}; },
  identitiesForUser: async () => [],
  mustChangePasswordForUser: async () => false,
  currentUserUid: () => null,
  watchClaimsRevision: () => () => {},
  signOutUser: async () => {},
}));

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

describe("AuthGuard (live mode)", () => {
  it("redirects a signed-out live visitor to /login", async () => {
    render(<SignedOut />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(screen.queryByText("secret")).not.toBeInTheDocument();
  });

  it("carries the requested in-app path through ?next=", async () => {
    window.history.pushState({}, "", "/app/calendar");
    render(<SignedOut />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login?next=%2Fapp%2Fcalendar"));
  });
});

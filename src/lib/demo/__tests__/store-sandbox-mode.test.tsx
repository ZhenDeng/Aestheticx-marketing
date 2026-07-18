import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { DEMO_MODE_KEY } from "@/lib/demo/demoMode";

// The store used to derive live/demo by calling isFirebaseConfigured() itself, one line above
// its own useDemoAuth() call. With the sandbox override that becomes a second, disagreeing
// source of truth: the provider would say "demo" while the store still talked to Firestore.
// These tests pin the store to the provider's mode.
vi.mock("@/lib/firebase/client", () => ({ isFirebaseConfigured: () => true }));
vi.mock("@/lib/firebase/auth", () => ({
  watchUser: () => () => {},
  identitiesForUser: async () => [],
  mustChangePasswordForUser: async () => false,
  currentUserUid: () => null,
  signOutUser: async () => {},
}));

const hydrate = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("@/lib/firebase/hydrate", () => ({ hydrate }));

import { DemoStoreProvider, useDemoStore } from "@/lib/demo/store";
import { DemoAuthProvider, useDemoAuth } from "@/lib/demo/auth";

function wrapper({ children }: { children: ReactNode }) {
  return <DemoAuthProvider><DemoStoreProvider>{children}</DemoStoreProvider></DemoAuthProvider>;
}

beforeEach(() => {
  hydrate.mockClear();
  window.sessionStorage.clear();
});

describe("DemoStoreProvider follows the provider's mode", () => {
  it("uses the in-memory seed when the tab is sandboxed, even though Firebase is configured", async () => {
    window.sessionStorage.setItem(DEMO_MODE_KEY, "1");
    const { result } = renderHook(() => useDemoStore(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("demo"));
    // The seed is loaded, not an empty Firestore-backed state.
    expect(Object.keys(result.current.state.patients).length).toBeGreaterThan(0);
    expect(hydrate).not.toHaveBeenCalled();
  });

  it("takes the Firestore-backed path when the tab is not sandboxed", async () => {
    const { result } = renderHook(() => useDemoStore(), { wrapper });
    await act(async () => {});
    // Live: starts empty and waits on the server rather than loading the seed.
    expect(result.current.status).toBe("loading");
    expect(Object.keys(result.current.state.patients)).toHaveLength(0);
  });

  it("rebuilds the store when a live tab enters the sandbox", async () => {
    // The store snapshots its initial state from `live` at mount. Without a rebuild on the
    // mode flip, a tab that entered /demo would keep an empty Firestore-shaped state and
    // never load the seed — the demo would open to a blank app.
    const { result } = renderHook(
      () => ({ store: useDemoStore(), auth: useDemoAuth() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.auth.mode).toBe("live"));

    await act(async () => { result.current.auth.enterDemoMode(); });

    await waitFor(() => expect(result.current.store.status).toBe("demo"));
    expect(Object.keys(result.current.store.state.patients).length).toBeGreaterThan(0);
  });
});

// Overlay refresh loading (20/07 feedback): an action-triggered rehydrate for the SAME
// signed-in identity set must not flip status back to "loading" (which unmounts every page
// into its bare "Loading…" early-return) — it sets the `refreshing` flag the shell overlays
// on, and a refresh failure keeps the rendered data, reporting via the sync-error banner.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { emptyState } from "@/lib/demo/backend";
import { DEMO_ACCOUNTS } from "@/lib/demo/accounts";

const LIVE_IDENTITY = DEMO_ACCOUNTS[2].identities[0];

vi.mock("@/lib/firebase/client", () => ({
  isFirebaseConfigured: () => true,
}));
vi.mock("@/lib/firebase/auth", () => ({
  watchUser: (cb: (u: unknown) => void) => {
    cb({ uid: LIVE_IDENTITY.user.id });
    return () => {};
  },
  identitiesForUser: async () => [LIVE_IDENTITY],
  mustChangePasswordForUser: async () => false,
  currentUserUid: () => LIVE_IDENTITY.user.id,
}));

const hydrate = vi.hoisted(() => vi.fn(async () => emptyState()));
vi.mock("@/lib/firebase/hydrate", () => ({ hydrate }));

import { DemoStoreProvider, useDemoStore } from "@/lib/demo/store";
import { DemoAuthProvider } from "@/lib/demo/auth";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <DemoAuthProvider>
      <DemoStoreProvider>{children}</DemoStoreProvider>
    </DemoAuthProvider>
  );
}

beforeEach(() => {
  hydrate.mockReset();
  hydrate.mockResolvedValue(emptyState());
});

describe("useDemoStore refresh re-hydrate", () => {
  it("keeps status ready and raises `refreshing` during a same-identity rehydrate", async () => {
    const { result } = renderHook(() => useDemoStore(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.refreshing).toBe(false);

    // Second hydrate stays pending until we release it.
    let release!: () => void;
    hydrate.mockImplementationOnce(
      () => new Promise((resolve) => { release = () => resolve(emptyState()); }),
    );
    act(() => result.current.rehydrate());

    await waitFor(() => expect(result.current.refreshing).toBe(true));
    expect(result.current.status).toBe("ready"); // the page stays mounted beneath the overlay

    act(() => release());
    await waitFor(() => expect(result.current.refreshing).toBe(false));
    expect(result.current.status).toBe("ready");
  });

  it("keeps rendered data on a failed refresh and reports through the sync-error banner", async () => {
    const { result } = renderHook(() => useDemoStore(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    hydrate.mockRejectedValueOnce(new Error("network down"));
    act(() => result.current.rehydrate());

    await waitFor(() => expect(result.current.lastSyncError).not.toBeNull());
    expect(result.current.status).toBe("ready"); // never "error" for a refresh
    expect(result.current.refreshing).toBe(false);
  });
});

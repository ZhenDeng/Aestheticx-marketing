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
// Controllable auth: tests can re-fire the watcher with a GROWN identity set, simulating
// the claims-revision chain (admin toggles their own membership → forced token refresh →
// new clinic identity) that re-keys the store's hydrate effect mid-refresh.
let watchCb: ((u: unknown) => void | Promise<void>) | undefined;
let identities = [LIVE_IDENTITY];
vi.mock("@/lib/firebase/auth", () => ({
  watchUser: (cb: (u: unknown) => void) => {
    watchCb = cb;
    cb({ uid: LIVE_IDENTITY.user.id });
    return () => {};
  },
  identitiesForUser: async () => identities,
  mustChangePasswordForUser: async () => false,
  currentUserUid: () => LIVE_IDENTITY.user.id,
  watchClaimsRevision: () => () => {},
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
  identities = [LIVE_IDENTITY];
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

  it("clears `refreshing` when an identity-set change supersedes an in-flight refresh (20/07 self-admin toggle)", async () => {
    // Production repro: the platform admin IS the doctor being granted employee. The toggle
    // starts a refresh; the claims watcher then force-refreshes the token, the identity set
    // grows (new clinic identity), and the hydrate effect re-runs as a FULL load — the
    // cancelled refresh must relinquish `refreshing` or the Syncing overlay never ends.
    const { result } = renderHook(() => useDemoStore(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    // The refresh hydrate hangs (production-sized superAdmin hydrate is slow).
    let releaseRefresh!: () => void;
    hydrate.mockImplementationOnce(
      () => new Promise((resolve) => { releaseRefresh = () => resolve(emptyState()); }),
    );
    act(() => result.current.rehydrate());
    await waitFor(() => expect(result.current.refreshing).toBe(true));

    // Claims chain lands mid-refresh: the identity set grows → identitySetKey changes →
    // the effect re-runs as a full load (not a refresh).
    identities = [
      LIVE_IDENTITY,
      { user: LIVE_IDENTITY.user, role: "doctor" as const, context: { kind: "clinic" as const, clinic: { id: "c-1", name: "Repro Clinic" } } },
    ];
    await act(async () => { await watchCb?.({ uid: LIVE_IDENTITY.user.id }); });

    act(() => releaseRefresh()); // the superseded refresh settles late
    await waitFor(() => expect(result.current.status).toBe("ready"));
    // The overlay flag must not wedge on — this is the "syncing never ends" bug.
    await waitFor(() => expect(result.current.refreshing).toBe(false));
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

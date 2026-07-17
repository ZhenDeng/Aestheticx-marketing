import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Identity } from "@/lib/demo/types";

// 17/07 review findings on the live auth watcher:
// 1. Sign-out while identity resolution is in flight must NOT resurrect a signed-in
//    UI when the stale promise settles (ghost session).
// 2. A rejection inside the watcher callback must not strand `resolved` at false
//    (infinite loading screen) — it must resolve to the signed-out state.

vi.mock("@/lib/firebase/client", () => ({ isFirebaseConfigured: () => true }));

type WatchCb = (user: { uid: string } | null) => void | Promise<void>;
let watchCb: WatchCb;
let currentUid: string | null = null;
let identitiesImpl: () => Promise<Identity[]>;

vi.mock("@/lib/firebase/auth", () => ({
  watchUser: (cb: WatchCb) => { watchCb = cb; return () => {}; },
  identitiesForUser: () => identitiesImpl(),
  mustChangePasswordForUser: async () => false,
  currentUserUid: () => currentUid,
}));

import { DemoAuthProvider, useDemoAuth } from "@/lib/demo/auth";

function wrapper({ children }: { children: ReactNode }) {
  return <DemoAuthProvider>{children}</DemoAuthProvider>;
}

const nurse: Identity = { user: { id: "u-1", name: "Yinghua Xu" }, role: "nurse", context: { kind: "independent" } };

describe("DemoAuthProvider (live watcher hardening)", () => {
  beforeEach(() => { currentUid = null; });

  it("ignores a stale identity resolution that settles after sign-out", async () => {
    let release!: (ids: Identity[]) => void;
    identitiesImpl = () => new Promise((r) => { release = r; });
    const { result } = renderHook(() => useDemoAuth(), { wrapper });
    await act(async () => {}); // flush the dynamic import so the watcher subscribes

    // Sign-in callback fires; resolution hangs.
    currentUid = "u-1";
    await act(async () => { void watchCb({ uid: "u-1" }); });

    // Sign-out lands while the resolution is still in flight.
    currentUid = null;
    await act(async () => { await watchCb(null); });
    expect(result.current.identity).toBeNull();

    // The stale promise finally settles — it must not repopulate the session.
    await act(async () => { release([nurse]); });
    expect(result.current.identity).toBeNull();
    expect(result.current.availableIdentities).toEqual([]);
  });

  it("ignores a stale rejection from a previous user after the next user resolved", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      let rejectA!: (e: Error) => void;
      const resolutions: Array<() => Promise<Identity[]>> = [
        () => new Promise((_r, rej) => { rejectA = rej; }), // user A: hangs, later rejects
        () => Promise.resolve([nurse]),                      // user B: resolves normally
      ];
      identitiesImpl = () => resolutions.shift()!();
      const { result } = renderHook(() => useDemoAuth(), { wrapper });
      await act(async () => {}); // flush the dynamic import so the watcher subscribes

      currentUid = "u-a";
      await act(async () => { void watchCb({ uid: "u-a" }); }); // A's resolution hangs
      currentUid = "u-1";
      await act(async () => { await watchCb({ uid: "u-1" }); }); // B signs in and resolves
      expect(result.current.identity).toEqual(nurse);

      // A's stale rejection lands — it must not stomp B's live session.
      await act(async () => { rejectA(new Error("late failure")); });
      expect(result.current.identity).toEqual(nurse);
      expect(result.current.resolved).toBe(true);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("resolves (signed-out) instead of loading forever when identity resolution rejects", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      identitiesImpl = () => Promise.reject(new Error("firestore unavailable"));
      const { result } = renderHook(() => useDemoAuth(), { wrapper });
      await act(async () => {}); // flush the dynamic import so the watcher subscribes
      currentUid = "u-1";
      await act(async () => { await watchCb({ uid: "u-1" }); });
      await waitFor(() => expect(result.current.resolved).toBe(true));
      expect(result.current.identity).toBeNull();
    } finally {
      errorSpy.mockRestore();
    }
  });
});

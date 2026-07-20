// Sign-out clears the doctor presence flag (20/07 owner question): "I'm online now" lives on
// users/{uid}, not in the session, so without this a doctor who ticked it once stayed
// reachable for ad-hoc requests indefinitely. The standing alwaysAcceptAuth opt-in must NOT
// be touched, and a failure to clear must never block sign-out.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Identity } from "@/lib/demo/types";

vi.mock("@/lib/firebase/client", () => ({ isFirebaseConfigured: () => true }));

type WatchCb = (user: { uid: string } | null) => void | Promise<void>;
let watchCb: WatchCb;
let currentUid: string | null = null;
let identities: Identity[] = [];
const signOutUser = vi.fn(async () => {});
const mirrorClearOnlineStatus = vi.fn(async () => {});

vi.mock("@/lib/firebase/auth", () => ({
  watchUser: (cb: WatchCb) => { watchCb = cb; return () => {}; },
  identitiesForUser: async () => identities,
  mustChangePasswordForUser: async () => false,
  currentUserUid: () => currentUid,
  watchClaimsRevision: () => () => {},
  signOutUser: () => signOutUser(),
}));
vi.mock("@/lib/firebase/mirror", () => ({
  mirrorClearOnlineStatus: () => mirrorClearOnlineStatus(),
}));

import { DemoAuthProvider, useDemoAuth } from "@/lib/demo/auth";

function wrapper({ children }: { children: ReactNode }) {
  return <DemoAuthProvider>{children}</DemoAuthProvider>;
}

const doctor: Identity = { user: { id: "u-1", name: "Dr Jenn Lee" }, role: "doctor", context: { kind: "independent" } };
const nurse: Identity = { user: { id: "u-2", name: "Yinghua Xu" }, role: "nurse", context: { kind: "independent" } };

async function signedIn(who: Identity) {
  identities = [who];
  currentUid = who.user.id;
  const { result } = renderHook(() => useDemoAuth(), { wrapper });
  await act(async () => {}); // flush the dynamic import so the watcher subscribes
  await act(async () => { await watchCb({ uid: who.user.id }); });
  await waitFor(() => expect(result.current.identity).toEqual(who));
  return result;
}

beforeEach(() => {
  signOutUser.mockClear();
  mirrorClearOnlineStatus.mockClear();
  mirrorClearOnlineStatus.mockResolvedValue(undefined);
  currentUid = null;
});

describe("signOut and the doctor presence flag", () => {
  it("clears the online flag before signing a doctor out", async () => {
    const result = await signedIn(doctor);
    await act(async () => { result.current.signOut(); });
    await waitFor(() => expect(signOutUser).toHaveBeenCalled());
    expect(mirrorClearOnlineStatus).toHaveBeenCalledTimes(1);
    // Order matters: the callable needs a still-valid token.
    expect(mirrorClearOnlineStatus.mock.invocationCallOrder[0])
      .toBeLessThan(signOutUser.mock.invocationCallOrder[0]);
    expect(result.current.identity).toBeNull();
  });

  it("does not call the callable for an account that holds no doctor identity", async () => {
    const result = await signedIn(nurse);
    await act(async () => { result.current.signOut(); });
    await waitFor(() => expect(signOutUser).toHaveBeenCalled());
    expect(mirrorClearOnlineStatus).not.toHaveBeenCalled();
  });

  it("still signs out when clearing the flag fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mirrorClearOnlineStatus.mockRejectedValueOnce(new Error("network down"));
      const result = await signedIn(doctor);
      await act(async () => { result.current.signOut(); });
      await waitFor(() => expect(signOutUser).toHaveBeenCalledTimes(1));
      expect(result.current.identity).toBeNull();
    } finally {
      errorSpy.mockRestore();
    }
  });
});

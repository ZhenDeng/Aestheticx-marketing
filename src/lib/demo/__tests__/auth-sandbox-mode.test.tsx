import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { DEMO_MODE_KEY } from "@/lib/demo/demoMode";

// The /demo route must be able to force the in-memory sandbox on a deployment where Firebase
// IS configured — that is the whole point of separating it from /login. These tests pin the
// two subtle parts of that: the mode flips only after the sessionStorage read (so server and
// first client render agree), and the live Firebase watcher must not subscribe during that
// window (a restored live session must never leak into a sandbox tab).
vi.mock("@/lib/firebase/client", () => ({ isFirebaseConfigured: () => true }));

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

let subscribed = 0;
type WatchCb = (user: { uid: string } | null) => void | Promise<void>;
let watchCb: WatchCb | undefined;

vi.mock("@/lib/firebase/auth", () => ({
  watchUser: (cb: WatchCb) => { subscribed += 1; watchCb = cb; return () => {}; },
  identitiesForUser: async () => [],
  mustChangePasswordForUser: async () => false,
  currentUserUid: () => null,
  signOutUser: async () => {},
}));

import { DemoAuthProvider, useDemoAuth } from "@/lib/demo/auth";

function wrapper({ children }: { children: ReactNode }) {
  return <DemoAuthProvider>{children}</DemoAuthProvider>;
}

beforeEach(() => {
  subscribed = 0;
  watchCb = undefined;
  pathname = "/";
  window.sessionStorage.clear();
});

// Being ON /demo is itself demo mode, resolved during render rather than by an effect. This is
// what stops a visitor with a live Firebase session from having the watcher restore it — and
// fire Firestore reads as them — in the commit before the mount effect flips the flag.
describe("DemoAuthProvider (/demo route)", () => {
  it("is in demo mode on /demo before any flag is written", async () => {
    pathname = "/demo";
    const { result } = renderHook(() => useDemoAuth(), { wrapper });
    expect(result.current.mode).toBe("demo");
    await act(async () => {});
    expect(result.current.mode).toBe("demo");
  });

  it("never subscribes the live watcher while on /demo", async () => {
    pathname = "/demo";
    renderHook(() => useDemoAuth(), { wrapper });
    await act(async () => {});
    expect(subscribed).toBe(0);
  });

  it("stays sandboxed after navigating from /demo into the app, via the flag", async () => {
    pathname = "/demo";
    const { result, rerender } = renderHook(() => useDemoAuth(), { wrapper });
    await act(async () => { result.current.enterDemoMode(); });

    pathname = "/app/dashboard"; // the picker routes here
    rerender();
    expect(result.current.mode).toBe("demo");
  });

  it("does not sandbox other routes just because /demo exists", async () => {
    pathname = "/login";
    const { result } = renderHook(() => useDemoAuth(), { wrapper });
    await act(async () => {});
    expect(result.current.mode).toBe("live");
  });
});

describe("DemoAuthProvider (sandbox override)", () => {
  it("stays live on a configured deployment when no sandbox flag is set", async () => {
    const { result } = renderHook(() => useDemoAuth(), { wrapper });
    await act(async () => {});
    expect(result.current.mode).toBe("live");
  });

  it("flips to demo when the sandbox flag is already set for the tab", async () => {
    window.sessionStorage.setItem(DEMO_MODE_KEY, "1");
    const { result } = renderHook(() => useDemoAuth(), { wrapper });
    await waitFor(() => expect(result.current.mode).toBe("demo"));
  });

  it("never subscribes the live watcher when the tab is already sandboxed", async () => {
    // The race this closes: if the watcher subscribed during the pre-read window it could
    // restore a persisted Firebase session and set a REAL clinician's identity moments
    // before the mode flipped to demo.
    window.sessionStorage.setItem(DEMO_MODE_KEY, "1");
    const { result } = renderHook(() => useDemoAuth(), { wrapper });
    await waitFor(() => expect(result.current.mode).toBe("demo"));
    await act(async () => {});
    expect(subscribed).toBe(0);
    expect(watchCb).toBeUndefined();
  });

  it("resolves immediately in demo mode so the guard is never stranded", async () => {
    // A stored `resolved` snapshotted at first render would stay false forever after a
    // post-mount flip, and AuthGuard would render null indefinitely — a blank app.
    window.sessionStorage.setItem(DEMO_MODE_KEY, "1");
    const { result } = renderHook(() => useDemoAuth(), { wrapper });
    await waitFor(() => expect(result.current.mode).toBe("demo"));
    expect(result.current.resolved).toBe(true);
  });

  it("enterDemoMode switches the tab into the sandbox and persists the flag", async () => {
    const { result } = renderHook(() => useDemoAuth(), { wrapper });
    await act(async () => {});
    expect(result.current.mode).toBe("live");

    await act(async () => { result.current.enterDemoMode(); });

    expect(result.current.mode).toBe("demo");
    expect(result.current.resolved).toBe(true);
    expect(window.sessionStorage.getItem(DEMO_MODE_KEY)).toBe("1");
  });

  it("enterDemoMode drops any resolved live identity", async () => {
    window.sessionStorage.setItem(DEMO_MODE_KEY, "1");
    const { result } = renderHook(() => useDemoAuth(), { wrapper });
    await waitFor(() => expect(result.current.mode).toBe("demo"));
    await act(async () => { result.current.enterDemoMode(); });
    expect(result.current.identity).toBeNull();
    expect(result.current.availableIdentities).toEqual([]);
  });

  // Regression: these are called from a mount effect keyed on the callback identity. When they
  // were rebuilt by the context useMemo (deps include `identity`), enterDemoMode's own
  // setIdentity(null) produced a new callback, which re-fired the effect — an infinite render
  // loop that only showed up in the browser. They must be referentially stable.
  it("enterDemoMode and exitDemoMode keep a stable identity across renders", async () => {
    const { result, rerender } = renderHook(() => useDemoAuth(), { wrapper });
    await act(async () => {});
    const enter = result.current.enterDemoMode;
    const exit = result.current.exitDemoMode;

    rerender();
    expect(result.current.enterDemoMode).toBe(enter);
    expect(result.current.exitDemoMode).toBe(exit);

    // Still stable after the state they themselves mutate has changed.
    await act(async () => { result.current.enterDemoMode(); });
    expect(result.current.enterDemoMode).toBe(enter);
    expect(result.current.exitDemoMode).toBe(exit);
  });

  it("exitDemoMode returns the tab to live mode and clears the flag", async () => {
    window.sessionStorage.setItem(DEMO_MODE_KEY, "1");
    const { result } = renderHook(() => useDemoAuth(), { wrapper });
    await waitFor(() => expect(result.current.mode).toBe("demo"));

    await act(async () => { result.current.exitDemoMode(); });

    expect(result.current.mode).toBe("live");
    expect(result.current.identity).toBeNull();
    expect(window.sessionStorage.getItem(DEMO_MODE_KEY)).toBeNull();
  });

  it("signing out of the sandbox returns the tab to live mode", async () => {
    window.sessionStorage.setItem(DEMO_MODE_KEY, "1");
    const { result } = renderHook(() => useDemoAuth(), { wrapper });
    await waitFor(() => expect(result.current.mode).toBe("demo"));

    await act(async () => { result.current.signOut(); });

    expect(window.sessionStorage.getItem(DEMO_MODE_KEY)).toBeNull();
    expect(result.current.mode).toBe("live");
    expect(result.current.identity).toBeNull();
  });
});

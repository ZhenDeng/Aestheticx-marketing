"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Identity } from "./types";
import { DEMO_ACCOUNTS } from "./accounts";
import { pickInitialIdentity, saveSelectedIdentity } from "./identityPrefs";
import { isDemoModeRequested, setDemoMode } from "./demoMode";
import { isFirebaseConfigured } from "@/lib/firebase/client";

type Mode = "demo" | "live";

interface AuthValue {
  mode: Mode;
  identity: Identity | null;
  /**
   * False only during live-mode startup, until the first Firebase auth callback
   * (session restored or confirmed absent). Guards must not redirect before this —
   * a full page load of a deep /app URL would bounce to /login while the persisted
   * session is still restoring. Demo mode resolves immediately.
   */
  resolved: boolean;
  /** Live mode: identities resolved for the signed-in user (may be >1). */
  availableIdentities: Identity[];
  accounts: typeof DEMO_ACCOUNTS;
  /** Demo mode: choose a preset identity directly. */
  signIn: (identity: Identity) => void;
  /** Live mode: email/password sign-in; resolves identities then auto-selects if only one. */
  signInLive: (email: string, password: string, remember?: boolean) => Promise<void>;
  /** Live mode: pick among multiple resolved identities. */
  selectIdentity: (identity: Identity) => void;
  /** Switch THIS tab into the in-memory sandbox (the /demo entry point). */
  enterDemoMode: () => void;
  /** Leave the sandbox and return this tab to the environment-derived mode (the /login entry point). */
  exitDemoMode: () => void;
  signOut: () => void;
  /** Live mode: the first-login gate from the ID token's custom claims (iOS AuthClaims). */
  mustChangePassword: boolean;
  /** Live mode: set the real password + clear the gate via the completeFirstLogin callable. */
  completeFirstLogin: (newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function DemoAuthProvider({ children }: { children: ReactNode }) {
  const envLive = isFirebaseConfigured();
  // Tri-state: null means the sessionStorage read has not happened yet.
  //
  // Reading storage in a lazy useState initializer would make the server-rendered HTML
  // (always live) disagree with the first client render. Starting at null keeps them
  // identical; the mount effect below commits the real value one render later. The null
  // window is also what the watcher effect guards on — see the comment there.
  const [demoOverride, setDemoOverride] = useState<boolean | null>(null);
  const mode: Mode = !envLive || demoOverride === true ? "demo" : "live";

  const [identity, setIdentity] = useState<Identity | null>(null);
  const [availableIdentities, setAvailableIdentities] = useState<Identity[]>([]);
  // Live starts unresolved (Firebase may still be restoring a persisted session). Derived,
  // not stored: `mode` can flip live -> demo after mount, and a value snapshotted at first
  // render would strand `resolved` at false forever — AuthGuard would render null
  // indefinitely, i.e. a blank app in every sandbox tab.
  const [liveResolved, setLiveResolved] = useState(false);
  const resolved = mode === "demo" ? true : liveResolved;
  // Demo mode never gates: mustChangePassword is a live-account claim (createUser sets it).
  const [mustChangePassword, setMustChangePassword] = useState(false);

  // Read this tab's sandbox flag once, on mount (client-only).
  useEffect(() => {
    setDemoOverride(isDemoModeRequested(window.sessionStorage));
  }, []);

  // Live mode: react to Firebase auth state and resolve identities + the first-login gate.
  useEffect(() => {
    // Wait for the sandbox flag to be read before subscribing. Without this guard, a tab
    // that is about to become a sandbox would briefly run the live watcher, which could
    // restore a persisted Firebase session and set a REAL clinician's identity moments
    // before the mode flipped — leaking that identity into the demo.
    if (mode !== "live" || demoOverride === null) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;
    import("@/lib/firebase/auth").then(({ watchUser, identitiesForUser, mustChangePasswordForUser, currentUserUid }) => {
      if (cancelled) return; // cleanup ran before the import resolved — don't subscribe
      unsub = watchUser(async (user) => {
        if (!user) {
          if (!cancelled) { setIdentity(null); setAvailableIdentities([]); setMustChangePassword(false); setLiveResolved(true); }
          return;
        }
        try {
          const [ids, mustChange] = await Promise.all([
            identitiesForUser(user),
            mustChangePasswordForUser(user),
          ]);
          // Stale-resolution guard: identity resolution can take seconds (it may run the
          // claims self-heal). If the user signed out — or a different user signed in —
          // while it was in flight, this result must not resurrect a ghost session.
          if (cancelled || currentUserUid() !== user.uid) return;
          setAvailableIdentities(ids);
          // Restore the user's last-practised identity across reloads (device-local), else
          // the default (first). window is present — this runs only in the browser callback.
          setIdentity((cur) => cur ?? pickInitialIdentity(window.localStorage, user.uid, ids));
          setMustChangePassword(mustChange);
          setLiveResolved(true);
        } catch (error) {
          // A resolution failure must not strand the app on the loading screen — land on
          // the signed-out state (AuthGuard sends the user to /login to retry). Same stale
          // guard as the success path: a late rejection from a PREVIOUS user's resolution
          // must not stomp the current user's live session.
          console.error("Identity resolution failed:", error);
          if (!cancelled && currentUserUid() === user.uid) {
            setIdentity(null); setAvailableIdentities([]); setMustChangePassword(false); setLiveResolved(true);
          }
        }
      });
    });
    return () => { cancelled = true; unsub?.(); };
  }, [mode, demoOverride]);

  const value = useMemo<AuthValue>(
    () => ({
      mode,
      identity,
      resolved,
      availableIdentities,
      accounts: DEMO_ACCOUNTS,
      signIn: setIdentity,
      signInLive: async (email, password, remember = true) => {
        const { signInWithPassword } = await import("@/lib/firebase/auth");
        await signInWithPassword(email, password, remember); // watchUser populates identities
      },
      // Persist every explicit switch so a reload keeps it (see pickInitialIdentity).
      selectIdentity: (id) => {
        if (typeof window !== "undefined") saveSelectedIdentity(window.localStorage, id);
        setIdentity(id);
      },
      // Entering the sandbox deliberately does NOT sign the user out of Firebase: that would
      // be a destructive side effect of merely visiting a marketing page. The watcher has
      // already unsubscribed, so a dormant session cannot interfere, and the user's real
      // session is still there when they return to /login. Clearing the identity is enough.
      enterDemoMode: () => {
        setDemoMode(window.sessionStorage, true);
        setDemoOverride(true);
        setIdentity(null);
        setAvailableIdentities([]);
        setMustChangePassword(false);
      },
      exitDemoMode: () => {
        setDemoMode(window.sessionStorage, false);
        setDemoOverride(false);
        setIdentity(null);
        setAvailableIdentities([]);
        setMustChangePassword(false);
      },
      signOut: () => {
        setIdentity(null);
        setAvailableIdentities([]);
        setMustChangePassword(false);
        // Signing out of the sandbox returns the tab to the environment-derived mode.
        setDemoMode(window.sessionStorage, false);
        setDemoOverride(false);
        if (mode === "live") {
          void import("@/lib/firebase/auth")
            .then((m) => m.signOutUser())
            .catch((e) => console.error("Sign-out failed on the server:", e));
        }
      },
      mustChangePassword,
      completeFirstLogin: async (newPassword) => {
        const m = await import("@/lib/firebase/auth");
        await m.completeFirstLogin(newPassword);
        // The forced token refresh re-fires watchUser with the cleared claim; drop the
        // gate immediately so the UI doesn't wait on that round-trip.
        setMustChangePassword(false);
      },
    }),
    [mode, identity, resolved, availableIdentities, mustChangePassword],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useDemoAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useDemoAuth must be used within DemoAuthProvider");
  return ctx;
}

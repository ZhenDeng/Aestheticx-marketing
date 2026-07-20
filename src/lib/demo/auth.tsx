"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Identity } from "./types";
import { DEMO_ACCOUNTS } from "./accounts";
import { identityKey, pickInitialIdentity, saveSelectedIdentity } from "./identityPrefs";
import { readDemoMode, subscribeDemoMode, writeDemoMode } from "./demoMode";
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

/** The route that is itself the sandbox entry point. */
const DEMO_ROUTE = "/demo";

/** Read once, at module scope: nothing subscribes to hydration, it just happens. */
const noopSubscribe = () => () => {};

export function DemoAuthProvider({ children }: { children: ReactNode }) {
  const envLive = isFirebaseConfigured();
  // The sandbox flag lives in sessionStorage, which the server cannot see. Reading it in a
  // lazy useState initializer would make the prerendered HTML (always live) disagree with the
  // first client render; useSyncExternalStore is the API for exactly this — React renders the
  // server snapshot during hydration, then re-renders with the client snapshot.
  const demoOverride = useSyncExternalStore(
    subscribeDemoMode,
    readDemoMode,
    () => false, // server: never sandboxed
  );
  // True only once the client has taken over. The live watcher below gates on it so it cannot
  // subscribe during the hydration render, when the flag is still the server's guess.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  // Being on /demo IS demo mode, resolved during render on both server and client. The flag
  // alone would be a commit too late on a full page load: DemoLoginForm sets it from a mount
  // effect, so a visitor with a live Firebase session would have the watcher restore it and
  // read Firestore as them first. usePathname needs no Suspense boundary (unlike
  // useSearchParams) and does not opt the route out of static prerendering.
  const onDemoRoute = usePathname() === DEMO_ROUTE;
  const mode: Mode = !envLive || demoOverride || onDemoRoute ? "demo" : "live";

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

  // The login forms call these from a mount effect keyed on the callback identity, so they
  // MUST be referentially stable. Built with useCallback rather than inline in the context
  // useMemo (whose deps include `identity`): enterDemoMode's own setIdentity(null) would
  // otherwise mint a new callback and re-fire that effect forever. Only setters and the
  // module-level store are captured, so the empty dep array is correct.
  const switchMode = useCallback((toDemo: boolean) => {
    writeDemoMode(toDemo); // notifies the store; mode re-derives
    setIdentity(null);
    setAvailableIdentities([]);
    setMustChangePassword(false);
    // Re-arm the resolved gate. Leaving it set would make `resolved` stale-true with a null
    // identity at the moment mode flips to live — exactly the signed-out-looking window the
    // gate exists to hold AuthGuard through while a persisted session restores.
    setLiveResolved(false);
  }, []);
  // Entering the sandbox deliberately does NOT sign the user out of Firebase: that would be a
  // destructive side effect of merely visiting a marketing page. The watcher has already
  // unsubscribed, so a dormant session cannot interfere, and the user's real session is still
  // there when they return to /login. Clearing the identity is enough.
  const enterDemoMode = useCallback(() => switchMode(true), [switchMode]);
  // No-op when there is no sandbox to leave. LiveLoginForm calls this from a mount effect, so
  // it runs for EVERY visitor to /login — including a live user who is already signed in and
  // merely passing back through. Unconditionally clearing `identity` there would strand them:
  // /login forwards a signed-in user to their home, and with the identity gone the forward
  // never fires while AuthGuard bounces them straight back.
  const exitDemoMode = useCallback(() => {
    if (readDemoMode()) switchMode(false);
  }, [switchMode]);

  // Live mode: react to Firebase auth state and resolve identities + the first-login gate.
  useEffect(() => {
    // Wait for hydration before subscribing. Without this guard, a tab that is about to
    // resolve as a sandbox would briefly run the live watcher during the hydration render,
    // which could restore a persisted Firebase session and set a REAL clinician's identity
    // moments before the mode flipped — leaking that identity into the demo.
    if (mode !== "live" || !hydrated) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;
    let unsubClaims: (() => void) | undefined;
    let claimsUid: string | null = null;
    import("@/lib/firebase/auth").then(({ watchUser, identitiesForUser, mustChangePasswordForUser, currentUserUid, watchClaimsRevision }) => {
      if (cancelled) return; // cleanup ran before the import resolved — don't subscribe
      unsub = watchUser(async (user) => {
        if (!user) {
          unsubClaims?.(); unsubClaims = undefined; claimsUid = null;
          if (!cancelled) { setIdentity(null); setAvailableIdentities([]); setMustChangePassword(false); setLiveResolved(true); }
          return;
        }
        // Claims fast path (20/07): one users/{uid} watcher per signed-in uid — a bumped
        // claimsRevision (admin granted/revoked a membership) force-refreshes the token,
        // which re-fires this very callback with the updated identity set in seconds
        // instead of at the next hourly refresh. (Optional call: test mocks may omit it.)
        if (claimsUid !== user.uid) {
          unsubClaims?.();
          claimsUid = user.uid;
          unsubClaims = watchClaimsRevision?.(user.uid);
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
          // The current selection survives ONLY while the fresh set still holds it — a
          // revoked clinic identity must drop out of "practising as" too, not just the
          // switcher list (20/07: revoking employee left it selected and selectable).
          setIdentity((cur) => {
            const stillHeld = cur && cur.user.id === user.uid && ids.some((i) => identityKey(i) === identityKey(cur));
            return stillHeld ? cur : pickInitialIdentity(window.localStorage, user.uid, ids);
          });
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
    return () => { cancelled = true; unsub?.(); unsubClaims?.(); };
  }, [mode, hydrated]);

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
      enterDemoMode,
      exitDemoMode,
      signOut: () => {
        setIdentity(null);
        setAvailableIdentities([]);
        setMustChangePassword(false);
        // Deliberately does NOT leave the sandbox. A clinician who was live signed-in and
        // then wandered into /demo in the same tab would otherwise click "Sign out" and have
        // the watcher restore their dormant Firebase session — ending up signed IN to their
        // real account. Staying sandboxed lets AuthGuard return them to /demo and leaves the
        // real session untouched; /login is the explicit way out (it calls exitDemoMode).
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
    [mode, identity, resolved, availableIdentities, mustChangePassword, enterDemoMode, exitDemoMode],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useDemoAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useDemoAuth must be used within DemoAuthProvider");
  return ctx;
}

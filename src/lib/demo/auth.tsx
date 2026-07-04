"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Identity } from "./types";
import { DEMO_ACCOUNTS } from "./accounts";
import { isFirebaseConfigured } from "@/lib/firebase/client";

type Mode = "demo" | "live";

interface AuthValue {
  mode: Mode;
  identity: Identity | null;
  /** Live mode: identities resolved for the signed-in user (may be >1). */
  availableIdentities: Identity[];
  accounts: typeof DEMO_ACCOUNTS;
  /** Demo mode: choose a preset identity directly. */
  signIn: (identity: Identity) => void;
  /** Live mode: email/password sign-in; resolves identities then auto-selects if only one. */
  signInLive: (email: string, password: string) => Promise<void>;
  /** Live mode: pick among multiple resolved identities. */
  selectIdentity: (identity: Identity) => void;
  signOut: () => void;
  /** Live mode: the first-login gate from the ID token's custom claims (iOS AuthClaims). */
  mustChangePassword: boolean;
  /** Live mode: set the real password + clear the gate via the completeFirstLogin callable. */
  completeFirstLogin: (newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function DemoAuthProvider({ children }: { children: ReactNode }) {
  const mode: Mode = isFirebaseConfigured() ? "live" : "demo";
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [availableIdentities, setAvailableIdentities] = useState<Identity[]>([]);
  // Demo mode never gates: mustChangePassword is a live-account claim (createUser sets it).
  const [mustChangePassword, setMustChangePassword] = useState(false);

  // Live mode: react to Firebase auth state and resolve identities + the first-login gate.
  useEffect(() => {
    if (mode !== "live") return;
    let cancelled = false;
    let unsub: (() => void) | undefined;
    import("@/lib/firebase/auth").then(({ watchUser, identitiesForUser, mustChangePasswordForUser }) => {
      if (cancelled) return; // cleanup ran before the import resolved — don't subscribe
      unsub = watchUser(async (user) => {
        if (!user) {
          if (!cancelled) { setIdentity(null); setAvailableIdentities([]); setMustChangePassword(false); }
          return;
        }
        const [ids, mustChange] = await Promise.all([
          identitiesForUser(user),
          mustChangePasswordForUser(user),
        ]);
        if (cancelled) return;
        setAvailableIdentities(ids);
        setIdentity((cur) => cur ?? ids[0] ?? null);
        setMustChangePassword(mustChange);
      });
    });
    return () => { cancelled = true; unsub?.(); };
  }, [mode]);

  const value = useMemo<AuthValue>(
    () => ({
      mode,
      identity,
      availableIdentities,
      accounts: DEMO_ACCOUNTS,
      signIn: setIdentity,
      signInLive: async (email, password) => {
        const { signInWithPassword } = await import("@/lib/firebase/auth");
        await signInWithPassword(email, password); // watchUser populates identities
      },
      selectIdentity: setIdentity,
      signOut: () => {
        setIdentity(null);
        setAvailableIdentities([]);
        setMustChangePassword(false);
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
    [mode, identity, availableIdentities, mustChangePassword],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useDemoAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useDemoAuth must be used within DemoAuthProvider");
  return ctx;
}

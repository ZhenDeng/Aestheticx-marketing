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
}

const AuthContext = createContext<AuthValue | null>(null);

export function DemoAuthProvider({ children }: { children: ReactNode }) {
  const mode: Mode = isFirebaseConfigured() ? "live" : "demo";
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [availableIdentities, setAvailableIdentities] = useState<Identity[]>([]);

  // Live mode: react to Firebase auth state and resolve identities.
  useEffect(() => {
    if (mode !== "live") return;
    let cancelled = false;
    let unsub: (() => void) | undefined;
    import("@/lib/firebase/auth").then(({ watchUser, identitiesForUser }) => {
      if (cancelled) return; // cleanup ran before the import resolved — don't subscribe
      unsub = watchUser(async (user) => {
        if (!user) {
          if (!cancelled) { setIdentity(null); setAvailableIdentities([]); }
          return;
        }
        const ids = await identitiesForUser(user);
        if (cancelled) return;
        setAvailableIdentities(ids);
        setIdentity((cur) => cur ?? ids[0] ?? null);
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
        if (mode === "live") {
          void import("@/lib/firebase/auth")
            .then((m) => m.signOutUser())
            .catch((e) => console.error("Sign-out failed on the server:", e));
        }
      },
    }),
    [mode, identity, availableIdentities],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useDemoAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useDemoAuth must be used within DemoAuthProvider");
  return ctx;
}

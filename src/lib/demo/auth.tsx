"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { Identity } from "./types";
import { DEMO_ACCOUNTS } from "./accounts";

interface AuthValue {
  identity: Identity | null;
  signIn: (identity: Identity) => void;
  signOut: () => void;
  accounts: typeof DEMO_ACCOUNTS;
}

const AuthContext = createContext<AuthValue | null>(null);

export function DemoAuthProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const value = useMemo<AuthValue>(
    () => ({
      identity,
      signIn: setIdentity,
      signOut: () => setIdentity(null),
      accounts: DEMO_ACCOUNTS,
    }),
    [identity],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useDemoAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useDemoAuth must be used within DemoAuthProvider");
  return ctx;
}

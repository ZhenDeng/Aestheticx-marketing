"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useDemoAuth } from "@/lib/demo/auth";
import { FirstLoginPassword } from "./FirstLoginPassword";

export function AuthGuard({ children }: { children: ReactNode }) {
  const { identity, mustChangePassword } = useDemoAuth();
  const router = useRouter();

  useEffect(() => {
    if (!identity) router.replace("/login");
  }, [identity, router]);

  if (!identity) return null;
  // Live first-login gate (iOS parity): a super-admin-created account must replace its
  // temporary password before anything else renders. Never set in demo mode.
  if (mustChangePassword) return <FirstLoginPassword />;
  return <>{children}</>;
}

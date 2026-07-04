"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useDemoAuth } from "@/lib/demo/auth";
import { loginUrlFor } from "@/lib/demo/authRedirect";
import { FirstLoginPassword } from "./FirstLoginPassword";

export function AuthGuard({ children }: { children: ReactNode }) {
  const { identity, resolved, mustChangePassword } = useDemoAuth();
  const router = useRouter();

  useEffect(() => {
    // Wait for the first auth resolution before redirecting — on a full page load of a
    // deep /app URL the persisted session is still restoring, and bouncing early would
    // lose the requested page. Once resolved-and-signed-out, carry the target through
    // ?next= so the login round-trip lands back here. window.location is read at effect
    // time (client-only) instead of usePathname/useSearchParams — the login page stays
    // statically prerendered and no Suspense boundary is needed.
    if (resolved && !identity) {
      router.replace(loginUrlFor(window.location.pathname, window.location.search));
    }
  }, [resolved, identity, router]);

  if (!identity) return null;
  // Live first-login gate (iOS parity): a super-admin-created account must replace its
  // temporary password before anything else renders. Never set in demo mode.
  if (mustChangePassword) return <FirstLoginPassword />;
  return <>{children}</>;
}

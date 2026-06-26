"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useDemoAuth } from "@/lib/demo/auth";

export function AuthGuard({ children }: { children: ReactNode }) {
  const { identity } = useDemoAuth();
  const router = useRouter();

  useEffect(() => {
    if (!identity) router.replace("/login");
  }, [identity, router]);

  if (!identity) return null;
  return <>{children}</>;
}

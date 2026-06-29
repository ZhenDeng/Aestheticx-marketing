"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { identityBadge } from "@/lib/demo/types";
import { tintStyle } from "@/lib/demo/tint";

const NAV = [
  { href: "/app/dashboard", label: "Dashboard" },
  { href: "/app/patients", label: "Patients" },
  { href: "/app/authorisations", label: "Authorisations" },
  { href: "/app/billing", label: "Billing" },
  { href: "/app/calendar", label: "Calendar" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { identity, signOut } = useDemoAuth();
  const { status, lastSyncError } = useDemoStore();
  const pathname = usePathname();
  if (!identity) return null;

  return (
    <div style={tintStyle(identity)} className="flex min-h-screen flex-col bg-card text-ink">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-field text-card" style={{ background: "var(--color-tint)" }}>
              <span className="font-display text-base">AX</span>
            </span>
            <span className="font-display text-lg">AestheticX</span>
            <span className="micro rounded-full px-2 py-0.5" style={{ background: "var(--color-tint-soft)", color: "var(--color-tint)" }}>
              {status === "demo" ? "Demo · resets on refresh" : "Live"}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-ink-soft sm:inline">{identityBadge(identity)}</span>
            <button onClick={signOut} className="rounded-btn border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-tint/50">
              Sign out
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 px-5 sm:px-8">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`-mb-px border-b-2 px-3 py-2.5 text-sm transition-colors ${
                  active ? "border-tint text-ink" : "border-transparent text-ink-soft hover:text-ink"
                }`}
                style={active ? { borderColor: "var(--color-tint)" } : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      {lastSyncError && (
        <div className="border-b px-5 py-2 text-center text-sm sm:px-8" style={{ background: "var(--color-rose-soft)", color: "var(--color-rose)" }}>
          A change could not be saved to the server. It will reconcile on refresh.
        </div>
      )}
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 sm:px-8">{children}</main>
    </div>
  );
}

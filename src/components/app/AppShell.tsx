"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { identityBadge } from "@/lib/demo/types";
import { navItemsFor, activeNavHref } from "@/lib/demo/nav";
import { tintStyle } from "@/lib/demo/tint";

export function AppShell({ children }: { children: ReactNode }) {
  const { identity, signOut } = useDemoAuth();
  const { status, lastSyncError } = useDemoStore();
  const pathname = usePathname();
  if (!identity) return null;

  // Role-aware primary nav — Platform Admin gets the admin modules, not the clinical shell
  // (constitution §16/Rule 7).
  const nav = navItemsFor(identity.role);
  const activeHref = activeNavHref(nav, pathname);

  return (
    <div style={tintStyle(identity)} className="flex min-h-screen flex-col bg-card text-ink">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 flex-none place-items-center rounded-field text-card" style={{ background: "var(--color-tint)" }}>
              <span className="font-display text-base">AX</span>
            </span>
            <span className="font-display text-lg">AestheticX</span>
            {/* The full "resets on refresh" hint needs room the 320px header hasn't got, so it
                shortens to "Demo" below sm; whitespace-nowrap keeps it on one line either way. */}
            <span className="micro flex-none whitespace-nowrap rounded-full px-2 py-0.5" style={{ background: "var(--color-tint-soft)", color: "var(--color-tint)" }}>
              {status === "demo" ? (
                <>
                  <span className="sm:hidden">Demo</span>
                  <span className="hidden sm:inline">Demo · resets on refresh</span>
                </>
              ) : "Live"}
            </span>
          </div>
          <div className="flex flex-none items-center gap-4">
            <span className="hidden text-sm text-ink-soft sm:inline">{identityBadge(identity)}</span>
            <button onClick={signOut} className="whitespace-nowrap rounded-btn border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-tint/50">
              Sign out
            </button>
          </div>
        </div>
        {/* 14/07 feedback: the horizontal-scroll tab strip was hard to use on mobile —
            below `sm:` every tab is visible at once as a wrapping pill grid; from `sm:`
            up the underline tab strip is unchanged. */}
        <nav className="mx-auto grid max-w-6xl grid-cols-3 gap-1.5 px-5 py-2 sm:flex sm:gap-1 sm:px-8 sm:py-0">
          {nav.map((item) => {
            const active = item.href === activeHref;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-btn border px-1.5 py-2 text-center text-xs leading-tight break-words transition-colors sm:-mb-px sm:shrink-0 sm:whitespace-nowrap sm:rounded-none sm:border-x-0 sm:border-t-0 sm:border-b-2 sm:bg-transparent sm:px-3 sm:py-2.5 sm:text-sm sm:leading-normal ${
                  active
                    ? "border-[var(--color-tint)] bg-[var(--color-tint-soft)] font-medium text-ink"
                    : "border-line bg-card text-ink-soft hover:text-ink sm:border-transparent"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      {lastSyncError && (
        <div className="border-b px-5 py-2 text-center text-sm sm:px-8" style={{ background: "var(--color-rose-soft)", color: "var(--color-rose)" }}>
          {/* 16/07 feedback bug 1: show the ACTUAL categorised reason (permission vs
              transient) the store stored, not one hardcoded string that hid a lockout. */}
          {lastSyncError}
        </div>
      )}
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 sm:px-8">{children}</main>
    </div>
  );
}

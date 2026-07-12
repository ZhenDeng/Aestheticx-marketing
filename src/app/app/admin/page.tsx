"use client";

import Link from "next/link";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { AdminConsole } from "@/components/admin/AdminConsole";

// The Platform Admin home (constitution §16/§18 "Admin" module). Houses account + cooperation
// management, an audit-framed entry to patient records, and the audit log — separate from the
// clinical UI (Rule 7). AuthGuard already keeps non-admins out; the role check is a belt-and-braces.
export default function AdminHomePage() {
  const { identity, mode } = useDemoAuth();
  const store = useDemoStore();
  if (!identity) return null;
  if (identity.role !== "superAdmin") return null;
  if (store.status === "loading") return <p className="text-ink-soft">Loading…</p>;

  return (
    <div className="max-w-3xl">
      <header>
        <h1 className="font-display text-3xl text-ink">Platform administration</h1>
        <p className="micro mt-1 tracking-widest">PLATFORM ADMINISTRATOR</p>
      </header>

      {/* Patient records — deliberately low-prominence and audit-framed, not a patient-list
          workflow (constitution §16 / Rule 7). */}
      <Link href="/app/admin/patients" className="mt-7 flex items-center justify-between gap-3 rounded-card border border-line bg-card px-5 py-4 shadow-card transition-colors hover:border-tint/50">
        <span className="min-w-0">
          <span className="block text-sm font-medium text-ink">Patient records — audit access</span>
          <span className="block text-sm text-ink-soft">Support &amp; audit only. Opening a file is recorded.</span>
        </span>
        <span className="micro flex-none rounded-full px-2 py-0.5" style={{ background: "var(--color-sage-soft)", color: "var(--color-sage)" }}>Recorded</span>
      </Link>

      <Link href="/app/admin/audit" className="mt-3 flex items-center justify-between gap-3 rounded-card border border-line bg-card px-5 py-4 shadow-card transition-colors hover:border-tint/50">
        <span className="min-w-0">
          <span className="block text-sm font-medium text-ink">Audit log</span>
          <span className="block text-sm text-ink-soft">Platform-admin patient access</span>
        </span>
        <span aria-hidden className="flex-none text-ink-soft">›</span>
      </Link>

      <AdminConsole live={mode === "live"} />

      {/* Admin modules the constitution lists under Platform Admin but that aren't built yet.
          (The product catalog is now editable in the console above — Tier 3 #5B.) */}
      <div className="mt-8 rounded-card border border-dashed border-line px-5 py-4">
        <p className="text-sm font-medium text-ink-soft">Business entities</p>
        <p className="mt-0.5 text-sm text-ink-soft">Managed through AestheticX operations for now — in-app admin editing is coming.</p>
      </div>
    </div>
  );
}

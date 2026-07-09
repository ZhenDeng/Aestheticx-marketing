"use client";

import Link from "next/link";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";

// Platform-admin audit log (constitution §21): the Platform Admin patient-file access records,
// newest first. Live durable persistence lands with the broader platform Audit Log — until then
// entries are in-session (noted below), which the store records in both modes.
export default function AdminAuditPage() {
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  if (!identity) return null;
  if (identity.role !== "superAdmin") return null;
  if (store.status === "loading") return <p className="text-ink-soft">Loading…</p>;

  const entries = store.adminAccessAudit();
  const live = store.status !== "demo";

  return (
    <div className="max-w-3xl">
      <Link href="/app/admin" className="text-sm text-ink-soft hover:text-ink">← Admin</Link>
      <h1 className="mt-3 font-display text-3xl text-ink">Audit log</h1>
      <p className="mt-1 text-sm text-ink-soft">Platform-admin patient file access, newest first.</p>
      {live && (
        <p className="mt-3 rounded-field px-3 py-2 text-sm" style={{ background: "var(--color-umber-soft)", color: "var(--color-umber)" }}>
          Records are kept for this session; durable audit storage rolls out with the platform audit log.
        </p>
      )}
      {entries.length === 0 ? (
        <p className="mt-5 text-sm text-ink-soft">No admin patient access recorded yet.</p>
      ) : (
        <ul className="mt-5 rounded-card border border-line bg-card shadow-card">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center gap-3.5 border-b border-line px-4 py-3 last:border-b-0">
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-ink">
                  <span className="font-medium">{e.actorName}</span> opened <span className="font-medium">{e.patientName}</span>
                </span>
                <span className="micro block">Patient file access</span>
              </span>
              <span className="micro flex-none text-ink-soft">{new Date(e.at).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

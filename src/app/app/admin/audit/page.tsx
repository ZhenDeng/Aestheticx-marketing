"use client";

import Link from "next/link";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import type { AuditAction } from "@/lib/demo/types";

// Human labels for each audit action (constitution §21). Anything unmapped falls back to the
// raw verb so a future backend action still renders rather than showing blank.
const ACTION_LABEL: Record<AuditAction, string> = {
  request_created: "Request created",
  request_resubmitted: "Request resubmitted",
  request_withdrawn: "Request withdrawn",
  request_edit_requested: "Edit requested",
  request_approved: "Approved",
  invoice_generated: "Invoice generated",
  invoice_marked_paid: "Invoice marked paid",
  invoice_deleted: "Invoice deleted",
  wallet_topup: "Wallet top-up",
  client_checkout: "Client checkout",
  service_fee_finalized: "Service fee finalized",
  service_invoice_issued: "Service invoice issued",
  user_created: "User created",
  user_deleted: "User deleted",
  admin_patient_access: "Patient file access",
};

function actionLabel(action: string): string {
  return (ACTION_LABEL as Record<string, string>)[action] ?? action;
}

// Platform audit log (constitution §21): every recorded platform action, newest first. Durable
// in live (hydrated from the `auditLog` collection, superAdmin-read only) and in-session in demo.
export default function AdminAuditPage() {
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  if (!identity) return null;
  if (identity.role !== "superAdmin") return null;
  if (store.status === "loading") return <p className="text-ink-soft">Loading…</p>;

  const entries = store.auditLog();

  return (
    <div className="max-w-3xl">
      <Link href="/app/admin" className="text-sm text-ink-soft hover:text-ink">← Admin</Link>
      <h1 className="mt-3 font-display text-3xl text-ink">Audit log</h1>
      <p className="mt-1 text-sm text-ink-soft">Every recorded platform action, newest first.</p>
      {entries.length === 0 ? (
        <p className="mt-5 text-sm text-ink-soft">No audit activity recorded yet.</p>
      ) : (
        <ul className="mt-5 rounded-card border border-line bg-card shadow-card">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center gap-3.5 border-b border-line px-4 py-3 last:border-b-0">
              <span
                className="micro flex-none rounded-field px-2 py-0.5"
                style={{ background: "var(--color-umber-soft)", color: "var(--color-umber)" }}
              >
                {actionLabel(e.action)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-ink">
                  <span className="font-medium">{e.actorName}</span>
                  {e.summary ? <> {e.summary}</> : null}
                </span>
              </span>
              <span className="micro flex-none text-ink-soft">{new Date(e.at).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { PatientRow } from "@/components/app/PatientRow";

// Audit-oriented patient lookup for Platform Admin (constitution §16/Rule 7: patient access is
// audit-support, not a daily patient-list workflow). Opening a result records an admin-access
// audit entry (the patient-file page logs it).
export default function AdminPatientLookupPage() {
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  const [query, setQuery] = useState("");
  if (!identity) return null;
  if (identity.role !== "superAdmin") return null;
  if (store.status === "loading") return <p className="text-ink-soft">Loading…</p>;
  if (store.status === "error") return <p className="text-ink-soft">Could not load data.</p>;

  const trimmed = query.trim();
  const results = trimmed ? store.searchPatients(query, identity) : [];

  return (
    <div className="max-w-3xl">
      <Link href="/app/admin" className="text-sm text-ink-soft hover:text-ink">← Admin</Link>
      <h1 className="mt-3 font-display text-3xl text-ink">Patient lookup</h1>
      <div className="mt-3 rounded-inner border-l-4 px-4 py-3" style={{ borderColor: "var(--color-sage)", background: "var(--color-sage-soft)" }}>
        <p className="micro" style={{ color: "var(--color-sage)" }}>Audit &amp; support access</p>
        <p className="mt-1 text-sm text-ink">Opening a patient file here is recorded in the audit log.</p>
      </div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name, date of birth (dd/mm/yyyy), or phone"
        className="mt-5 w-full rounded-field border border-line bg-card px-4 py-2.5 text-ink outline-none focus:border-tint"
      />
      {!trimmed ? (
        <p className="mt-5 text-sm text-ink-soft">Search for a patient to open their file.</p>
      ) : results.length === 0 ? (
        <p className="mt-5 text-sm text-ink-soft">No patients match “{trimmed}”.</p>
      ) : (
        <ul className="mt-5 divide-y divide-line overflow-hidden rounded-card border border-line">
          {results.map((p) => <li key={p.id}><PatientRow patient={p} /></li>)}
        </ul>
      )}
    </div>
  );
}

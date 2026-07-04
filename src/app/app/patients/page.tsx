"use client";

import { useState } from "react";
import Link from "next/link";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { canCreatePatient, splitPatients } from "@/lib/demo/backend";
import { PatientRow } from "@/components/app/PatientRow";

export default function PatientsPage() {
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  const [query, setQuery] = useState("");
  if (!identity) return null;
  if (store.status === "loading") return <p className="text-ink-soft">Loading…</p>;
  if (store.status === "error") return <p className="text-ink-soft">Could not load data. Open the dashboard to retry.</p>;

  const results = store.searchPatients(query, identity);
  // Under a doctor account the list splits into the doctor's own patients and
  // everything else, grouped on a subpage (iOS PatientListView.split).
  const { own, others } = splitPatients(results, identity);

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-3xl text-ink">Patients</h1>
        {canCreatePatient(identity) && (
          <Link href="/app/patients/new" className="rounded-btn px-4 py-2 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>
            New patient
          </Link>
        )}
      </div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name, date of birth (dd/mm/yyyy), or phone"
        className="mt-5 w-full rounded-field border border-line bg-card px-4 py-2.5 text-ink outline-none focus:border-tint"
      />

      {own.length === 0 && others.length > 0 ? (
        // iOS parity: with only other-owned patients visible, say so instead of an empty card.
        <p className="mt-5 text-sm text-ink-soft">
          {query ? "No matches in your own patients." : "You have no patients of your own yet."}
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-line overflow-hidden rounded-card border border-line">
          {own.map((p) => <li key={p.id}><PatientRow patient={p} /></li>)}
          {own.length === 0 && <li className="bg-card px-5 py-6 text-center text-sm text-ink-soft">No patients match.</li>}
        </ul>
      )}

      {others.length > 0 && (
        // Entry point to the doctor's "Other patients" subpage (clinic/nurse-owned).
        <Link href="/app/patients/other" className="mt-4 flex items-center gap-4 rounded-card border border-line bg-card px-5 py-4 transition-colors hover:border-tint/50">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-ink">Other patients</span>
            <span className="block text-sm text-ink-soft">Grouped by clinic &amp; nurse</span>
          </span>
          <span className="micro flex-none rounded-full px-2.5 py-0.5" style={{ background: "var(--color-tint-soft)", color: "var(--color-tint)" }}>
            {others.length}
          </span>
          <span aria-hidden className="flex-none text-ink-soft">›</span>
        </Link>
      )}
    </div>
  );
}

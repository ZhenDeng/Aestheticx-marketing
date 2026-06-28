"use client";

import { useState } from "react";
import Link from "next/link";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { displayName, hasAlert } from "@/lib/demo/types";

export default function PatientsPage() {
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  const [query, setQuery] = useState("");
  if (!identity) return null;
  if (store.status === "loading") return <p className="text-ink-soft">Loading…</p>;
  if (store.status === "error") return <p className="text-ink-soft">Could not load data. Open the dashboard to retry.</p>;

  const results = store.searchPatients(query, identity);

  return (
    <div>
      <h1 className="font-display text-3xl text-ink">Patients</h1>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name, date of birth (dd/mm/yyyy), or phone"
        className="mt-5 w-full rounded-field border border-line bg-card px-4 py-2.5 text-ink outline-none focus:border-tint"
      />

      <ul className="mt-5 divide-y divide-line overflow-hidden rounded-card border border-line">
        {results.map((p) => (
          <li key={p.id}>
            <Link href={`/app/patients/${p.id}`} className="flex items-center justify-between gap-4 bg-card px-5 py-4 transition-colors hover:bg-line-soft">
              <span className="min-w-0">
                <span className="block font-medium text-ink">{displayName(p)}</span>
                <span className="block truncate text-sm text-ink-soft">
                  {p.dateOfBirth.day}/{p.dateOfBirth.month}/{p.dateOfBirth.year} · {p.phone}
                </span>
              </span>
              {hasAlert(p) && (
                <span className="micro flex-none rounded-full px-2 py-0.5" style={{ background: "var(--color-rose-soft)", color: "var(--color-rose)" }}>
                  Alert
                </span>
              )}
            </Link>
          </li>
        ))}
        {results.length === 0 && <li className="bg-card px-5 py-6 text-center text-sm text-ink-soft">No patients match.</li>}
      </ul>
    </div>
  );
}

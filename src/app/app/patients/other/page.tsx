"use client";

import Link from "next/link";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { splitPatients, groupPatientsByOwner } from "@/lib/demo/backend";
import { ownerLabel } from "@/lib/demo/accounts";
import { PatientRow } from "@/components/app/PatientRow";

// The doctor's "Other patients" subpage (iOS OtherPatientsView, spec: patient-records →
// doctor patient list grouping): nurse- and clinic-owned patients the doctor may access,
// grouped by owner name with the same row rendering as the main list.
export default function OtherPatientsPage() {
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  if (!identity) return null;
  if (store.status === "loading") return <p className="text-ink-soft">Loading…</p>;
  if (store.status === "error") return <p className="text-ink-soft">Could not load data. Open the dashboard to retry.</p>;

  const { others } = splitPatients(store.searchPatients("", identity), identity);
  const groups = groupPatientsByOwner(others, ownerLabel);

  return (
    <div>
      <Link href="/app/patients" className="text-sm text-ink-soft hover:text-ink">← All patients</Link>
      <h1 className="mt-3 font-display text-3xl text-ink">Other patients</h1>

      {groups.length === 0 ? (
        <p className="mt-5 text-sm text-ink-soft">
          Patients owned by a clinic or nurse you can access will appear here.
        </p>
      ) : (
        <div className="mt-5 flex flex-col gap-3">
          {groups.map((group) => (
            // iOS uses collapsed DisclosureGroups per owner; <details> is the web analogue.
            <details key={group.key} className="overflow-hidden rounded-card border border-line bg-card">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
                <span className="text-sm font-medium text-ink">{group.key}</span>
                <span className="micro text-ink-soft">{group.patients.length}</span>
              </summary>
              <ul className="divide-y divide-line border-t border-line">
                {group.patients.map((p) => <li key={p.id}><PatientRow patient={p} /></li>)}
              </ul>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

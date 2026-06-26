"use client";

import Link from "next/link";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";

export default function AuthorisationsPage() {
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  if (!identity) return null;

  if (identity.role === "doctor") {
    const pending = store.pendingRequestsForDoctor(identity.user.id);
    return (
      <div>
        <h1 className="font-display text-3xl text-ink">Review requests</h1>
        <p className="mt-2 text-ink-soft">Approve to issue per-medication authorisations (5 repeats, 6-month expiry), or send back for edits. There is no flat reject.</p>
        <ul className="mt-6 flex flex-col gap-4">
          {pending.map((r) => (
            <li key={r.id} className="rounded-card border border-line bg-card p-5 shadow-card">
              <div className="rounded-inner p-4" style={{ background: "var(--color-umber-soft)" }}>
                <p className="micro">Patient</p>
                <p className="font-medium text-ink">{r.patientSummary?.fullName}</p>
                <p className="text-sm text-ink-soft">Allergies: {r.patientSummary?.allergies}</p>
              </div>
              <ul className="mt-3 flex flex-col gap-1 text-sm text-ink">
                {r.items.map((it, i) => (
                  <li key={i}>{it.name} · {it.dosage} {it.unit} · {it.areas.join(", ")}</li>
                ))}
              </ul>
              <div className="mt-4 flex gap-3">
                <button onClick={() => store.approveRequest(r.id, identity)} className="rounded-btn px-4 py-2 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>
                  Approve
                </button>
                <button onClick={() => store.requireEdit(r.id, identity)} className="rounded-btn border border-line px-4 py-2 text-sm text-ink-soft hover:border-tint">
                  Require edit
                </button>
              </div>
            </li>
          ))}
          {pending.length === 0 && <li className="text-sm text-ink-soft">No pending requests. Sign in as Sarah Chen to raise one.</li>}
        </ul>
      </div>
    );
  }

  // Clinic admins don't raise authorisation requests.
  if (identity.role === "clinicAdmin" || identity.role === "superAdmin") {
    return (
      <div>
        <h1 className="font-display text-3xl text-ink">Authorisation requests</h1>
        <p className="mt-2 text-ink-soft">
          Admins don&apos;t raise authorisation requests — that&apos;s the injecting nurse&apos;s job.
          Sign in as a nurse to raise one, or as Dr Voss to review.
        </p>
      </div>
    );
  }

  // Nurse view: surface own open requests across visible patients.
  const patients = store.searchPatients("", identity);
  const rows = patients.flatMap((p) =>
    store.openRequestsForPatient(p.id, identity.user.id).map((r) => ({ patient: p, request: r })),
  );

  return (
    <div>
      <h1 className="font-display text-3xl text-ink">Your authorisation requests</h1>
      <ul className="mt-6 flex flex-col gap-3">
        {rows.map(({ patient, request }) => (
          <li key={request.id} className="flex items-center justify-between rounded-inner border border-line bg-card px-5 py-4">
            <span>
              <Link href={`/app/patients/${patient.id}`} className="font-medium text-ink hover:underline">{patient.givenName} {patient.lastName}</Link>
              <span className="block text-sm text-ink-soft">{request.items.map((i) => i.name).join(", ")}</span>
            </span>
            <span className="micro rounded-full px-2 py-0.5" style={{ background: "var(--color-tint-soft)", color: "var(--color-tint)" }}>
              {request.status === "needsEdit" ? "Needs edit" : "Pending"}
            </span>
          </li>
        ))}
        {rows.length === 0 && <li className="text-sm text-ink-soft">No open requests. Open a patient file to raise one.</li>}
      </ul>
    </div>
  );
}

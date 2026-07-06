"use client";

import { useState } from "react";
import Link from "next/link";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { useConsultCall } from "@/components/app/ConsultCall";
import type { AuthorisationRequest } from "@/lib/demo/types";

// A doctor reviewing a PENDING request has no patient-document access until they approve
// it (spec 6.12), so the patient name is NOT a link to the file — it discloses the summary
// the request already carries (DOB, current meds). Allergies + the clinical alert stay
// visible without a click so nothing safety-critical hides behind the disclosure.
function PatientReviewCard({ request }: { request: AuthorisationRequest }) {
  const [open, setOpen] = useState(false);
  const s = request.patientSummary;
  const dob = s?.dateOfBirth;
  return (
    <div className="rounded-inner p-4" style={{ background: "var(--color-umber-soft)" }}>
      <p className="micro">Patient</p>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 font-medium text-ink hover:text-tint"
      >
        {s?.fullName ?? "Unknown patient"}
        <span aria-hidden className="text-xs text-ink-soft">{open ? "▾" : "▸"}</span>
      </button>
      {s?.alert && (
        <p
          className="mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
          style={{ background: "var(--color-danger-soft)", color: "var(--color-danger)" }}
        >
          ⚠ {s.alert}
        </p>
      )}
      <p className="mt-1 text-sm text-ink-soft">Allergies: {s?.allergies || "—"}</p>
      {open && (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-ink-soft">Date of birth</dt>
          <dd className="text-ink">{dob ? `${dob.day}/${dob.month}/${dob.year}` : "—"}</dd>
          <dt className="text-ink-soft">Current medications</dt>
          <dd className="text-ink">{s?.currentMedications || "—"}</dd>
        </dl>
      )}
      <p className="mt-2 text-xs text-ink-faint">Full patient file unlocks once you approve this request.</p>
    </div>
  );
}

export default function AuthorisationsPage() {
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  const consult = useConsultCall();
  if (!identity) return null;
  if (store.status === "loading") return <p className="text-ink-soft">Loading…</p>;
  if (store.status === "error") return <p className="text-ink-soft">Could not load data. Open the dashboard to retry.</p>;

  if (identity.role === "doctor") {
    const pending = store.pendingRequestsForDoctor(identity.user.id);
    return (
      <div>
        <h1 className="font-display text-3xl text-ink">Review requests</h1>
        <p className="mt-2 text-ink-soft">Approve to issue per-medication authorisations (5 repeats, 6-month expiry), or send back for edits. There is no flat reject.</p>
        <ul className="mt-6 flex flex-col gap-4">
          {pending.map((r) => (
            <li key={r.id} className="rounded-card border border-line bg-card p-5 shadow-card">
              <PatientReviewCard request={r} />
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
                <button onClick={() => consult.start(r.id, r.patientSummary?.fullName)} disabled={consult.active}
                  className="rounded-btn border border-line px-4 py-2 text-sm text-ink hover:border-tint disabled:opacity-50">
                  Start consult
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
            <span className="flex items-center gap-3">
              <button onClick={() => consult.start(request.id, `${patient.givenName} ${patient.lastName}`)} disabled={consult.active}
                className="rounded-btn border border-line px-3 py-1.5 text-sm text-ink hover:border-tint disabled:opacity-50">
                Start consult
              </button>
              <span className="micro rounded-full px-2 py-0.5" style={{ background: "var(--color-tint-soft)", color: "var(--color-tint)" }}>
                {request.status === "needsEdit" ? "Needs edit" : "Pending"}
              </span>
            </span>
          </li>
        ))}
        {rows.length === 0 && <li className="text-sm text-ink-soft">No open requests. Open a patient file to raise one.</li>}
      </ul>
    </div>
  );
}

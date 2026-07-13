"use client";

import Link from "next/link";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { heldIdentities, prescriberIdentity } from "@/lib/demo/identity";
import { useConsultCall } from "@/components/app/ConsultCall";
import type { AuthorisationRequest, Identity } from "@/lib/demo/types";

// While a request is open the addressed doctor gets read-only access to the patient's full
// file (spec 2026-07-07 reviewer-file-access), so the name links straight to it. Allergies
// + the clinical alert stay visible at a glance for safety.
function PatientReviewCard({ request }: { request: AuthorisationRequest }) {
  const s = request.patientSummary;
  return (
    <div className="rounded-inner p-4" style={{ background: "var(--color-umber-soft)" }}>
      <p className="micro">Patient</p>
      <Link href={`/app/patients/${request.patientID}`} className="font-medium text-ink underline-offset-2 hover:text-tint hover:underline">
        {s?.fullName ?? "Unknown patient"}
      </Link>
      {s?.alert && (
        <p
          className="mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
          style={{ background: "var(--color-danger-soft)", color: "var(--color-danger)" }}
        >
          ⚠ {s.alert}
        </p>
      )}
      <p className="mt-1 text-sm text-ink-soft">Allergies: {s?.allergies || "—"}</p>
      <p className="mt-2 text-xs text-ink-faint">Open the patient name to read the full file before deciding.</p>
    </div>
  );
}

type Store = ReturnType<typeof useDemoStore>;
type Consult = ReturnType<typeof useConsultCall>;

// The doctor's approval inbox. Rendered whenever the account HOLDS a doctor identity and driven by
// that identity — never the currently-selected one — so prescribing is always-on across workspaces
// (a doctor+clinicAdmin keeps this inbox in the clinicAdmin workspace). Passing the doctor identity
// to approve/require-edit also satisfies the backend's role gate unchanged.
function DoctorReviewInbox({ doctor, store, consult }: { doctor: Identity; store: Store; consult: Consult }) {
  const pending = store.pendingRequestsForDoctor(doctor.user.id);
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
              <button onClick={() => store.approveRequest(r.id, doctor)} className="rounded-btn px-4 py-2 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>
                Approve
              </button>
              <button onClick={() => store.requireEdit(r.id, doctor)} className="rounded-btn border border-line px-4 py-2 text-sm text-ink-soft hover:border-tint">
                Require edit
              </button>
              <button onClick={() => consult.start(r.id, r.patientSummary?.fullName)} disabled={consult.active}
                className="rounded-btn border border-line px-4 py-2 text-sm text-ink hover:border-tint disabled:opacity-50">
                Start consult
              </button>
            </div>
          </li>
        ))}
        {pending.length === 0 && <li className="text-sm text-ink-soft">No pending requests.</li>}
      </ul>
    </div>
  );
}

// The nurse's own open requests across their visible patients.
function NurseRequests({ identity, store, consult }: { identity: Identity; store: Store; consult: Consult }) {
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
              {request.status === "needsEdit" && (
                <Link href={`/app/patients/${patient.id}/request?edit=${request.id}`}
                  className="rounded-btn px-3 py-1.5 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>
                  Edit &amp; resubmit
                </Link>
              )}
              {request.status === "pending" && (
                <Link href={`/app/patients/${patient.id}/request?edit=${request.id}`}
                  aria-label={`Edit pending request for ${patient.givenName} ${patient.lastName}`}
                  className="rounded-btn border border-line px-3 py-1.5 text-sm text-ink hover:border-tint">
                  Edit
                </Link>
              )}
              <button onClick={() => consult.start(request.id, `${patient.givenName} ${patient.lastName}`)} disabled={consult.active}
                className="rounded-btn border border-line px-3 py-1.5 text-sm text-ink hover:border-tint disabled:opacity-50">
                Start consult
              </button>
              {/* Withdraw closes a mis-addressed/abandoned request; the trigger then revokes the
                  reviewing doctor's read-only file access (spec 2026-07-07 revocation hardening). */}
              <button onClick={() => store.withdrawRequest(request.id, identity)}
                className="rounded-btn border border-line px-3 py-1.5 text-sm hover:border-danger"
                style={{ color: "var(--color-danger)" }}>
                Withdraw
              </button>
              <span className="micro rounded-full px-2 py-0.5" style={{ background: "var(--color-tint-soft)", color: "var(--color-tint)" }}>
                {request.status === "needsEdit" ? "Needs edit" : request.status === "withdrawn" ? "Withdrawn" : "Pending"}
              </span>
            </span>
          </li>
        ))}
        {rows.length === 0 && <li className="text-sm text-ink-soft">No open requests. Open a patient file to raise one.</li>}
      </ul>
    </div>
  );
}

function AdminNoRequests() {
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

export default function AuthorisationsPage() {
  const { identity, availableIdentities } = useDemoAuth();
  const store = useDemoStore();
  const consult = useConsultCall();
  if (!identity) return null;
  if (store.status === "loading") return <p className="text-ink-soft">Loading…</p>;
  if (store.status === "error") return <p className="text-ink-soft">Could not load data. Open the dashboard to retry.</p>;

  // Prescribing is always-on: resolve the account's doctor identity from the HELD set, not the
  // active one, so the inbox and its actions survive a switch to a non-doctor workspace.
  const asDoctor = prescriberIdentity(heldIdentities(identity, availableIdentities));
  const showNurse = identity.role === "nurse";
  const showAdminMessage = !asDoctor && (identity.role === "clinicAdmin" || identity.role === "superAdmin");

  return (
    <div className="flex flex-col gap-12">
      {asDoctor && <DoctorReviewInbox doctor={asDoctor} store={store} consult={consult} />}
      {showNurse && <NurseRequests identity={identity} store={store} consult={consult} />}
      {showAdminMessage && <AdminNoRequests />}
    </div>
  );
}

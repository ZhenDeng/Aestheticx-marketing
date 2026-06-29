"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { patientPermissions } from "@/lib/demo/backend";
import { templateDisplayName } from "@/lib/demo/forms";
import { displayName, fullName, hasAlert } from "@/lib/demo/types";

export default function PatientFilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  const [noteBody, setNoteBody] = useState("");
  const router = useRouter();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [mergeFrom, setMergeFrom] = useState("");
  if (!identity) return null;
  if (store.status === "loading") return <p className="text-ink-soft">Loading…</p>;
  if (store.status === "error") return <p className="text-ink-soft">Could not load data. Open the dashboard to retry.</p>;
  const me = identity; // non-null, captured by the handlers below

  const patient = store.state.patients[id];
  if (!patient || !patientPermissions(identity, patient).canView) {
    return <p className="text-ink-soft">This patient is not in your view.</p>;
  }
  const perms = patientPermissions(identity, patient);
  const notes = store.notesForPatient(id);
  const active = store.activeAuthorisations(id);
  const forms = store.formsForPatient(id);
  const canEdit = perms.canEditDetails;
  const canDelete = perms.canDelete;
  const canMerge = perms.canMerge;
  // Other same-clinic patients that can be merged INTO this one (clinic admins only).
  const mergeCandidates = canMerge && patient.owner.kind === "clinic"
    ? store.searchPatients("", identity).filter((p) => p.id !== id && p.owner.kind === "clinic" && p.owner.id === patient.owner.id)
    : [];

  function doDelete() {
    store.deletePatient(id, identity!);
    router.push("/app/patients");
  }
  function doMerge() {
    if (!mergeFrom) return;
    store.mergePatients(id, mergeFrom, identity!); // keep this file, remove the duplicate
    setMergeFrom("");
  }

  function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteBody.trim()) return;
    store.saveGeneralNote({ patientID: id, title: "", body: noteBody.trim(), identity: me });
    setNoteBody("");
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
      <div>
        <Link href="/app/patients" className="text-sm text-ink-soft hover:text-ink">← All patients</Link>
        <h1 className="mt-3 font-display text-3xl text-ink">{displayName(patient)}</h1>
        <p className="mt-1 text-ink-soft">
          {patient.dateOfBirth.day}/{patient.dateOfBirth.month}/{patient.dateOfBirth.year} · {patient.gender} · {patient.phone}
        </p>

        {hasAlert(patient) && (
          <div className="mt-4 rounded-inner border-l-4 px-4 py-3" style={{ borderColor: "var(--color-rose)", background: "var(--color-rose-soft)" }}>
            <p className="micro" style={{ color: "var(--color-rose)" }}>Alert</p>
            <p className="mt-1 text-sm text-ink">{patient.alert}</p>
          </div>
        )}

        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <div><dt className="micro">Allergies</dt><dd className="mt-0.5 text-ink">{patient.allergies}</dd></div>
          <div><dt className="micro">Medications</dt><dd className="mt-0.5 text-ink">{patient.currentMedications}</dd></div>
        </dl>

        <h2 className="mt-8 font-display text-xl text-ink">Notes</h2>
        {perms.canWriteGeneralNote && (
          <form onSubmit={addNote} className="mt-3">
            <textarea
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              placeholder="Add a note…"
              rows={2}
              className="w-full rounded-inner border border-line bg-card px-3 py-2 text-ink outline-none focus:border-tint"
            />
            <button type="submit" className="mt-2 rounded-btn px-4 py-2 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>
              Save note
            </button>
          </form>
        )}
        <ul className="mt-4 flex flex-col gap-3">
          {notes.map((n) => (
            <li key={n.id} className="rounded-inner border border-line bg-card px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="micro">{n.kind}</span>
                <span className="micro">{n.authorBadge}</span>
              </div>
              {n.title && <p className="mt-1 font-medium text-ink">{n.title}</p>}
              <p className="mt-1 text-sm text-ink-soft">{n.body}</p>
            </li>
          ))}
          {notes.length === 0 && <li className="text-sm text-ink-soft">No notes yet.</li>}
        </ul>

        <div className="mt-8 flex items-center justify-between gap-4">
          <h2 className="font-display text-xl text-ink">Consent forms</h2>
          {perms.canSendForms && (
            <div className="flex items-center gap-2">
              <Link href={`/app/patients/${id}/consent/remote`} className="rounded-btn border border-line px-3 py-1.5 text-sm font-medium text-ink-soft hover:border-tint">
                Send a link
              </Link>
              <Link href={`/app/patients/${id}/consent`} className="rounded-btn px-3 py-1.5 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>
                Sign a consent
              </Link>
            </div>
          )}
        </div>
        <ul className="mt-3 flex flex-col gap-2">
          {forms.map((f) => (
            <li key={f.id}>
              <Link href={`/app/patients/${id}/forms/${f.id}`} className="flex items-center justify-between rounded-inner border border-line bg-card px-4 py-3 hover:border-tint">
                <span className="text-sm font-medium text-ink">{templateDisplayName(f.template)}</span>
                <span className="micro">{new Date(f.signedAt).toLocaleDateString()} · {f.channel}</span>
              </Link>
            </li>
          ))}
          {forms.length === 0 && <li className="text-sm text-ink-soft">No signed forms yet.</li>}
        </ul>
      </div>

      <aside>
        <div className="rounded-card border border-line bg-card p-5 shadow-card" style={{ borderColor: "var(--color-tint)" }}>
          <h2 className="font-display text-lg text-ink">Active authorisations</h2>
          <ul className="mt-3 flex flex-col gap-3">
            {active.map((a) => (
              <li key={a.id}>
                <p className="font-medium text-ink">{a.medication.name}</p>
                <p className="text-sm text-ink-soft">{a.medication.areas.join(", ")}</p>
                <p className="mt-1 flex gap-1" aria-label={`${a.repeatsRemaining} repeats remaining`}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span key={i} className="h-2 w-2 rounded-full" style={{ background: i < a.repeatsRemaining ? "var(--color-tint)" : "var(--color-line)" }} />
                  ))}
                </p>
              </li>
            ))}
            {active.length === 0 && <li className="text-sm text-ink-soft">None active.</li>}
          </ul>

          {identity.role === "nurse" && (
            <Link href={`/app/patients/${id}/request`} className="mt-4 block w-full rounded-btn border border-line px-4 py-2 text-center text-sm text-ink hover:border-tint">
              Raise authorisation request
            </Link>
          )}
        </div>
        {(canEdit || canDelete || canMerge) && (
          <div className="mt-4 rounded-card border border-line bg-card p-5 shadow-card">
            <h2 className="font-display text-lg text-ink">Manage</h2>
            <div className="mt-3 flex flex-col gap-2">
              {canEdit && (
                <Link href={`/app/patients/${id}/edit`} className="rounded-btn border border-line px-4 py-2 text-center text-sm text-ink hover:border-tint">
                  Edit details
                </Link>
              )}
              {canDelete && !confirmingDelete && (
                <button onClick={() => setConfirmingDelete(true)} className="rounded-btn border border-line px-4 py-2 text-sm text-ink-soft hover:border-tint">
                  Delete patient
                </button>
              )}
              {canDelete && confirmingDelete && (
                <div className="rounded-inner border border-line p-3">
                  <p className="text-sm text-ink">Delete this patient and their notes? This cannot be undone.</p>
                  <div className="mt-2 flex gap-2">
                    <button onClick={doDelete} className="rounded-btn px-3 py-1.5 text-sm font-medium text-card" style={{ background: "var(--color-rose)" }}>Delete</button>
                    <button onClick={() => setConfirmingDelete(false)} className="rounded-btn border border-line px-3 py-1.5 text-sm text-ink-soft">Cancel</button>
                  </div>
                </div>
              )}
            </div>
            {canMerge && mergeCandidates.length > 0 && (
              <div className="mt-4 border-t border-line pt-4">
                <p className="micro">Merge a duplicate into this file</p>
                <select value={mergeFrom} onChange={(e) => setMergeFrom(e.target.value)} className="mt-1.5 w-full rounded-field border border-line bg-card px-3 py-2 text-sm text-ink">
                  <option value="">Select duplicate…</option>
                  {mergeCandidates.map((p) => <option key={p.id} value={p.id}>{p.givenName} {p.lastName}</option>)}
                </select>
                {mergeFrom && (
                  <button onClick={doMerge} className="mt-2 w-full rounded-btn px-4 py-2 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>
                    Merge (moves notes &amp; authorisations, removes the duplicate)
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        <p className="mt-3 text-xs text-ink-faint">Formal name on documents: {fullName(patient)}</p>
      </aside>
    </div>
  );
}

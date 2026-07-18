"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { patientPermissions, notePreview, canSendAftercare, imageAttachments } from "@/lib/demo/backend";
import { patientAccessLevel } from "@/lib/demo/isolation";
import { TreatmentNoteForm } from "@/components/app/TreatmentNoteForm";
import { AftercareForm } from "@/components/app/AftercareForm";
import { NoteAttachmentsInput, NoteAttachmentList, AttachmentThumbStrip } from "@/components/app/NoteAttachments";
import { PatientAvatarPicker } from "@/components/app/PatientAvatar";
import { useConsultCall } from "@/components/app/ConsultCall";
import { DirectionDialog } from "@/components/app/DirectionDialog";
import { templateDisplayName } from "@/lib/demo/forms";
import { dayLabel } from "@/lib/demo/calendar";
import { emergencyKindLabel } from "@/lib/demo/direction";
import { displayName, fullName, hasAlert, routeLabel, type DeliveryStatus, type AppointmentStatus, type NoteAttachment } from "@/lib/demo/types";
import { unitSuffix } from "@/lib/demo/catalog";

const DELIVERY_LABEL: Record<DeliveryStatus, string> = { queued: "Queued", delivered: "Delivered", failed: "Failed" };
function deliveryColor(s: DeliveryStatus): string {
  return s === "delivered" ? "var(--color-tint)" : s === "failed" ? "var(--color-rose)" : "var(--color-ink-soft)";
}

const APPT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  awaitingConfirmation: "Awaiting", confirmed: "Confirmed", completed: "Completed", noShow: "No show", cancelled: "Cancelled",
};
function apptStatusColor(s: AppointmentStatus): string {
  switch (s) {
    case "noShow": return "var(--color-danger)";
    case "completed": return "var(--color-sage)";
    case "awaitingConfirmation": return "var(--color-ink-soft)";
    case "cancelled": return "var(--color-ink-faint)";
    default: return "var(--color-tint)"; // confirmed
  }
}
function apptTime(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}


export default function PatientFilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  const consult = useConsultCall();
  const [noteBody, setNoteBody] = useState("");
  const [noteAttachments, setNoteAttachments] = useState<NoteAttachment[]>([]);
  const router = useRouter();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [mergeFrom, setMergeFrom] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showTreatment, setShowTreatment] = useState(false);
  const [showAftercare, setShowAftercare] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  // iOS AuthorisationCard's "68C" button: which authorisation the Clause 68C direction sheet is open for.
  const [directionFor, setDirectionFor] = useState<string | null>(null);
  // Platform-admin patient access is audit-logged (constitution §16/§21). One record per file
  // open; the ref dedupes React's StrictMode double-effect + repeat renders so it stays a single
  // event per file. `patientForLog` is a dependency (not read inside only) so that when a live
  // deep-link mounts before hydration finishes — patient still undefined — the effect re-fires
  // once the record arrives, rather than silently never logging while the banner claims it did.
  const loggedAccessRef = useRef<string | null>(null);
  const patientForLog = store.state.patients[id];
  useEffect(() => {
    if (identity?.role !== "superAdmin") return;
    if (!patientForLog || loggedAccessRef.current === id) return;
    loggedAccessRef.current = id;
    store.recordAdminAccess(patientForLog, identity);
    // `store` is recreated each render; keyed on file + admin identity + the resolved patient so
    // it fires once the patient is present, not on every unrelated state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, identity, patientForLog]);
  if (!identity) return null;
  if (store.status === "loading") return <p className="text-ink-soft">Loading…</p>;
  if (store.status === "error") return <p className="text-ink-soft">Could not load data. Open the dashboard to retry.</p>;
  const me = identity; // non-null, captured by the handlers below

  const patient = store.state.patients[id];
  // Clinical view OR commercial access (isolation guard) — a collaborating doctor reaches
  // the clinic's client file to operate on it (spec: client-data-isolation).
  if (!patient || !(patientPermissions(identity, patient).canView || patientAccessLevel(store.state, identity, patient) !== "none")) {
    return <p className="text-ink-soft">This patient is not in your view.</p>;
  }
  const perms = patientPermissions(identity, patient);
  const isAdminViewer = me.role === "superAdmin";
  // As this viewer sees it: a prescriber-only doctor gets treatment notes only.
  const notes = store.visibleNotesForPatient(id, identity);
  const openRequests = identity.role === "nurse" ? store.openRequestsForPatient(id, identity.user.id) : [];
  const active = store.activeAuthorisations(id);
  const emergencies = store.activeEmergencyAuthorisations(id);
  const forms = store.formsForPatient(id);
  const apptHistory = store.appointmentsForPatient(id);
  const canEdit = perms.canEditDetails;
  const canDelete = perms.canDelete;
  const canMerge = perms.canMerge;
  // Aftercare is a note-write, so a read-only reviewer (open request, no write perms) must
  // not see it even though their role could otherwise send it (spec 2026-07-07 reviewer-file-access).
  const canAftercare = canSendAftercare(me) && (perms.canWriteTreatmentNote || perms.canWriteGeneralNote);
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
    if (!noteBody.trim() && noteAttachments.length === 0) return;
    store.saveGeneralNote({
      patientID: id, title: "", body: noteBody.trim(),
      attachments: noteAttachments.length ? noteAttachments : undefined, identity: me,
    });
    setNoteBody("");
    setNoteAttachments([]);
  }

  // grid-cols-1 (minmax(0,1fr)) lets the single mobile column shrink below its content's
  // min-content, so a long name / address / phone wraps instead of overflowing at ~320px.
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.4fr_1fr]">
      <div>
        <Link href={isAdminViewer ? "/app/admin/patients" : "/app/patients"} className="text-sm text-ink-soft hover:text-ink">
          ← {isAdminViewer ? "Patient lookup" : "All patients"}
        </Link>
        {isAdminViewer && (
          <div className="mt-3 rounded-inner border-l-4 px-4 py-3" style={{ borderColor: "var(--color-sage)", background: "var(--color-sage-soft)" }}>
            <p className="micro" style={{ color: "var(--color-sage)" }}>Audit access — recorded</p>
            <p className="mt-1 text-sm text-ink">You are viewing this file as Platform Admin. This access is logged in the audit trail.</p>
          </div>
        )}
        <div className="mt-3 flex items-center gap-4">
          {/* iOS: 72pt avatar on the file header; tap-to-upload when details are editable. */}
          <PatientAvatarPicker patient={patient} identity={me} canEdit={perms.canEditDetails} size={72} />
          {/* flex-1 min-w-0 constrains the name block to the space left of the avatar; the name
              steps down a size and both lines break so a long name/number never overflows at ~320px. */}
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl text-ink break-words sm:text-3xl">{displayName(patient)}</h1>
            <p className="mt-1 break-words text-ink-soft">
              {patient.dateOfBirth.day}/{patient.dateOfBirth.month}/{patient.dateOfBirth.year} · {patient.gender} · {patient.phone}
            </p>
          </div>
        </div>

        {hasAlert(patient) && (
          <div className="mt-4 rounded-inner border-l-4 px-4 py-3" style={{ borderColor: "var(--color-rose)", background: "var(--color-rose-soft)" }}>
            <p className="micro" style={{ color: "var(--color-rose)" }}>Alert</p>
            <p className="mt-1 text-sm text-ink">{patient.alert}</p>
          </div>
        )}

        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
          {/* 15/07 feedback: email + address belong with the other basic information. */}
          <div><dt className="micro">Email</dt><dd className="mt-0.5 break-words text-ink">{patient.email || "—"}</dd></div>
          <div><dt className="micro">Address</dt><dd className="mt-0.5 text-ink">{patient.address || "—"}</dd></div>
          <div><dt className="micro">Allergies</dt><dd className="mt-0.5 text-ink">{patient.allergies}</dd></div>
          <div><dt className="micro">Medications</dt><dd className="mt-0.5 text-ink">{patient.currentMedications}</dd></div>
        </dl>

        <div className="mt-8 flex items-center justify-between gap-4">
          <h2 className="font-display text-xl text-ink">Notes</h2>
          <div className="flex items-center gap-2">
            {perms.canWriteTreatmentNote && (
              <button onClick={() => { setShowTreatment((v) => !v); setShowAftercare(false); }}
                      className="rounded-btn border border-line px-3 py-1.5 text-sm font-medium text-ink-soft hover:border-tint">
                Treatment note
              </button>
            )}
            {canAftercare && (
              <button onClick={() => { setShowAftercare((v) => !v); setShowTreatment(false); }}
                      className="rounded-btn border border-line px-3 py-1.5 text-sm font-medium text-ink-soft hover:border-tint">
                Send aftercare
              </button>
            )}
          </div>
        </div>

        {showTreatment && perms.canWriteTreatmentNote && (
          <TreatmentNoteForm patientID={id} identity={me} onDone={() => setShowTreatment(false)} />
        )}
        {showAftercare && canAftercare && (
          <AftercareForm patientID={id} identity={me} onDone={() => setShowAftercare(false)} />
        )}

        {perms.canWriteGeneralNote && (
          <form onSubmit={addNote} className="mt-3">
            <textarea
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              placeholder="Add a general note…"
              rows={2}
              className="w-full rounded-inner border border-line bg-card px-3 py-2 text-ink outline-none focus:border-tint"
            />
            <NoteAttachmentsInput patientID={id} value={noteAttachments} onChange={setNoteAttachments} />
            <button type="submit" className="mt-2 rounded-btn px-4 py-2 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>
              Save note
            </button>
          </form>
        )}

        <ul className="mt-4 flex flex-col gap-3">
          {notes.map((n) => {
            const isOpen = expanded.has(n.id);
            return (
              <li key={n.id} className="rounded-inner border border-line bg-card px-4 py-3">
                <button
                  onClick={() => setExpanded((prev) => {
                    const next = new Set(prev);
                    if (next.has(n.id)) next.delete(n.id); else next.add(n.id);
                    return next;
                  })}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">{notePreview(n)}</span>
                    {/* Spec: photo notes show a thumbnail strip in the list without being opened. */}
                    {imageAttachments(n).length > 0 && <AttachmentThumbStrip photos={imageAttachments(n)} />}
                    <span className="micro">{new Date(n.createdAt).toLocaleDateString()}</span>
                  </span>
                  <span className="flex flex-none items-center gap-2">
                    {n.kind !== "general" && (
                      <span className="micro rounded-full border border-line px-2 py-0.5">
                        {n.kind === "treatment" ? "Treatment" : "Aftercare"}
                      </span>
                    )}
                    {n.deliveryStatus && (
                      <span className="micro rounded-full border px-2 py-0.5" style={{ color: deliveryColor(n.deliveryStatus), borderColor: deliveryColor(n.deliveryStatus) }}>
                        {DELIVERY_LABEL[n.deliveryStatus]}
                      </span>
                    )}
                    <span className="micro">{n.authorBadge}</span>
                  </span>
                </button>
                {isOpen && (
                  <div className="mt-2 border-t border-line pt-2">
                    <p className="whitespace-pre-wrap text-sm text-ink-soft">{n.body}</p>
                    {(n.attachments?.length ?? 0) > 0 && <NoteAttachmentList attachments={n.attachments!} />}
                    {n.medications.length > 0 && (
                      <ul className="mt-2 flex flex-col gap-1">
                        {/* Index key is safe: TreatmentMedication has no stable id and this list is render-only (never reordered/deleted). */}
                        {n.medications.map((m, i) => (
                          <li key={i} className="text-xs text-ink-faint">
                            {m.name}{m.dosage ? ` · ${m.dosage}` : ""}{m.batch ? ` · batch ${m.batch}` : ""}{m.expiry ? ` · exp ${m.expiry}` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                    {n.kind === "treatment" && n.consumedAuthorisationIDs.length > 0 && (
                      <p className="mt-1 micro" style={{ color: "var(--color-tint)" }}>
                        Consumed {n.consumedAuthorisationIDs.length} repeat{n.consumedAuthorisationIDs.length === 1 ? "" : "s"}
                      </p>
                    )}
                    {n.deliveryStatus === "failed" && store.status === "demo" && canAftercare && (
                      <button onClick={() => store.retryAftercare(id, n.id, me)}
                              className="mt-2 rounded-btn border border-line px-3 py-1.5 text-sm" style={{ color: "var(--color-rose)" }}>
                        Retry delivery
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
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
                <p className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-ink">{a.medication.name}</span>
                  {/* iOS AuthorisationCard: quiet "68C" affordance opens the Clause 68C direction capture. */}
                  <button type="button" onClick={() => setDirectionFor(a.id)} aria-label="Clause 68C direction"
                          className="micro flex-none rounded-btn border border-line px-2 py-0.5 hover:border-tint" style={{ color: "var(--color-tint)" }}>
                    68C
                  </button>
                </p>
                <p className="text-sm text-ink-soft">{a.medication.areas.join(", ")}</p>
                {/* 15/07 feedback: show the approved dosing + route for each medication. */}
                <p className="text-sm text-ink-soft">
                  {a.medication.dosage} {unitSuffix(a.medication.unit)}
                  {routeLabel(a.medication.route) ? ` · ${routeLabel(a.medication.route)}` : ""}
                </p>
                <p className="mt-1 flex gap-1" aria-label={`${a.repeatsRemaining} repeats remaining`}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span key={i} className="h-2 w-2 rounded-full" style={{ background: i < a.repeatsRemaining ? "var(--color-tint)" : "var(--color-line)" }} />
                  ))}
                </p>
              </li>
            ))}
            {active.length === 0 && <li className="text-sm text-ink-soft">None active.</li>}
          </ul>

          {emergencies.length > 0 && (
            <div className="mt-4 border-t border-line pt-4">
              <p className="micro">Emergency authorisations</p>
              <ul className="mt-2 flex flex-col gap-2">
                {emergencies.map((e) => (
                  <li key={e.id} className="text-sm">
                    <span className="text-ink">{emergencyKindLabel(e.kind)}</span>
                    <span className="micro block text-ink-soft">
                      {e.doctorName} · refreshed {new Date(e.refreshedAt).toLocaleDateString()} · expires {new Date(e.expiresAt).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {identity.role === "nurse" && (
            <Link href={`/app/patients/${id}/request`} className="mt-4 block w-full rounded-btn border border-line px-4 py-2 text-center text-sm text-ink hover:border-tint">
              Raise authorisation request
            </Link>
          )}

          {openRequests.length > 0 && (
            <div className="mt-4 border-t border-line pt-4">
              <p className="micro">Open requests</p>
              <ul className="mt-2 flex flex-col gap-2">
                {openRequests.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm text-ink-soft">{r.items.map((i) => i.name).join(", ")}</span>
                      {r.status === "needsEdit" && <span className="micro" style={{ color: "var(--color-danger)" }}>Needs edit</span>}
                    </span>
                    <span className="flex flex-none items-center gap-2">
                      {r.status === "needsEdit" && (
                        <Link href={`/app/patients/${id}/request?edit=${r.id}`}
                          className="rounded-btn px-3 py-1.5 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>
                          Edit &amp; resubmit
                        </Link>
                      )}
                      {r.status === "pending" && (
                        <Link href={`/app/patients/${id}/request?edit=${r.id}`}
                          aria-label={`Edit pending request (${r.items.map((i) => i.name).join(", ")})`}
                          className="rounded-btn border border-line px-3 py-1.5 text-sm text-ink hover:border-tint">
                          Edit
                        </Link>
                      )}
                      <button onClick={() => consult.start(r.id, fullName(patient))} disabled={consult.active}
                        className="rounded-btn border border-line px-3 py-1.5 text-sm text-ink hover:border-tint disabled:opacity-50">
                        Start consult
                      </button>
                      {/* Withdraw revokes the reviewing doctor's read-only file access via the
                          onAuthRequestWritten trigger (spec 2026-07-07 revocation hardening). */}
                      <button onClick={() => store.withdrawRequest(r.id, identity)}
                        className="rounded-btn border border-line px-3 py-1.5 text-sm hover:border-danger"
                        style={{ color: "var(--color-danger)" }}>
                        Withdraw
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="mt-4 rounded-card border border-line bg-card p-5 shadow-card">
          <button onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory} className="flex w-full items-center justify-between gap-2 text-left">
            <h2 className="font-display text-lg text-ink">Appointment history ({apptHistory.length})</h2>
            <span className="micro text-ink-soft">{showHistory ? "Hide" : "Show"}</span>
          </button>
          {showHistory && (
            <ul className="mt-3 flex flex-col gap-3">
              {apptHistory.map((a) => (
                <li key={a.id}>
                  <p className="flex items-baseline justify-between gap-2">
                    <span className="text-sm text-ink">{dayLabel(a.dateISO)} · {apptTime(a.startMinute)}–{apptTime(a.endMinute)}</span>
                    <span className="micro flex-none" style={{ color: apptStatusColor(a.status) }}>{APPT_STATUS_LABEL[a.status]}</span>
                  </p>
                  {a.appointmentNote && <p className="text-sm text-ink-soft">{a.appointmentNote}</p>}
                </li>
              ))}
              {apptHistory.length === 0 && <li className="text-sm text-ink-soft">No appointments.</li>}
            </ul>
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

      {directionFor && (() => {
        const authorisation = active.find((a) => a.id === directionFor);
        return authorisation
          ? <DirectionDialog authorisation={authorisation} patient={patient} emergencies={emergencies} onClose={() => setDirectionFor(null)} />
          : null;
      })()}
    </div>
  );
}

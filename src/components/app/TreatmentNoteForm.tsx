"use client";

import { useState } from "react";
import { useDemoStore } from "@/lib/demo/store";
import { usableAuthorisations } from "@/lib/demo/backend";
import { unitSuffix } from "@/lib/demo/catalog";
import { NoteAttachmentsInput } from "@/components/app/NoteAttachments";
import { MedicationCombobox } from "@/components/app/MedicationCombobox";
import { routeLabel, type Identity, type NoteAttachment, type TreatmentMedication } from "@/lib/demo/types";

type MedEdit = { batch: string; expiry: string; dosage: string };

export function TreatmentNoteForm({
  patientID, identity, onDone,
}: { patientID: string; identity: Identity; onDone: () => void }) {
  const store = useDemoStore();
  const usable = usableAuthorisations(store.state, patientID, identity, store.now);
  const templates = store.noteTemplatesForOwner(identity.user.id);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, MedEdit>>({});
  // Doctors administer medication without a script (feedback 2026-07-21 bug 2), so a
  // doctor-authored note may record medications directly, no authorisation consumed.
  const [manualMeds, setManualMeds] = useState<TreatmentMedication[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<NoteAttachment[]>([]);
  const [appliedTemplate, setAppliedTemplate] = useState("");

  // Rule 1 (spec: 2026-07-06 note access): a treatment note needs no authorisation — nurse and
  // prescribing doctor alike may save without ticking one. Ticking stays available to consume
  // authorisations when the writer wants to.
  const canSave = true;

  function toggle(id: string) {
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setEdit(id: string, field: keyof MedEdit, value: string) {
    setEdits((prev) => {
      const cur = prev[id] ?? { batch: "", expiry: "", dosage: "" };
      return { ...prev, [id]: { ...cur, [field]: value } };
    });
  }

  function setManualMed(index: number, field: keyof TreatmentMedication, value: string) {
    setManualMeds((prev) => prev.map((m, i) => (i === index ? { ...m, [field]: value } : m)));
  }

  function save() {
    const consumed: TreatmentMedication[] = [...ticked].map((id) => {
      const a = usable.find((x) => x.id === id)!;
      const e = edits[id] ?? { batch: "", expiry: "", dosage: "" };
      return { name: a.medication.name, batch: e.batch, expiry: e.expiry, dosage: e.dosage };
    });
    const medications = [...consumed, ...manualMeds.filter((m) => m.name.trim() !== "")];
    store.saveTreatmentNote({
      patientID, tickedIDs: [...ticked], title, body, medications,
      attachments: attachments.length ? attachments : undefined, identity,
    });
    onDone();
  }

  return (
    <div className="mt-3 rounded-inner border border-line bg-card p-4">
      <p className="micro">Treatment note</p>

      {usable.length === 0 ? (
        // Rule 1: recording is allowed without one, but remind the writer of the state so an
        // absent authorisation is a conscious choice, not an oversight.
        <p className="mt-3 rounded-inner border border-line px-3 py-2 text-sm text-ink-soft">
          No authorisation on file for this patient yet — you can still record this treatment
          note without one.
        </p>
      ) : (
        <div className="mt-3">
          <p className="micro">Optionally consume authorisations</p>
          <ul className="mt-2 flex flex-col gap-2">
            {usable.map((a) => (
              <li key={a.id} className="rounded-inner border border-line px-3 py-2">
                <label className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-ink">
                  <input type="checkbox" checked={ticked.has(a.id)} onChange={() => toggle(a.id)} />
                  <span className="font-medium">{a.medication.name}</span>
                  {/* 15/07 feedback: show the approved dosing + route where the nurse selects. */}
                  <span className="text-ink-soft">· {a.medication.dosage} {unitSuffix(a.medication.unit)}</span>
                  {routeLabel(a.medication.route) && <span className="text-ink-soft">· {routeLabel(a.medication.route)}</span>}
                  <span className="text-ink-soft">· {a.repeatsRemaining} left</span>
                </label>
                {ticked.has(a.id) && (
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <input placeholder="Batch" value={edits[a.id]?.batch ?? ""} onChange={(e) => setEdit(a.id, "batch", e.target.value)} className="rounded-field border border-line px-2 py-1 text-sm" />
                    <input placeholder="MM/YY" value={edits[a.id]?.expiry ?? ""} onChange={(e) => setEdit(a.id, "expiry", e.target.value)} className="rounded-field border border-line px-2 py-1 text-sm" />
                    <input placeholder="Dosage" value={edits[a.id]?.dosage ?? ""} onChange={(e) => setEdit(a.id, "dosage", e.target.value)} className="rounded-field border border-line px-2 py-1 text-sm" />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {identity.role === "doctor" && (
        // Doctors need no script to administer medication — record what was used directly.
        <div className="mt-3">
          <p className="micro">Medications administered (no script needed)</p>
          {manualMeds.length > 0 && (
            <ul className="mt-2 flex flex-col gap-2">
              {manualMeds.map((m, i) => (
                <li key={i} className="rounded-inner border border-line px-3 py-2">
                  <div className="flex items-center gap-2">
                    {/* 22/07 feedback: catalog-assisted combobox — free text stays valid. */}
                    <div className="min-w-0 flex-1">
                      <MedicationCombobox value={m.name} onChange={(name) => setManualMed(i, "name", name)}
                             className="w-full rounded-field border border-line px-2 py-1 text-sm" />
                    </div>
                    <button type="button" aria-label="Remove medication"
                            onClick={() => setManualMeds((prev) => prev.filter((_, j) => j !== i))}
                            className="flex-none rounded-btn border border-line px-2 py-1 text-sm text-ink-soft">✕</button>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <input placeholder="Dosage" value={m.dosage ?? ""} onChange={(e) => setManualMed(i, "dosage", e.target.value)} className="rounded-field border border-line px-2 py-1 text-sm" />
                    <input placeholder="Batch" value={m.batch ?? ""} onChange={(e) => setManualMed(i, "batch", e.target.value)} className="rounded-field border border-line px-2 py-1 text-sm" />
                    <input placeholder="MM/YY" value={m.expiry ?? ""} onChange={(e) => setManualMed(i, "expiry", e.target.value)} className="rounded-field border border-line px-2 py-1 text-sm" />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <button type="button"
                  onClick={() => setManualMeds((prev) => [...prev, { name: "", batch: "", expiry: "", dosage: "" }])}
                  className="mt-2 rounded-btn border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-tint/50">
            Add medication
          </button>
        </div>
      )}

      <div className="mt-3">
        <p className="micro">Notes</p>
        {templates.length > 0 && (
          <select
            value={appliedTemplate}
            onChange={(e) => {
              const t = templates.find((x) => x.id === e.target.value);
              if (t) setBody(t.body); // prefill only — body stays editable (iOS-faithful)
              setAppliedTemplate(""); // controlled reset back to the placeholder
            }}
            className="mb-2 w-full rounded-inner border border-line px-3 py-2 text-sm text-ink-soft outline-none focus:border-tint"
          >
            <option value="" disabled>Apply a template…</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name || "(untitled)"}</option>)}
          </select>
        )}
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)"
               className="mt-1 w-full rounded-inner border border-line px-3 py-2 text-sm text-ink outline-none focus:border-tint" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Treatment details…" rows={4}
               className="mt-2 w-full rounded-inner border border-line px-3 py-2 text-sm text-ink outline-none focus:border-tint" />
        <NoteAttachmentsInput patientID={patientID} value={attachments} onChange={setAttachments} />
      </div>

      <div className="mt-3 flex gap-2">
        <button onClick={save} disabled={!canSave}
                className="rounded-btn px-4 py-2 text-sm font-medium text-card disabled:opacity-40"
                style={{ background: "var(--color-tint)" }}>
          Save treatment note
        </button>
        <button onClick={onDone} className="rounded-btn border border-line px-4 py-2 text-sm text-ink-soft">Cancel</button>
      </div>
    </div>
  );
}

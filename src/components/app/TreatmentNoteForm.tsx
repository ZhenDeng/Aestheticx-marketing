"use client";

import { useState } from "react";
import { useDemoStore } from "@/lib/demo/store";
import { usableAuthorisations } from "@/lib/demo/backend";
import type { Identity, TreatmentMedication } from "@/lib/demo/types";

type MedEdit = { batch: string; expiry: string; dosage: string };

export function TreatmentNoteForm({
  patientID, identity, onDone,
}: { patientID: string; identity: Identity; onDone: () => void }) {
  const store = useDemoStore();
  const usable = usableAuthorisations(store.state, patientID, identity, store.now);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, MedEdit>>({});
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const isDoctor = identity.role === "doctor";
  // Doctors may save directly; nurses must tick at least one usable authorisation.
  const canSave = isDoctor || ticked.size > 0;

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

  function save() {
    const medications: TreatmentMedication[] = [...ticked].map((id) => {
      const a = usable.find((x) => x.id === id)!;
      const e = edits[id] ?? { batch: "", expiry: "", dosage: "" };
      return { name: a.medication.name, batch: e.batch, expiry: e.expiry, dosage: e.dosage };
    });
    store.saveTreatmentNote({ patientID, tickedIDs: [...ticked], title, body, medications, identity });
    onDone();
  }

  return (
    <div className="mt-3 rounded-inner border border-line bg-card p-4">
      <p className="micro">Treatment note</p>

      {(!isDoctor || usable.length > 0) && (
        <div className="mt-3">
          <p className="micro">1 · Tick valid authorisations</p>
          {usable.length === 0 && (
            <p className="mt-1 text-sm" style={{ color: "var(--color-rose)" }}>
              No usable authorisations. Request one from a doctor first.
            </p>
          )}
          <ul className="mt-2 flex flex-col gap-2">
            {usable.map((a) => (
              <li key={a.id} className="rounded-inner border border-line px-3 py-2">
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" checked={ticked.has(a.id)} onChange={() => toggle(a.id)} />
                  <span className="font-medium">{a.medication.name}</span>
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

      <div className="mt-3">
        <p className="micro">2 · Notes</p>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)"
               className="mt-1 w-full rounded-inner border border-line px-3 py-2 text-sm text-ink outline-none focus:border-tint" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Treatment details…" rows={4}
               className="mt-2 w-full rounded-inner border border-line px-3 py-2 text-sm text-ink outline-none focus:border-tint" />
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

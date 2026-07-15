"use client";

import { useState } from "react";
import { useDemoStore } from "@/lib/demo/store";
import { AFTERCARE_CATEGORIES, aftercareDisplayName, assembleAftercare, type AftercareCategory } from "@/lib/demo/aftercare";
import type { Identity } from "@/lib/demo/types";

const DEFAULT_CONTENT =
  "Thank you for visiting. Avoid touching the treated area for 4 hours, no strenuous exercise for 24 hours, and contact us with any concerns.";
const CLOSING = "\n\nContact us with any concerns — we're here to help.";

export function AftercareForm({
  patientID, identity, onDone,
}: { patientID: string; identity: Identity; onDone: () => void }) {
  const store = useDemoStore();
  // Most-recent treatment note's medications (newest-first, so the first treatment match is
  // the latest). Sourced from the VISIBLE stream so a viewer who can't see treatment notes
  // (spec: 2026-07-06 rule 2 — e.g. a non-prescribing clinic doctor) doesn't get them
  // prefilled here. Computed fresh each time the panel opens (the parent remounts on toggle)
  // and captured into send() at click.
  const lastMeds = store.visibleNotesForPatient(patientID, identity).find((n) => n.kind === "treatment")?.medications ?? [];
  const [selected, setSelected] = useState<AftercareCategory[]>([]);
  const [content, setContent] = useState(DEFAULT_CONTENT);
  const [includeMeds, setIncludeMeds] = useState(true);
  // 15/07 bug: aftercare is emailed to the patient's address. It's the one email path with no
  // empty-recipient guard, so a blank email silently queued a doomed send. Surface the recipient
  // and block sending when there's nothing to send to, rather than fail invisibly.
  const recipient = store.state.patients[patientID]?.email?.trim() ?? "";
  const canSend = recipient.length > 0;

  // Each toggle re-assembles the editable body (matching iOS — manual edits persist
  // until the next toggle), preserving selection order.
  function toggle(c: AftercareCategory) {
    const next = selected.includes(c) ? selected.filter((x) => x !== c) : [...selected, c];
    setSelected(next);
    setContent(next.length ? assembleAftercare(next) + CLOSING : DEFAULT_CONTENT);
  }

  function send() {
    if (!canSend) return; // no recipient — the button is disabled, but guard the handler too
    store.sendAftercare({ patientID, content, medications: includeMeds ? lastMeds : [], categories: selected, identity });
    onDone();
  }

  return (
    <div className="mt-3 rounded-inner border border-line bg-card p-4">
      <p className="micro">Send aftercare</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {AFTERCARE_CATEGORIES.map((c) => (
          <button key={c} onClick={() => toggle(c)}
                  className="rounded-btn border px-3 py-1.5 text-sm"
                  style={selected.includes(c)
                    ? { background: "var(--color-tint)", color: "var(--color-card)", borderColor: "var(--color-tint)" }
                    : { borderColor: "var(--color-line)", color: "var(--color-ink-soft)" }}>
            {aftercareDisplayName(c)}
          </button>
        ))}
      </div>

      <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={8}
                className="mt-3 w-full rounded-inner border border-line px-3 py-2 text-sm text-ink outline-none focus:border-tint" />

      {lastMeds.length > 0 && (
        <label className="mt-2 flex items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" checked={includeMeds} onChange={(e) => setIncludeMeds(e.target.checked)} />
          Attach this treatment&apos;s medication details ({lastMeds.map((m) => m.name).join(", ")})
        </label>
      )}

      {canSend ? (
        <p className="mt-3 text-sm text-ink-soft">Will be emailed to {recipient}.</p>
      ) : (
        <p className="mt-3 rounded-inner border px-3 py-2 text-sm" style={{ borderColor: "var(--color-rose)", color: "var(--color-rose)" }}>
          No email address on file for this patient — add one in the patient file before sending aftercare.
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button onClick={send} disabled={!canSend}
                className="rounded-btn px-4 py-2 text-sm font-medium text-card disabled:opacity-40" style={{ background: "var(--color-tint)" }}>
          Send{selected.length ? ` · ${selected.length} ${selected.length === 1 ? "category" : "categories"}` : ""}
        </button>
        <button onClick={onDone} className="rounded-btn border border-line px-4 py-2 text-sm text-ink-soft">Cancel</button>
      </div>
    </div>
  );
}

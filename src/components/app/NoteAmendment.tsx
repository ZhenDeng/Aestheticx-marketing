"use client";

import { useState } from "react";
import { useDemoStore } from "@/lib/demo/store";
import type { Identity, Note } from "@/lib/demo/types";

/**
 * The body of an open note, plus the same-day amendment affordance (owner feedback 06/08).
 *
 * A note is a clinical record: its author may correct the wording for the rest of the
 * calendar day they wrote it, and from the next day it is finalized — no Edit button, and
 * firestore.rules refuses the write. Only title + body are amendable; the medications,
 * consumed authorisations and attachments record what actually happened.
 */
export function NoteAmendment({ note, identity }: { note: Note; identity: Identity }) {
  const store = useDemoStore();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [error, setError] = useState("");
  const amendable = store.canAmendNote(note, identity);

  function open() {
    setTitle(note.title);
    setBody(note.body);
    setError("");
    setEditing(true);
  }

  function save() {
    try {
      store.amendNote({ patientID: note.patientID, noteID: note.id, title: title.trim(), body: body.trim(), identity });
      setEditing(false);
    } catch {
      // The window closed under the open editor (midnight, or access withdrawn mid-edit).
      setError("This note is finalized — it can no longer be edited.");
    }
  }

  if (editing) {
    return (
      <div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)"
               aria-label="Note title"
               className="w-full rounded-inner border border-line px-2 py-1 text-sm text-ink outline-none focus:border-tint" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} aria-label="Note"
                  className="mt-1 w-full rounded-inner border border-line px-2 py-1 text-sm leading-snug text-ink outline-none focus:border-tint" />
        {error && <p className="mt-1 text-xs" style={{ color: "var(--color-danger)" }}>{error}</p>}
        <div className="mt-1 flex gap-2">
          <button type="button" onClick={save}
                  className="rounded-btn px-3 py-1 text-xs font-medium text-card" style={{ background: "var(--color-tint)" }}>
            Save changes
          </button>
          <button type="button" onClick={() => setEditing(false)}
                  className="rounded-btn border border-line px-3 py-1 text-xs text-ink-soft">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <p className="whitespace-pre-wrap text-sm leading-snug text-ink-soft">{note.body}</p>
      {amendable && (
        <div className="mt-1 flex items-center gap-2">
          <button type="button" onClick={open}
                  className="rounded-btn border border-line px-2 py-0.5 text-xs text-ink-soft hover:border-tint">
            Edit
          </button>
          {/* Says WHY the button is here — and why it will be gone tomorrow. */}
          <span className="micro">Editable until midnight</span>
        </div>
      )}
    </>
  );
}

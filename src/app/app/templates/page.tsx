"use client";

import { useState } from "react";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { AFTERCARE_CATEGORIES, aftercareDisplayName, type AftercareCategory } from "@/lib/demo/aftercare";
import type { NoteTemplate } from "@/lib/demo/types";

export default function TemplatesPage() {
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  const [editing, setEditing] = useState<NoteTemplate | null>(null);

  if (!identity) return null;
  if (store.status === "loading") return <p className="text-ink-soft">Loading…</p>;
  if (store.status === "error") return <p className="text-ink-soft">Could not load data. Open the dashboard to retry.</p>;
  const me = identity;
  const templates = store.noteTemplatesForOwner(me.user.id);

  function blank(): NoteTemplate {
    // crypto.randomUUID needs a secure context (HTTPS / localhost). Fall back for plain-http
    // LAN dev previews so "New template" never hard-crashes there.
    const id = globalThis.crypto?.randomUUID?.() ?? `tpl-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    return { id, ownerID: me.user.id, name: "", body: "", aftercareCategories: [] };
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-3xl text-ink">Note templates</h1>
      <p className="mt-2 text-ink-soft">Reusable autofill for your treatment notes. Private to you.</p>

      {editing ? (
        <TemplateEditor
          key={editing.id}
          template={editing}
          onCancel={() => setEditing(null)}
          onSave={(t) => { store.saveNoteTemplate(t, me); setEditing(null); }}
        />
      ) : (
        <button onClick={() => setEditing(blank())}
                className="mt-5 rounded-btn px-4 py-2 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>
          New template
        </button>
      )}

      <ul className="mt-6 flex flex-col gap-3">
        {templates.map((t) => (
          <li key={t.id} className="rounded-inner border border-line bg-card px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block font-medium text-ink">{t.name || "(untitled)"}</span>
                <span className="block truncate text-sm text-ink-soft">{t.body || "—"}</span>
              </span>
              <span className="flex flex-none gap-2">
                <button onClick={() => setEditing(t)} className="rounded-btn border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-tint">Edit</button>
                <button onClick={() => store.deleteNoteTemplate(t.id, me)} className="rounded-btn border border-line px-3 py-1.5 text-sm" style={{ color: "var(--color-rose)" }}>Delete</button>
              </span>
            </div>
            {t.aftercareCategories.length > 0 && (
              <p className="mt-1 micro">{t.aftercareCategories.map(aftercareDisplayName).join(" · ")}</p>
            )}
          </li>
        ))}
        {templates.length === 0 && !editing && <li className="text-sm text-ink-soft">No templates yet.</li>}
      </ul>
    </div>
  );
}

function TemplateEditor({
  template, onSave, onCancel,
}: { template: NoteTemplate; onSave: (t: NoteTemplate) => void; onCancel: () => void }) {
  const [name, setName] = useState(template.name);
  const [body, setBody] = useState(template.body);
  const [cats, setCats] = useState<AftercareCategory[]>(template.aftercareCategories);

  function toggle(c: AftercareCategory) {
    setCats((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);
  }

  return (
    <div className="mt-5 rounded-inner border border-line bg-card p-4">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name"
             className="w-full rounded-inner border border-line px-3 py-2 text-sm text-ink outline-none focus:border-tint" />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Default note body…" rows={5}
             className="mt-2 w-full rounded-inner border border-line px-3 py-2 text-sm text-ink outline-none focus:border-tint" />
      <div className="mt-3 flex flex-wrap gap-2">
        {AFTERCARE_CATEGORIES.map((c) => (
          <button key={c} onClick={() => toggle(c)} className="rounded-btn border px-3 py-1.5 text-sm"
                  style={cats.includes(c)
                    ? { background: "var(--color-tint)", color: "var(--color-card)", borderColor: "var(--color-tint)" }
                    : { borderColor: "var(--color-line)", color: "var(--color-ink-soft)" }}>
            {aftercareDisplayName(c)}
          </button>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <button onClick={() => onSave({ ...template, name: name.trim(), body, aftercareCategories: cats })} disabled={!name.trim()}
                className="rounded-btn px-4 py-2 text-sm font-medium text-card disabled:opacity-40" style={{ background: "var(--color-tint)" }}>
          Save template
        </button>
        <button onClick={onCancel} className="rounded-btn border border-line px-4 py-2 text-sm text-ink-soft">Cancel</button>
      </div>
    </div>
  );
}

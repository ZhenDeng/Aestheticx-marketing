"use client";

import { useState } from "react";
import { useDemoStore } from "@/lib/demo/store";
import {
  AFTERCARE_CATEGORIES, aftercareBody, aftercareDisplayName, aftercareEmail, type AftercareCategory,
} from "@/lib/demo/aftercare";
import { mailtoHref } from "@/lib/demo/remoteSigning";
import { fullName, type Identity } from "@/lib/demo/types";

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
  const [content, setContent] = useState(() => aftercareBody([]));
  const [includeMeds, setIncludeMeds] = useState(true);
  // Whether the CURRENTLY composed content has been written to the patient file. The hand-off
  // stays re-clickable (a mail client that never opened is invisible to us) without recording
  // twice — but any edit clears this, because the mailto would then carry different instructions
  // than the note, and the file must not keep the superseded ones under a "Recorded" banner.
  const [recorded, setRecorded] = useState(false);
  // 15/07 bug: aftercare goes to the patient's address, and this was the one email path with no
  // empty-recipient guard. Still true under the mailto hand-off — a mailto with no address just
  // opens an unaddressed draft — so surface the recipient and block the hand-off without one.
  const patient = store.state.patients[patientID];
  const recipient = patient?.email?.trim() ?? "";
  const canSend = recipient.length > 0;

  // Each toggle re-assembles the editable body (matching iOS — manual edits persist
  // until the next toggle), preserving selection order.
  function toggle(c: AftercareCategory) {
    const next = selected.includes(c) ? selected.filter((x) => x !== c) : [...selected, c];
    setSelected(next);
    setContent(aftercareBody(next));
    setRecorded(false); // different instructions now — the previous record no longer describes them
  }

  // Composed from the CURRENT textarea contents, so the practitioner's edits are what leaves.
  // The selection also picks the subject: one category → its per-treatment line.
  const email = aftercareEmail(patient ? fullName(patient) : "", content, selected);
  const href = mailtoHref(recipient, email.subject, email.body);

  const label = `Email${selected.length ? ` · ${selected.length} ${selected.length === 1 ? "category" : "categories"}` : ""}`;
  // Some desktop mail handlers truncate or refuse a mailto beyond ~2k characters, and with no
  // delivery signal that would fail silently — so say so while the text is still on screen.
  const mayTruncate = href.length > 2000;

  // The mail client sends it, not us — so this only records that aftercare was issued. There is
  // deliberately no delivery status: a mailto hand-off tells us nothing about what happened next.
  //
  // Deliberately does NOT call onDone(): unmounting this panel from inside the anchor's own click
  // handler detaches the element before the browser performs the mailto navigation, which can
  // silently drop it. Staying open also leaves the composed text selectable if no client opened.
  function recordSend() {
    if (!canSend || recorded) return; // the anchor only renders when canSend, but guard anyway
    store.sendAftercare({ patientID, content, medications: includeMeds ? lastMeds : [], categories: selected, identity });
    setRecorded(true);
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

      <textarea value={content} onChange={(e) => { setContent(e.target.value); setRecorded(false); }} rows={8}
                className="mt-3 w-full rounded-inner border border-line px-3 py-2 text-sm text-ink outline-none focus:border-tint" />

      {lastMeds.length > 0 && (
        <label className="mt-2 flex items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" checked={includeMeds} onChange={(e) => setIncludeMeds(e.target.checked)} />
          Attach this treatment&apos;s medication details ({lastMeds.map((m) => m.name).join(", ")})
        </label>
      )}

      {canSend ? (
        <>
          <p className="mt-3 text-sm text-ink-soft">
            Opens your email app with this message to {recipient}, ready for you to send.
          </p>
          {mayTruncate && (
            <p role="alert" className="mt-2 rounded-inner border px-3 py-2 text-sm" style={{ borderColor: "var(--color-rose)", color: "var(--color-rose)" }}>
              This message is long — some email apps shorten it. Check it looks complete before
              sending, or copy the text above into a new email instead.
            </p>
          )}
          {recorded && (
            <p role="status" className="mt-2 rounded-inner border px-3 py-2 text-sm" style={{ borderColor: "var(--color-tint)", color: "var(--color-tint)" }}>
              Recorded on the patient file. Send the email from your email app — if it didn&apos;t
              open, use Email again or copy the text above.
            </p>
          )}
        </>
      ) : (
        <p className="mt-3 rounded-inner border px-3 py-2 text-sm" style={{ borderColor: "var(--color-rose)", color: "var(--color-rose)" }}>
          No email address on file for this patient — add one in the patient file before sending aftercare.
        </p>
      )}

      <div className="mt-3 flex gap-2">
        {/* An anchor, not a button: the mail client is opened by the browser following the
            mailto, exactly as "Send a consent to sign" does. onClick only records the send.
            Without a recipient there is nothing to address, so it degrades to a disabled button. */}
        {canSend ? (
          <a href={href} onClick={recordSend}
             className="rounded-btn px-4 py-2 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>
            {label}
          </a>
        ) : (
          <button disabled
                  className="rounded-btn px-4 py-2 text-sm font-medium text-card opacity-40" style={{ background: "var(--color-tint)" }}>
            {label}
          </button>
        )}
        <button onClick={onDone} className="rounded-btn border border-line px-4 py-2 text-sm text-ink-soft">
          {recorded ? "Done" : "Cancel"}
        </button>
      </div>
    </div>
  );
}

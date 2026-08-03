"use client";

import { use, useEffect, useState } from "react";
import { missingFields } from "@/lib/demo/backend";
import {
  findPatientFormLink, removePatientFormLink, savePatientFormSubmission,
  type PatientFormLink,
} from "@/lib/demo/patientFormLinks";
import { emptyDraft, type PatientDraft } from "@/lib/demo/types";
import { PatientDraftFields } from "@/components/app/PatientDraftFields";

// Public new-patient form (change: patient-form-link-generation). Deliberately OUTSIDE /app:
// no AuthGuard, no store provider — a visitor with a link fills in the standard new-patient
// fields and submits. The submission lands as a pending-review card for the account that
// generated the link; nothing becomes a patient record until that account approves it.
type Status =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "ready"; link: PatientFormLink }
  | { kind: "done" };

export default function IntakePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [draft, setDraft] = useState<PatientDraft>(emptyDraft());
  const [error, setError] = useState<string | null>(null);

  // localStorage only exists client-side, so the token check waits for the first effect.
  // The microtask boundary keeps the setState out of the synchronous effect body (lint:
  // no cascading renders) — the "Loading…" frame is what the server rendered anyway.
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      const link = findPatientFormLink(window.localStorage, token);
      setStatus(link ? { kind: "ready", link } : { kind: "invalid" });
    });
    return () => { cancelled = true; };
  }, [token]);

  const invalid = missingFields(draft).size > 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (status.kind !== "ready" || invalid) return;
    const saved = savePatientFormSubmission(window.localStorage, {
      id: crypto.randomUUID(), token, accountKey: status.link.accountKey,
      draft, submittedAt: Date.now(),
    });
    if (!saved) {
      setError("Could not submit your details on this device. Please tell the clinic.");
      return;
    }
    removePatientFormLink(window.localStorage, token); // single-use: a submit retires the link
    setStatus({ kind: "done" });
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <p className="micro">AestheticX</p>

      {status.kind === "loading" && <p className="mt-4 text-ink-soft">Loading…</p>}

      {status.kind === "invalid" && (
        <>
          <h1 className="mt-2 font-display text-3xl text-ink">This link isn&apos;t valid</h1>
          <p className="mt-2 text-ink-soft">
            It may have been used already — each link works once. Please ask the clinic for a new one.
          </p>
        </>
      )}

      {status.kind === "done" && (
        <>
          <h1 className="mt-2 font-display text-3xl text-ink">Thank you</h1>
          <p className="mt-2 text-ink-soft">
            Your details have been submitted. The clinic will review them and add you to their records.
          </p>
        </>
      )}

      {status.kind === "ready" && (
        <>
          <h1 className="mt-2 font-display text-3xl text-ink">New patient details</h1>
          <p className="mt-1 text-ink-soft">
            Fill in your details below. {status.link.accountName || "The clinic"} will review them
            before adding you as a patient. Fields marked * are required.
          </p>
          <form onSubmit={submit} className="pb-12">
            <PatientDraftFields draft={draft} onChange={setDraft} />
            {error && <p className="mt-4 text-sm" style={{ color: "var(--color-rose)" }}>{error}</p>}
            <div className="mt-6">
              <button type="submit" disabled={invalid}
                className="rounded-btn px-5 py-2.5 text-sm font-medium text-card transition-colors disabled:opacity-50"
                style={{ background: "var(--color-tint)" }}>
                Submit details
              </button>
            </div>
          </form>
        </>
      )}
    </main>
  );
}

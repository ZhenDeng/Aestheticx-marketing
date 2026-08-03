"use client";

import { useState } from "react";
import Link from "next/link";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { canCreatePatient } from "@/lib/demo/backend";
import { patientFormUrl } from "@/lib/demo/patientFormLinks";

// Generate a new-patient form link (change: patient-form-link-generation) — the alternative
// to typing details into /app/patients/new: mint a link, open it (or hand the device over),
// and the submission comes back as a pending-review card on the patient list. Layout mirrors
// the remote consent-link page.
export default function PatientFormLinkPage() {
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!identity) return null;
  if (store.status === "loading") return <p className="text-ink-soft">Loading…</p>;
  if (!canCreatePatient(identity)) {
    return <p className="text-ink-soft">Your account can&apos;t create patients, so it can&apos;t generate a form link.</p>;
  }

  function generate() {
    setError(null);
    setCopied(false);
    try {
      const token = store.createPatientFormLink(identity!);
      setUrl(patientFormUrl(window.location.origin, token));
    } catch {
      setError("Could not generate a form link. Please try again.");
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setError("Could not copy automatically — select the link and copy it manually.");
    }
  }

  return (
    <div className="max-w-2xl">
      <Link href="/app/patients" className="text-sm text-ink-soft hover:text-ink">← Back to patients</Link>
      <h1 className="mt-3 font-display text-3xl text-ink">New patient form link</h1>
      <p className="mt-1 text-ink-soft">
        Generate a single-use link that opens the new patient form. When it&apos;s submitted, the
        patient appears at the top of your list as <em>Pending review</em> — visible only to this
        account — where you can check the details, approve, or decline.
      </p>

      <div className="mt-5">
        <button type="button" onClick={generate}
          className="rounded-btn px-5 py-2.5 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>
          {url ? "Generate another" : "Generate form link"}
        </button>
      </div>

      {error && <p className="mt-3 text-sm" style={{ color: "var(--color-rose)" }}>{error}</p>}

      {url && (
        <div className="mt-6 rounded-card border border-line bg-card p-5">
          <span className="micro">Form link</span>
          <div className="mt-1.5 flex items-center gap-2">
            <input readOnly value={url} className="w-full rounded-field border border-line bg-card px-3 py-2 text-sm text-ink" />
            <button type="button" onClick={copy}
              className="whitespace-nowrap rounded-btn border border-line px-3 py-2 text-sm text-ink-soft hover:border-tint">
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="mt-4">
            <a href={url} target="_blank" rel="noreferrer"
              className="inline-block rounded-btn border border-line px-4 py-2 text-sm text-ink-soft hover:border-tint">
              Open the form
            </a>
          </div>
          <p className="mt-4 text-sm text-ink-soft">
            The link works in this browser — open it here and hand the device to the patient to
            fill in. It&apos;s single-use: submitting the form retires it.
          </p>
        </div>
      )}
    </div>
  );
}

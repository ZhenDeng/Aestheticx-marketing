"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { canCreatePatient } from "@/lib/demo/backend";
import { patientFormUrl, siloOwnerParts } from "@/lib/demo/patientFormLinks";

// Generate a new-patient form link (change: patient-form-link-generation) — the alternative
// to typing details into /app/patients/new. Live (round 2): the createPatientIntakeLink
// callable mints a server-backed single-use token and the URL points at the hosted public
// intake page, so it works on ANY device — send it to the patient's phone or show the QR.
// Demo keeps a browser-local link (the consent remote page's demo-banner pattern). Either
// way the submission comes back as a pending-review card on the patient list.
export default function PatientFormLinkPage() {
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  const [url, setUrl] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const inFlight = useRef(false);

  if (!identity) return null;
  if (store.status === "loading") return <p className="text-ink-soft">Loading…</p>;
  if (!canCreatePatient(identity)) {
    return <p className="text-ink-soft">Your account can&apos;t create patients, so it can&apos;t generate a form link.</p>;
  }
  const isLive = store.status !== "demo";

  async function generate() {
    if (inFlight.current) return; // guard against a double-tap minting two links
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setCopied(false);
    setQr(null);
    try {
      let linkUrl: string;
      if (isLive) {
        const { createPatientIntakeLink } = await import("@/lib/firebase/patientIntake");
        const owner = siloOwnerParts(identity!);
        linkUrl = (await createPatientIntakeLink(owner.type, owner.id)).url;
      } else {
        const token = store.createPatientFormLink(identity!);
        linkUrl = patientFormUrl(window.location.origin, token);
      }
      setUrl(linkUrl);
      const { default: QRCode } = await import("qrcode");
      setQr(await QRCode.toDataURL(linkUrl, { width: 220, margin: 1 }));
    } catch {
      setError("Could not generate a form link. Please try again.");
    } finally {
      setBusy(false);
      inFlight.current = false;
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
        patient appears at the top of your list as <em>Pending review</em> — where you can check
        the details, approve, or decline.
      </p>

      <div className="mt-5">
        <button type="button" onClick={generate} disabled={busy}
          className="rounded-btn px-5 py-2.5 text-sm font-medium text-card disabled:opacity-50" style={{ background: "var(--color-tint)" }}>
          {busy ? "Generating…" : url ? "Generate another" : "Generate form link"}
        </button>
      </div>

      {error && <p className="mt-3 text-sm" style={{ color: "var(--color-rose)" }}>{error}</p>}

      {url && (
        <div className="mt-6 rounded-card border border-line bg-card p-5">
          {!isLive && (
            <p className="mb-3 rounded-inner border-l-4 p-2 text-sm"
              style={{ borderColor: "var(--color-tint)", background: "var(--color-tint-soft)" }}>
              Demo link — works in this browser only. In live mode this is a tokenised link to
              the public intake page, usable on any device.
            </p>
          )}
          <span className="micro">Form link</span>
          <div className="mt-1.5 flex items-center gap-2">
            <input readOnly value={url} className="w-full rounded-field border border-line bg-card px-3 py-2 text-sm text-ink" />
            <button type="button" onClick={copy}
              className="whitespace-nowrap rounded-btn border border-line px-3 py-2 text-sm text-ink-soft hover:border-tint">
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          {qr && (
            <div className="mt-5">
              <span className="micro">QR code</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="Form link QR code" width={220} height={220}
                className="mt-1.5 rounded-inner border border-line bg-card" />
            </div>
          )}

          <div className="mt-4">
            <a href={url} target="_blank" rel="noreferrer"
              className="inline-block rounded-btn border border-line px-4 py-2 text-sm text-ink-soft hover:border-tint">
              Open the form
            </a>
          </div>
          <p className="mt-4 text-sm text-ink-soft">
            {isLive
              ? "Send the link to the patient or let them scan the QR — it works on any device. It's single-use (submitting retires it) and expires after a week."
              : "Open it here and hand the device to the patient to fill in. It's single-use: submitting the form retires it."}
          </p>
        </div>
      )}
    </div>
  );
}

"use client";

import { use, useRef, useState } from "react";
import Link from "next/link";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { patientPermissions } from "@/lib/demo/backend";
import { templateDisplayName, type FormTemplateKind } from "@/lib/demo/forms";
import { remoteSigningTemplateKinds, consentEmail, mailtoHref, formSigningUrl } from "@/lib/demo/remoteSigning";

export default function RemoteConsentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  const [kind, setKind] = useState<FormTemplateKind>("antiwrinkleConsent");
  const [url, setUrl] = useState<string | null>(null);
  const [demoLink, setDemoLink] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const inFlight = useRef(false);

  if (!identity) return null;
  if (store.status === "loading") return <p className="text-ink-soft">Loading…</p>;
  const patient = store.state.patients[id];
  if (!patient || !patientPermissions(identity, patient).canSendForms) {
    return <p className="text-ink-soft">You can&apos;t send forms for this patient.</p>;
  }
  const isLive = store.status !== "demo";

  function reset() {
    setUrl(null);
    setQr(null);
    setCopied(false);
    setError(null);
  }

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
        const { createFormLink } = await import("@/lib/firebase/formLinks");
        linkUrl = (await createFormLink(id, kind)).url;
        setDemoLink(false);
      } else {
        linkUrl = formSigningUrl(crypto.randomUUID());
        setDemoLink(true);
      }
      setUrl(linkUrl);
      const { default: QRCode } = await import("qrcode");
      setQr(await QRCode.toDataURL(linkUrl, { width: 220, margin: 1 }));
    } catch {
      setError("Could not generate a signing link. Please try again.");
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

  const email = url ? consentEmail(`${patient.givenName} ${patient.lastName}`.trim(), url) : null;

  return (
    <div className="max-w-2xl">
      <Link href={`/app/patients/${id}`} className="text-sm text-ink-soft hover:text-ink">← Back to patient</Link>
      <h1 className="mt-3 font-display text-3xl text-ink">Send a consent to sign</h1>
      <p className="mt-1 text-ink-soft">Generate a single-use link the patient can open to sign on their own device.</p>

      <label className="mt-5 block">
        <span className="micro">Form</span>
        <select value={kind} onChange={(e) => { setKind(e.target.value as FormTemplateKind); reset(); }}
          className="mt-1.5 w-full rounded-field border border-line bg-card px-3 py-2 text-ink">
          {remoteSigningTemplateKinds(isLive).map((k) => <option key={k} value={k}>{templateDisplayName(k)}</option>)}
        </select>
      </label>

      <div className="mt-5">
        <button type="button" onClick={generate} disabled={busy}
          className="rounded-btn px-5 py-2.5 text-sm font-medium text-card disabled:opacity-50" style={{ background: "var(--color-tint)" }}>
          {busy ? "Generating…" : url ? "Generate another" : "Generate signing link"}
        </button>
      </div>

      {error && <p className="mt-3 text-sm" style={{ color: "var(--color-rose)" }}>{error}</p>}

      {url && (
        <div className="mt-6 rounded-card border border-line bg-card p-5">
          {demoLink && (
            <p className="mb-3 rounded-inner border-l-4 p-2 text-sm"
              style={{ borderColor: "var(--color-tint)", background: "var(--color-tint-soft)" }}>
              Demo link — not a live link. In live mode this is a tokenised, single-use URL minted by the server.
            </p>
          )}
          <span className="micro">Signing link</span>
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
              <img src={qr} alt="Signing link QR code" width={220} height={220}
                className="mt-1.5 rounded-inner border border-line bg-card" />
            </div>
          )}

          {email && patient.email && (
            <div className="mt-5">
              <a href={mailtoHref(patient.email, email.subject, email.body)}
                className="inline-block rounded-btn border border-line px-4 py-2 text-sm text-ink-soft hover:border-tint">
                Email to {patient.email}
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

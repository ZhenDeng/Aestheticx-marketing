"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { patientPermissions } from "@/lib/demo/backend";
import { templateDisplayName, formTemplate } from "@/lib/demo/forms";
import { pdfAvailability, pdfFilename } from "@/lib/demo/formPdf";

export default function FormViewPage({ params }: { params: Promise<{ id: string; formId: string }> }) {
  const { id, formId } = use(params);
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  const router = useRouter();
  const [sigUrl, setSigUrl] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pdfPath, setPdfPath] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const form = store.formsForPatient(id).find((f) => f.id === formId);

  useEffect(() => {
    let cancelled = false;
    // Only the Storage fetch needs an effect; the inline data URL is derived below.
    if (!form?.signatureDataUrl && form?.signatureFileId) {
      void (async () => {
        try { const { signatureUrl } = await import("@/lib/firebase/storage"); const u = await signatureUrl(form.signatureFileId!); if (!cancelled) setSigUrl(u); }
        catch { /* leave unset */ }
      })();
    }
    return () => { cancelled = true; };
  }, [form?.signatureFileId, form?.signatureDataUrl]);

  const resolvedSigUrl = form?.signatureDataUrl ?? sigUrl;

  if (!identity) return null;
  const patient = store.state.patients[id];
  if (!patient || !form) return <p className="text-ink-soft">Form not found.</p>;
  const perms = patientPermissions(identity, patient);
  const questions = formTemplate(form.template).questions;

  const isLive = store.status !== "demo";
  const effectivePdfPath = pdfPath ?? form.pdfFileId ?? null;
  const pdfState = pdfAvailability({ pdfFileId: effectivePdfPath ?? undefined }, isLive);

  function doDelete() {
    store.deleteForm(id, formId, identity!);
    router.push(`/app/patients/${id}`);
  }

  async function downloadPdf() {
    if (!effectivePdfPath) return;
    setPdfBusy(true);
    setPdfError(null);
    try {
      const { fileDownloadUrl } = await import("@/lib/firebase/storage");
      const url = await fileDownloadUrl(effectivePdfPath);
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("fetch failed");
        const blob = await res.blob();
        const name = pdfFilename(
          templateDisplayName(form!.template),
          `${patient!.givenName} ${patient!.lastName}`.trim(),
          form!.signedAt,
        );
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objUrl;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(objUrl);
      } catch {
        // Cross-origin/CORS or transient failure: open the URL so the browser
        // can still render/save the PDF (named from the Storage response).
        window.open(url, "_blank", "noopener");
      }
    } catch {
      setPdfError("Could not download the PDF. Please try again.");
    } finally {
      setPdfBusy(false);
    }
  }

  async function checkAgain() {
    setChecking(true);
    setPdfError(null);
    try {
      const { fetchSignedFormPdfPath } = await import("@/lib/firebase/forms");
      const path = await fetchSignedFormPdfPath(id, formId);
      if (path) setPdfPath(path);
      else setPdfError("The PDF is still being prepared. Try again in a moment.");
    } catch {
      setPdfError("Could not check the PDF status. Please try again.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <Link href={`/app/patients/${id}`} className="text-sm text-ink-soft hover:text-ink">← Back to patient</Link>
      <h1 className="mt-3 font-display text-3xl text-ink">{templateDisplayName(form.template)}</h1>
      <p className="mt-1 text-ink-soft">Signed {new Date(form.signedAt).toLocaleString()} · {form.channel}</p>

      {form.answers.length > 0 && (
        <>
          <h2 className="mt-6 font-display text-lg text-ink">Responses</h2>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {form.answers.map((a) => {
              const q = questions.find((x) => x.id === a.questionID);
              return <li key={a.questionID} className="text-ink-soft"><span className="text-ink">{a.answer ? "Yes" : "No"}</span> — {q?.prompt ?? a.questionID}{a.detail ? ` (${a.detail})` : ""}</li>;
            })}
          </ul>
        </>
      )}

      <h2 className="mt-6 font-display text-lg text-ink">Consent text</h2>
      <div className="mt-2 rounded-inner border border-line p-4 text-sm leading-relaxed text-ink-soft">
        {[form.intro, ...form.clauses].map((p, i) => <p key={i} className="mt-2 first:mt-0">{p}</p>)}
      </div>

      <h2 className="mt-6 font-display text-lg text-ink">Signature</h2>
      {resolvedSigUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={resolvedSigUrl} alt="Signature" className="mt-2 max-h-40 rounded-inner border border-line bg-card" />
      ) : (
        <p className="mt-2 text-sm text-ink-soft">Signature unavailable.</p>
      )}

      <h2 className="mt-6 font-display text-lg text-ink">Document</h2>
      {pdfState === "unavailable" ? (
        <div className="mt-2">
          <button type="button" disabled className="rounded-btn border border-line px-4 py-2 text-sm text-ink-soft opacity-50">
            Download PDF
          </button>
          <p className="mt-1.5 text-sm text-ink-soft">The server-rendered PDF is available in live mode.</p>
        </div>
      ) : pdfState === "ready" ? (
        <div className="mt-2">
          <button type="button" onClick={downloadPdf} disabled={pdfBusy}
            className="rounded-btn px-4 py-2 text-sm font-medium text-card disabled:opacity-50" style={{ background: "var(--color-tint)" }}>
            {pdfBusy ? "Downloading…" : "Download PDF"}
          </button>
          {pdfError && <p className="mt-1.5 text-sm" style={{ color: "var(--color-rose)" }}>{pdfError}</p>}
        </div>
      ) : (
        <div className="mt-2">
          <p className="text-sm text-ink-soft">Preparing the PDF…</p>
          <button type="button" onClick={checkAgain} disabled={checking}
            className="mt-2 rounded-btn border border-line px-4 py-2 text-sm text-ink-soft hover:border-tint disabled:opacity-50">
            {checking ? "Checking…" : "Check again"}
          </button>
          {pdfError && <p className="mt-1.5 text-sm" style={{ color: "var(--color-rose)" }}>{pdfError}</p>}
        </div>
      )}

      {perms.canSendForms && (
        <div className="mt-8">
          {!confirming
            ? <button onClick={() => setConfirming(true)} className="rounded-btn border border-line px-4 py-2 text-sm text-ink-soft hover:border-tint">Delete (signed in error)</button>
            : <span className="flex items-center gap-2">
                <button onClick={doDelete} className="rounded-btn px-4 py-2 text-sm font-medium text-card" style={{ background: "var(--color-rose)" }}>Confirm delete</button>
                <button onClick={() => setConfirming(false)} className="rounded-btn border border-line px-4 py-2 text-sm text-ink-soft">Cancel</button>
              </span>}
        </div>
      )}
    </div>
  );
}

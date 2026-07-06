"use client";

import { use, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { patientPermissions } from "@/lib/demo/backend";
import {
  FORM_TEMPLATE_KINDS, templateDisplayName, templateFullText, formTemplate, formAnswersComplete, OFF_LABEL_CLAUSE,
  type FormTemplateKind,
} from "@/lib/demo/forms";
import type { FormAnswer } from "@/lib/demo/types";
import { SignaturePad, type SignatureHandle } from "@/components/app/SignaturePad";

export default function ConsentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  const router = useRouter();
  const sigRef = useRef<SignatureHandle | null>(null);
  const [kind, setKind] = useState<FormTemplateKind>("antiwrinkleConsent");
  const [answers, setAnswers] = useState<Record<string, FormAnswer>>({});
  const [hasSig, setHasSig] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!identity) return null;
  if (store.status === "loading") return <p className="text-ink-soft">Loading…</p>;

  const patient = store.state.patients[id];
  if (!patient || !patientPermissions(identity, patient).canSendForms) {
    return <p className="text-ink-soft">You can&apos;t send forms for this patient.</p>;
  }
  const template = formTemplate(kind);
  const me = identity;
  // Owner feedback #6: gate on every question answered (+ required "Yes" details) AND a signature.
  const answersComplete = formAnswersComplete(template, answers);

  function setAnswer(qid: string, patch: Partial<FormAnswer>) {
    setAnswers((a) => {
      const prev = a[qid] ?? { questionID: qid, answer: false, detail: "" };
      return { ...a, [qid]: { ...prev, ...patch, questionID: qid } };
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const png = await sigRef.current?.getPng();
      if (!png) { setError("Please draw a signature."); setBusy(false); return; }
      const answerList = template.questions.map((q) => answers[q.id] ?? { questionID: q.id, answer: false, detail: "" });
      const live = store.status !== "demo";
      let signatureFileId: string | undefined;
      let signatureDataUrl: string | undefined;
      if (live) {
        const { uploadSignature } = await import("@/lib/firebase/storage");
        const formId = crypto.randomUUID();
        signatureFileId = await uploadSignature(id, formId, png.blob);
      } else {
        signatureDataUrl = png.dataUrl;
      }
      store.recordForm({ patientID: id, template: kind, channel: "onDevice", answers: answerList, signatureFileId, signatureDataUrl }, me);
      router.push(`/app/patients/${id}`);
    } catch {
      setError("Could not save the form. Please try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-2xl">
      <h1 className="font-display text-3xl text-ink">Sign a consent</h1>
      <label className="mt-5 block">
        <span className="micro">Form</span>
        <select value={kind} onChange={(e) => { setKind(e.target.value as FormTemplateKind); setAnswers({}); }}
          className="mt-1.5 w-full rounded-field border border-line bg-card px-3 py-2 text-ink">
          {FORM_TEMPLATE_KINDS.map((k) => <option key={k} value={k}>{templateDisplayName(k)}</option>)}
        </select>
      </label>

      <h2 className="mt-6 font-display text-xl text-ink">Screening questions</h2>
      <div className="mt-3 flex flex-col gap-4">
        {template.questions.map((q) => {
          const a = answers[q.id];
          return (
            <div key={q.id} className="rounded-inner border border-line p-3">
              <p className="whitespace-pre-line text-sm text-ink">{q.prompt}</p>
              {q.kind.type === "yesNo" ? (
                <>
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => setAnswer(q.id, { answer: true })}
                      className={`rounded-btn px-3 py-1 text-sm ${a?.answer ? "text-card" : "border border-line text-ink-soft"}`}
                      style={a?.answer ? { background: "var(--color-tint)" } : undefined}>Yes</button>
                    <button type="button" onClick={() => setAnswer(q.id, { answer: false })}
                      className={`rounded-btn px-3 py-1 text-sm ${a && !a.answer ? "text-card" : "border border-line text-ink-soft"}`}
                      style={a && !a.answer ? { background: "var(--color-tint)" } : undefined}>No</button>
                  </div>
                  {q.kind.detailPrompt && a?.answer && (
                    <input value={a?.detail ?? ""} onChange={(e) => setAnswer(q.id, { detail: e.target.value })}
                      placeholder={q.kind.detailPrompt}
                      className="mt-2 w-full rounded-field border border-line bg-card px-3 py-1.5 text-sm text-ink" />
                  )}
                </>
              ) : (
                <input value={a?.detail ?? ""} onChange={(e) => setAnswer(q.id, { answer: true, detail: e.target.value })}
                  className="mt-2 w-full rounded-field border border-line bg-card px-3 py-1.5 text-sm text-ink" />
              )}
            </div>
          );
        })}
      </div>

      <h2 className="mt-6 font-display text-xl text-ink">Consent text</h2>
      <div className="mt-3 max-h-72 overflow-y-auto rounded-inner border border-line p-4 text-sm leading-relaxed text-ink-soft">
        {templateFullText(template).map((para, i) => (
          <p key={i} className={`mt-2 first:mt-0 ${para === OFF_LABEL_CLAUSE ? "rounded-inner border-l-4 p-2" : ""}`}
            style={para === OFF_LABEL_CLAUSE ? { borderColor: "var(--color-tint)", background: "var(--color-tint-soft)" } : undefined}>
            {para}
          </p>
        ))}
      </div>

      <h2 className="mt-6 font-display text-xl text-ink">Signature</h2>
      <div className="mt-3"><SignaturePad onChange={setHasSig} handleRef={sigRef} /></div>

      {error && <p className="mt-3 text-sm" style={{ color: "var(--color-rose)" }}>{error}</p>}
      {!answersComplete && (
        <p className="mt-4 text-sm text-ink-soft">Answer every question (and any requested detail) to record this consent.</p>
      )}
      <div className="mt-3 flex gap-3">
        <button type="submit" disabled={!hasSig || !answersComplete || busy}
          className="rounded-btn px-5 py-2.5 text-sm font-medium text-card disabled:opacity-50" style={{ background: "var(--color-tint)" }}>
          {busy ? "Saving…" : "Record signed consent"}
        </button>
        <button type="button" onClick={() => router.back()} className="rounded-btn border border-line px-5 py-2.5 text-sm text-ink-soft">Cancel</button>
      </div>
    </form>
  );
}

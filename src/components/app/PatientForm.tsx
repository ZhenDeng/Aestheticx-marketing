"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { missingFields } from "@/lib/demo/backend";
import { PatientDraftFields } from "@/components/app/PatientDraftFields";
import { useAddressBias } from "@/components/app/useAddressBias";
import { emergencyContactFromDraft, type Patient, type PatientDraft } from "@/lib/demo/types";

export function PatientForm({ mode, initial, existing, create, onCancel, compact, title, submitLabel }: {
  mode: "create" | "edit"; initial: PatientDraft; existing?: Patient;
  /** Overrides the plain store create — e.g. the calendar's atomic create-and-link-lead.
   *  Must return the new patient id; a throw shows the form's error and stops navigation.
   *  (Replaces the old best-effort onCreated hook, whose swallowed link failures left
   *  lead appointments silently unlinked — 28/07.) */
  create?: (draft: PatientDraft) => string;
  onCancel?: () => void; compact?: boolean;
  /** Heading/button overrides for reuse surfaces (pending form-link review). */
  title?: string; submitLabel?: string;
}) {
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  const router = useRouter();
  const [draft, setDraft] = useState<PatientDraft>(initial);
  const [error, setError] = useState<string | null>(null);
  const near = useAddressBias();
  if (!identity) return null;

  const invalid = missingFields(draft).size > 0;
  const heading = title ?? (mode === "create" ? "New patient" : "Edit patient");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (invalid) return;
    try {
      if (mode === "create") {
        const id = create ? create(draft) : store.createPatient(draft, identity!);
        router.push(`/app/patients/${id}`);
      } else if (existing) {
        const updated: Patient = {
          ...existing,
          givenName: draft.givenName.trim(), lastName: draft.lastName.trim(),
          dateOfBirth: draft.dateOfBirth!, gender: draft.gender, address: draft.address.trim(),
          phone: draft.phone.trim(), email: draft.email.trim(), allergies: draft.allergies.trim(),
          currentMedications: draft.currentMedications.trim(),
          alert: draft.alert.trim() || undefined, preferredName: draft.preferredName.trim() || undefined,
          emergencyContact: emergencyContactFromDraft(draft),
        };
        store.updatePatient(updated, identity!);
        router.push(`/app/patients/${existing.id}`);
      }
    } catch {
      setError("Could not save. Check your permissions and try again.");
    }
  }

  return (
    <form onSubmit={submit} className="max-w-2xl">
      {compact
        ? <h2 className="font-display text-lg text-ink">{title ?? (mode === "create" ? "New patient from lead" : "Edit patient")}</h2>
        : <h1 className="font-display text-3xl text-ink">{heading}</h1>}
      <PatientDraftFields draft={draft} onChange={setDraft} near={near} />
      {error && <p className="mt-4 text-sm" style={{ color: "var(--color-rose)" }}>{error}</p>}
      <div className="mt-6 flex gap-3">
        <button type="submit" disabled={invalid}
          className="rounded-btn px-5 py-2.5 text-sm font-medium text-card transition-colors disabled:opacity-50"
          style={{ background: "var(--color-tint)" }}>
          {submitLabel ?? (mode === "create" ? "Create patient" : "Save changes")}
        </button>
        <button type="button" onClick={() => (onCancel ? onCancel() : router.back())}
          className="rounded-btn border border-line px-5 py-2.5 text-sm text-ink-soft hover:border-tint">Cancel</button>
      </div>
    </form>
  );
}

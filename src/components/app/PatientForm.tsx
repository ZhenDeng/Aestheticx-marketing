"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { missingFields } from "@/lib/demo/backend";
import { AddressAutocomplete } from "@/components/app/AddressAutocomplete";
import { emergencyContactFromDraft, type Patient, type PatientDraft } from "@/lib/demo/types";

const FIELD = "mt-1.5 w-full rounded-field border border-line bg-card px-3 py-2 text-ink outline-none focus:border-tint";

function dobToInput(date: PatientDraft["dateOfBirth"]): string {
  if (!date) return "";
  const pad = (part: number, width: number) => String(part).padStart(width, "0");
  return `${pad(date.year, 4)}-${pad(date.month, 2)}-${pad(date.day, 2)}`;
}

function inputToDob(value: string): PatientDraft["dateOfBirth"] {
  const parts = value.split("-").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  return { year: parts[0], month: parts[1], day: parts[2] };
}

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
  const { identity, mode: authMode } = useDemoAuth();
  const store = useDemoStore();
  const router = useRouter();
  const [draft, setDraft] = useState<PatientDraft>(initial);
  const [error, setError] = useState<string | null>(null);
  if (!identity) return null;

  const set = (key: keyof PatientDraft, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

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
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="block"><span className="micro">Given name *</span>
          <input className={FIELD} value={draft.givenName} onChange={(event) => set("givenName", event.target.value)} /></label>
        <label className="block"><span className="micro">Last name *</span>
          <input className={FIELD} value={draft.lastName} onChange={(event) => set("lastName", event.target.value)} /></label>
        <label className="block"><span className="micro">Preferred name</span>
          <input className={FIELD} value={draft.preferredName} onChange={(event) => set("preferredName", event.target.value)} /></label>
        <label className="block"><span className="micro">Date of birth *</span>
          <input type="date" className={FIELD} value={dobToInput(draft.dateOfBirth)}
            onChange={(event) => setDraft((current) => ({ ...current, dateOfBirth: inputToDob(event.target.value) }))} /></label>
        <label className="block"><span className="micro">Gender *</span>
          <select className={FIELD} value={draft.gender} onChange={(event) => set("gender", event.target.value)}>
            <option value="">Select…</option><option>Male</option><option>Female</option><option>Other</option>
          </select></label>
        <label className="block"><span className="micro">Phone *</span>
          <input className={FIELD} value={draft.phone} onChange={(event) => set("phone", event.target.value)} /></label>
        <label className="block sm:col-span-2"><span className="micro">Address *</span>
          {authMode === "live" ? (
            <AddressAutocomplete value={draft.address} onChange={(value) => set("address", value)} className={FIELD} />
          ) : (
            <input className={FIELD} autoComplete="street-address" value={draft.address}
              onChange={(event) => set("address", event.target.value)} />
          )}</label>
        <label className="block sm:col-span-2"><span className="micro">Email *</span>
          <input type="email" className={FIELD} value={draft.email} onChange={(event) => set("email", event.target.value)} /></label>
        <label className="block"><span className="micro">Allergies *</span>
          <input className={FIELD} value={draft.allergies} onChange={(event) => set("allergies", event.target.value)} /></label>
        <label className="block"><span className="micro">Current medications *</span>
          <input className={FIELD} value={draft.currentMedications} onChange={(event) => set("currentMedications", event.target.value)} /></label>
        <label className="block sm:col-span-2"><span className="micro">Alert (optional)</span>
          <input className={FIELD} value={draft.alert} onChange={(event) => set("alert", event.target.value)} /></label>
        <label className="block"><span className="micro">Emergency contact name (optional)</span>
          <input className={FIELD} value={draft.emergencyContactName} onChange={(event) => set("emergencyContactName", event.target.value)} /></label>
        <label className="block"><span className="micro">Emergency contact phone (optional)</span>
          <input className={FIELD} value={draft.emergencyContactPhone} onChange={(event) => set("emergencyContactPhone", event.target.value)} /></label>
        <label className="block sm:col-span-2"><span className="micro">Emergency contact relationship (optional)</span>
          <input className={FIELD} value={draft.emergencyContactRelationship}
            onChange={(event) => set("emergencyContactRelationship", event.target.value)} /></label>
      </div>
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

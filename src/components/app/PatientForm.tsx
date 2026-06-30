"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { missingFields } from "@/lib/demo/backend";
import type { Patient, PatientDraft } from "@/lib/demo/types";

function dobToInput(d: PatientDraft["dateOfBirth"]): string {
  if (!d) return "";
  const p = (n: number, w: number) => String(n).padStart(w, "0");
  return `${p(d.year, 4)}-${p(d.month, 2)}-${p(d.day, 2)}`;
}
function inputToDob(s: string): PatientDraft["dateOfBirth"] {
  const parts = s.split("-").map((x) => parseInt(x, 10));
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  return { year: parts[0], month: parts[1], day: parts[2] };
}

const FIELD = "mt-1.5 w-full rounded-field border border-line bg-card px-3 py-2 text-ink outline-none focus:border-tint";

export function PatientForm({ mode, initial, existing, onCreated }: { mode: "create" | "edit"; initial: PatientDraft; existing?: Patient; onCreated?: (id: string) => void }) {
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  const router = useRouter();
  const [draft, setDraft] = useState<PatientDraft>(initial);
  const [error, setError] = useState<string | null>(null);
  if (!identity) return null;

  const invalid = missingFields(draft).size > 0;
  const set = (k: keyof PatientDraft, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (invalid) return;
    try {
      if (mode === "create") {
        const id = store.createPatient(draft, identity!);
        onCreated?.(id); // e.g. link a lead appointment to the new patient before navigating
        router.push(`/app/patients/${id}`);
      } else if (existing) {
        const updated: Patient = {
          ...existing,
          givenName: draft.givenName.trim(), lastName: draft.lastName.trim(),
          dateOfBirth: draft.dateOfBirth!, gender: draft.gender, address: draft.address.trim(),
          phone: draft.phone.trim(), email: draft.email.trim(), allergies: draft.allergies.trim(),
          currentMedications: draft.currentMedications.trim(),
          alert: draft.alert.trim() || undefined, preferredName: draft.preferredName.trim() || undefined,
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
      <h1 className="font-display text-3xl text-ink">{mode === "create" ? "New patient" : "Edit patient"}</h1>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="block"><span className="micro">Given name *</span>
          <input className={FIELD} value={draft.givenName} onChange={(e) => set("givenName", e.target.value)} /></label>
        <label className="block"><span className="micro">Last name *</span>
          <input className={FIELD} value={draft.lastName} onChange={(e) => set("lastName", e.target.value)} /></label>
        <label className="block"><span className="micro">Preferred name</span>
          <input className={FIELD} value={draft.preferredName} onChange={(e) => set("preferredName", e.target.value)} /></label>
        <label className="block"><span className="micro">Date of birth *</span>
          <input type="date" className={FIELD} value={dobToInput(draft.dateOfBirth)}
            onChange={(e) => setDraft((d) => ({ ...d, dateOfBirth: inputToDob(e.target.value) }))} /></label>
        <label className="block"><span className="micro">Gender *</span>
          <select className={FIELD} value={draft.gender} onChange={(e) => set("gender", e.target.value)}>
            <option value="">Select…</option><option>Male</option><option>Female</option><option>Other</option>
          </select></label>
        <label className="block"><span className="micro">Phone *</span>
          <input className={FIELD} value={draft.phone} onChange={(e) => set("phone", e.target.value)} /></label>
        <label className="block sm:col-span-2"><span className="micro">Address *</span>
          <input className={FIELD} value={draft.address} onChange={(e) => set("address", e.target.value)} /></label>
        <label className="block sm:col-span-2"><span className="micro">Email *</span>
          <input type="email" className={FIELD} value={draft.email} onChange={(e) => set("email", e.target.value)} /></label>
        <label className="block"><span className="micro">Allergies *</span>
          <input className={FIELD} value={draft.allergies} onChange={(e) => set("allergies", e.target.value)} /></label>
        <label className="block"><span className="micro">Current medications *</span>
          <input className={FIELD} value={draft.currentMedications} onChange={(e) => set("currentMedications", e.target.value)} /></label>
        <label className="block sm:col-span-2"><span className="micro">Alert (optional)</span>
          <input className={FIELD} value={draft.alert} onChange={(e) => set("alert", e.target.value)} /></label>
      </div>
      {error && <p className="mt-4 text-sm" style={{ color: "var(--color-rose)" }}>{error}</p>}
      <div className="mt-6 flex gap-3">
        <button type="submit" disabled={invalid}
          className="rounded-btn px-5 py-2.5 text-sm font-medium text-card transition-colors disabled:opacity-50"
          style={{ background: "var(--color-tint)" }}>
          {mode === "create" ? "Create patient" : "Save changes"}
        </button>
        <button type="button" onClick={() => router.back()}
          className="rounded-btn border border-line px-5 py-2.5 text-sm text-ink-soft hover:border-tint">Cancel</button>
      </div>
    </form>
  );
}

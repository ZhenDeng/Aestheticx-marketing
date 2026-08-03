"use client";

import { AddressAutocomplete } from "@/components/app/AddressAutocomplete";
import type { GeoPoint } from "@/lib/addressSearch";
import type { PatientDraft } from "@/lib/demo/types";

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

// The new-patient field grid, shared by the in-app PatientForm and the public /intake page
// (change: patient-form-link-generation) so both always collect the identical field set.
// `near` is a prop rather than useAddressBias() here because the intake page renders outside
// the store provider — it simply passes nothing and suggestions rank unbiased.
export function PatientDraftFields({ draft, onChange, near }: {
  draft: PatientDraft;
  onChange: (next: PatientDraft) => void;
  near?: GeoPoint;
}) {
  const set = (k: keyof PatientDraft, v: string) => onChange({ ...draft, [k]: v });

  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2">
      <label className="block"><span className="micro">Given name *</span>
        <input className={FIELD} value={draft.givenName} onChange={(e) => set("givenName", e.target.value)} /></label>
      <label className="block"><span className="micro">Last name *</span>
        <input className={FIELD} value={draft.lastName} onChange={(e) => set("lastName", e.target.value)} /></label>
      <label className="block"><span className="micro">Preferred name</span>
        <input className={FIELD} value={draft.preferredName} onChange={(e) => set("preferredName", e.target.value)} /></label>
      <label className="block"><span className="micro">Date of birth *</span>
        <input type="date" className={FIELD} value={dobToInput(draft.dateOfBirth)}
          onChange={(e) => onChange({ ...draft, dateOfBirth: inputToDob(e.target.value) })} /></label>
      <label className="block"><span className="micro">Gender *</span>
        <select className={FIELD} value={draft.gender} onChange={(e) => set("gender", e.target.value)}>
          <option value="">Select…</option><option>Male</option><option>Female</option><option>Other</option>
        </select></label>
      <label className="block"><span className="micro">Phone *</span>
        <input className={FIELD} value={draft.phone} onChange={(e) => set("phone", e.target.value)} /></label>
      <label className="block sm:col-span-2"><span className="micro">Address *</span>
        {/* 22/07 feedback: suggestions fill the field; typed text stays valid as-is. */}
        <AddressAutocomplete className={FIELD} value={draft.address} onChange={(v) => set("address", v)} near={near} /></label>
      <label className="block sm:col-span-2"><span className="micro">Email *</span>
        <input type="email" className={FIELD} value={draft.email} onChange={(e) => set("email", e.target.value)} /></label>
      <label className="block"><span className="micro">Allergies *</span>
        <input className={FIELD} value={draft.allergies} onChange={(e) => set("allergies", e.target.value)} /></label>
      <label className="block"><span className="micro">Current medications *</span>
        <input className={FIELD} value={draft.currentMedications} onChange={(e) => set("currentMedications", e.target.value)} /></label>
      <label className="block sm:col-span-2"><span className="micro">Alert (optional)</span>
        <input className={FIELD} value={draft.alert} onChange={(e) => set("alert", e.target.value)} /></label>
      {/* Emergency contact (owner feedback 02/08) — a fully optional group; the file shows
          "Nil" when left blank. */}
      <label className="block"><span className="micro">Emergency contact name (optional)</span>
        <input className={FIELD} value={draft.emergencyContactName} onChange={(e) => set("emergencyContactName", e.target.value)} /></label>
      <label className="block"><span className="micro">Emergency contact phone (optional)</span>
        <input className={FIELD} value={draft.emergencyContactPhone} onChange={(e) => set("emergencyContactPhone", e.target.value)} /></label>
      <label className="block sm:col-span-2"><span className="micro">Emergency contact relationship (optional)</span>
        <input className={FIELD} value={draft.emergencyContactRelationship} onChange={(e) => set("emergencyContactRelationship", e.target.value)} /></label>
    </div>
  );
}

"use client";

import type { AppointmentLead } from "@/lib/demo/types";

// Draft state behind the new-patient lead capture grid (spec: appointments — a new-patient
// booking captures given name, last name, date of birth, phone, email). All strings so the
// inputs stay controlled; dob is ISO yyyy-mm-dd straight from <input type="date">.
export interface LeadDraft {
  givenName: string;
  lastName: string;
  dob: string;
  phone: string;
  email: string;
}

export function emptyLeadDraft(): LeadDraft {
  return { givenName: "", lastName: "", dob: "", phone: "", email: "" };
}

// A bookable lead needs at least a name; the other details are captured where known
// (they prefill the create-patient form later). Null = not bookable yet.
export function leadFromDraft(d: LeadDraft): AppointmentLead | null {
  const givenName = d.givenName.trim();
  const lastName = d.lastName.trim();
  if (!givenName && !lastName) return null;
  return {
    givenName,
    lastName,
    dob: d.dob || undefined,
    phone: d.phone.trim() || undefined,
    email: d.email.trim() || undefined,
  };
}

const FIELD = "w-full rounded-inner border border-line px-3 py-2 text-sm text-ink outline-none focus:border-tint";

export function LeadFields({ value, onChange }: { value: LeadDraft; onChange: (v: LeadDraft) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <input value={value.givenName} onChange={(e) => onChange({ ...value, givenName: e.target.value })}
        placeholder="Given name" aria-label="Given name" className={FIELD} />
      <input value={value.lastName} onChange={(e) => onChange({ ...value, lastName: e.target.value })}
        placeholder="Last name" aria-label="Last name" className={FIELD} />
      <label className="flex items-center gap-2 text-sm text-ink-soft">
        <span className="flex-none">DOB</span>
        <input type="date" value={value.dob} onChange={(e) => onChange({ ...value, dob: e.target.value })}
          aria-label="Date of birth" className={FIELD} />
      </label>
      <input value={value.phone} onChange={(e) => onChange({ ...value, phone: e.target.value })}
        placeholder="Phone" aria-label="Phone" className={FIELD} />
      <input type="email" value={value.email} onChange={(e) => onChange({ ...value, email: e.target.value })}
        placeholder="Email" aria-label="Email" className={`${FIELD} col-span-2`} />
    </div>
  );
}

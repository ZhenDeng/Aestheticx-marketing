"use client";

import Link from "next/link";
import { displayName, hasAlert, type Patient } from "@/lib/demo/types";
import { PatientAvatar } from "./PatientAvatar";

// One patient list row (iOS PatientRow, spec: patient-records): a 56px avatar —
// "recognisable without opening the file" — beside the name and DOB · phone.
// Shared by the main patients list and the doctor's "Other patients" subpage so
// both render rows identically.
export function PatientRow({ patient }: { patient: Patient }) {
  return (
    <Link href={`/app/patients/${patient.id}`} className="flex items-center gap-4 bg-card px-5 py-3.5 transition-colors hover:bg-line-soft">
      <PatientAvatar patient={patient} size={56} />
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-ink">{displayName(patient)}</span>
        <span className="block truncate text-sm text-ink-soft">
          {patient.dateOfBirth.day}/{patient.dateOfBirth.month}/{patient.dateOfBirth.year} · {patient.phone}
        </span>
      </span>
      {hasAlert(patient) && (
        <span className="micro flex-none rounded-full px-2 py-0.5" style={{ background: "var(--color-rose-soft)", color: "var(--color-rose)" }}>
          Alert
        </span>
      )}
    </Link>
  );
}

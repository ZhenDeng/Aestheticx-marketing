"use client";

import { useDemoAuth } from "@/lib/demo/auth";
import { canCreatePatient } from "@/lib/demo/backend";
import { emptyDraft } from "@/lib/demo/types";
import { PatientForm } from "@/components/app/PatientForm";

export default function NewPatientPage() {
  const { identity } = useDemoAuth();
  if (!identity) return null;
  if (!canCreatePatient(identity)) return <p className="text-ink-soft">You don&apos;t have permission to create patients.</p>;
  return <PatientForm mode="create" initial={emptyDraft()} />;
}

"use client";

import { use } from "react";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { patientPermissions } from "@/lib/demo/backend";
import { draftFromPatient } from "@/lib/demo/types";
import { PatientForm } from "@/components/app/PatientForm";

export default function EditPatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  if (!identity) return null;
  if (store.status === "loading") return <p className="text-ink-soft">Loading…</p>;
  const patient = store.state.patients[id];
  if (!patient || !patientPermissions(identity, patient).canEditDetails) {
    return <p className="text-ink-soft">You can&apos;t edit this patient.</p>;
  }
  return <PatientForm mode="edit" initial={draftFromPatient(patient)} existing={patient} />;
}

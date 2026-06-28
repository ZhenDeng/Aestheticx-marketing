"use client";

import { doc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { firestore, functions } from "./client";
import { encodeAuthRequest, encodeNote, encodePatientForCreate, encodePatientEdits, encodeForm } from "./mappers";
import type { AuthorisationRequest, Note, Patient, TreatmentMedication, SignedFormRecord } from "@/lib/demo/types";

// Direct creates (rules-enforced), matching iOS LiveBackend.
export async function mirrorCreateRequest(request: AuthorisationRequest): Promise<void> {
  await setDoc(doc(firestore(), "authRequests", request.id), encodeAuthRequest(request));
}

export async function mirrorCreateNote(patientID: string, note: Note): Promise<void> {
  await setDoc(doc(firestore(), `patients/${patientID}/notes`, note.id), encodeNote(note));
}

// Integrity-critical operations go through the existing Cloud Functions.
export async function mirrorApproveRequest(requestId: string): Promise<void> {
  await httpsCallable(functions(), "approveRequest")({ requestId });
}

export async function mirrorRequireEdit(requestId: string): Promise<void> {
  await httpsCallable(functions(), "requireEdit")({ requestId });
}

// consumeRepeats both decrements repeats AND writes the treatment note in one
// server transaction (verified against backend/functions/src/index.ts). Callers
// pass the note here and must NOT separately create the treatment note.
export interface ConsumeRepeatsInput {
  patientId: string;
  clinicId: string | null;
  authorisationIds: string[];
  note: { title: string; body: string; medications: TreatmentMedication[] };
}

export async function mirrorConsumeRepeats(input: ConsumeRepeatsInput): Promise<void> {
  await httpsCallable(functions(), "consumeRepeats")({
    patientId: input.patientId,
    clinicId: input.clinicId,
    authorisationIds: input.authorisationIds,
    note: {
      title: input.note.title,
      body: input.note.body,
      medications: input.note.medications.map((m) => ({
        name: m.name, batch: m.batch ?? "", expiry: m.expiry ?? "", dosage: m.dosage ?? "",
      })),
    },
  });
}

export async function mirrorCreatePatient(p: Patient): Promise<void> {
  await setDoc(doc(firestore(), "patients", p.id), encodePatientForCreate(p));
}
export async function mirrorUpdatePatient(p: Patient): Promise<void> {
  await updateDoc(doc(firestore(), "patients", p.id), encodePatientEdits(p));
}
export async function mirrorDeletePatient(id: string): Promise<void> {
  await deleteDoc(doc(firestore(), "patients", id));
}
export async function mirrorMergePatients(keepId: string, removeId: string): Promise<void> {
  await httpsCallable(functions(), "mergePatients")({ keepId, removeId });
}

export async function mirrorCreateForm(form: SignedFormRecord): Promise<void> {
  await setDoc(doc(firestore(), `patients/${form.patientID}/forms`, form.id), encodeForm(form));
}
export async function mirrorDeleteForm(patientID: string, formId: string): Promise<void> {
  await deleteDoc(doc(firestore(), `patients/${patientID}/forms`, formId));
}

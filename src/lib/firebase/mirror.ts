"use client";

import { doc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { firestore, functions } from "./client";
import { encodeAuthRequest, encodeNote, encodePatientForCreate, encodePatientEdits, encodeForm, encodeNoteTemplate, encodeFollowUpTask } from "./mappers";
import type { AuthorisationRequest, Note, NoteTemplate, FollowUpTask, FollowUpSettings, FollowUpStatus, Patient, TreatmentMedication, SignedFormRecord } from "@/lib/demo/types";

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

// sendAftercare queues the email AND writes the aftercareRecord note server-side,
// so callers must NOT also create the note locally in live mode — rehydrate after.
export async function mirrorSendAftercare(input: {
  patientID: string;
  content: string;
  medications: TreatmentMedication[];
}): Promise<void> {
  await httpsCallable(functions(), "sendAftercare")({
    patientId: input.patientID,
    content: input.content,
    medications: input.medications.map((m) => ({
      name: m.name, batch: m.batch ?? "", expiry: m.expiry ?? "", dosage: m.dosage ?? "",
    })),
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
// Deferred backend: the live merge runs server-side in the `mergePatients` callable, which
// must re-point the removed file's relational docs onto the kept file — including
// `appointments` (set patientId = keepId and refresh the denormalised patientName to the
// kept patient's calendar name), matching the demo backend's mergePatients. Verify/extend the
// Cloud Function so appointments aren't orphaned after a live merge.
export async function mirrorMergePatients(keepId: string, removeId: string): Promise<void> {
  await httpsCallable(functions(), "mergePatients")({ keepId, removeId });
}

export async function mirrorCreateForm(form: SignedFormRecord): Promise<void> {
  await setDoc(doc(firestore(), `patients/${form.patientID}/forms`, form.id), encodeForm(form));
}
export async function mirrorDeleteForm(patientID: string, formId: string): Promise<void> {
  await deleteDoc(doc(firestore(), `patients/${patientID}/forms`, formId));
}

// Private per-user templates at users/{uid}/noteTemplates (rules: uid()==userId).
export async function mirrorSaveNoteTemplate(t: NoteTemplate): Promise<void> {
  await setDoc(doc(firestore(), `users/${t.ownerID}/noteTemplates`, t.id), encodeNoteTemplate(t));
}
export async function mirrorDeleteNoteTemplate(ownerID: string, id: string): Promise<void> {
  await deleteDoc(doc(firestore(), `users/${ownerID}/noteTemplates`, id));
}

// Follow-up tasks live at users/{uid}/followUpTasks; settings on the users/{uid} doc
// (rules: owner-only). All direct writes, mirroring iOS LiveBackend.
export async function mirrorSaveFollowUpTask(t: FollowUpTask): Promise<void> {
  await setDoc(doc(firestore(), `users/${t.ownerID}/followUpTasks`, t.id), encodeFollowUpTask(t));
}
export async function mirrorSetFollowUpStatus(uid: string, id: string, status: FollowUpStatus): Promise<void> {
  await updateDoc(doc(firestore(), `users/${uid}/followUpTasks`, id), { status });
}
export async function mirrorSetFollowUpSettings(uid: string, settings: FollowUpSettings): Promise<void> {
  await updateDoc(doc(firestore(), "users", uid), { followUpEnabled: settings.enabled, followUpIntervalDays: settings.intervalDays });
}

// Self-booking: per-user link token on the users/{uid} doc; confirm via the deployed callable.
export async function mirrorSetBookingToken(uid: string, token: string): Promise<void> {
  // merge so a brand-new account whose profile doc isn't written yet doesn't throw
  // "No document to update" (updateDoc would).
  await setDoc(doc(firestore(), "users", uid), { bookingToken: token }, { merge: true });
}
export async function mirrorConfirmAppointment(id: string): Promise<void> {
  await httpsCallable(functions(), "confirmAppointment")({ appointmentId: id });
}
export async function mirrorBookTreatment(input: {
  ownerID: string; dateISO: string; startMinute: number; durationMinutes: number;
  patientID?: string; patientName?: string; note?: string;
}): Promise<void> {
  await httpsCallable(functions(), "bookTreatment")({
    ownerId: input.ownerID, dateISO: input.dateISO, startMinute: input.startMinute,
    durationMinutes: input.durationMinutes, patientId: input.patientID ?? null,
    patientName: input.patientName ?? null, note: input.note ?? "",
  });
}
export async function mirrorRescheduleAppointment(id: string, dateISO: string, startMinute: number, durationMinutes: number): Promise<void> {
  await httpsCallable(functions(), "rescheduleAppointment")({ appointmentId: id, dateISO, startMinute, durationMinutes });
}
export async function mirrorMarkAppointment(id: string, status: "completed" | "noShow" | "cancelled"): Promise<void> {
  await httpsCallable(functions(), "markAppointment")({ appointmentId: id, status });
}
// Deferred backend: the `linkAppointmentPatient` Cloud Function is not yet deployed. The web
// UI is ready; live linking lights up once it lands (demo works fully today).
export async function mirrorLinkAppointmentPatient(id: string, patientId: string): Promise<void> {
  await httpsCallable(functions(), "linkAppointmentPatient")({ appointmentId: id, patientId });
}

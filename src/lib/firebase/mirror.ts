"use client";

import { doc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { firestore, functions } from "./client";
import { encodeAuthRequest, encodeMedication, encodeNote, encodePatientForCreate, encodePatientEdits, encodeForm, encodeNoteTemplate, encodeFollowUpTask } from "./mappers";
import type { AuthorisationRequest, MedicationItem, Note, NoteTemplate, FollowUpTask, FollowUpSettings, FollowUpStatus, Patient, TreatmentMedication, SignedFormRecord } from "@/lib/demo/types";

// Direct creates (rules-enforced), matching iOS LiveBackend.
export async function mirrorCreateRequest(request: AuthorisationRequest): Promise<void> {
  await setDoc(doc(firestore(), "authRequests", request.id), encodeAuthRequest(request));
}

// Attachments upload their bytes (carried as a composer data-url) to Storage first, then
// the note doc references them by fileId. The doc write follows the uploads so a note never
// points at missing objects; a failed upload aborts into the lastSyncError path.
async function uploadNoteAttachments(note: { attachments?: import("@/lib/demo/types").NoteAttachment[] }): Promise<void> {
  const pending = (note.attachments ?? []).filter((a) => a.dataUrl);
  for (const a of pending) {
    const blob = await (await fetch(a.dataUrl!)).blob();
    const { uploadAttachment } = await import("./storage");
    await uploadAttachment(a.fileID, blob, a.mimeType);
  }
}

export async function mirrorCreateNote(patientID: string, note: Note): Promise<void> {
  await uploadNoteAttachments(note);
  await setDoc(doc(firestore(), `patients/${patientID}/notes`, note.id), encodeNote(note));
}

// Integrity-critical operations go through the existing Cloud Functions.
export async function mirrorApproveRequest(requestId: string): Promise<void> {
  await httpsCallable(functions(), "approveRequest")({ requestId });
}

export async function mirrorRequireEdit(requestId: string): Promise<void> {
  await httpsCallable(functions(), "requireEdit")({ requestId });
}

// Cooperation relationships (spec 2026-07-08) — superAdmin-gated Cloud Functions. Wire names
// are lowercase (doctorId/counterpartyId), matching the Firestore doc + backend callable.
export async function mirrorSetCooperationRelationship(input: import("@/lib/demo/backend").SetCooperationRelationshipInput): Promise<void> {
  await httpsCallable(functions(), "setCooperationRelationship")({
    doctorId: input.doctorID,
    doctorName: input.doctorName,
    counterpartyType: input.counterpartyType,
    counterpartyId: input.counterpartyID,
    counterpartyName: input.counterpartyName,
    status: input.status,
    authRequestsAllowed: input.authRequestsAllowed,
    invoiceApplies: input.invoiceApplies,
    priceCentsOverride: input.priceCentsOverride,
  });
}

export async function mirrorRemoveCooperationRelationship(relationshipId: string): Promise<void> {
  await httpsCallable(functions(), "removeCooperationRelationship")({ relationshipId });
}

// Platform audit log (§21): a Platform Admin opening a patient file → the superAdmin-only
// recordAdminPatientAccess callable, which writes the durable `admin_patient_access` entry.
// Lowercase wire keys ({patientId, patientName}), matching the backend callable's schema.
export async function mirrorRecordAdminAccess(patientId: string, patientName: string): Promise<void> {
  await httpsCallable(functions(), "recordAdminPatientAccess")({ patientId, patientName });
}

export async function mirrorBackfillCooperationRelationships(): Promise<{ created: number } | void> {
  const res = await httpsCallable(functions(), "backfillCooperationRelationships")({});
  return res.data as { created: number };
}

// The nurse's edit-and-resubmit is a direct client update (not a Function): the rules allow
// the raising nurse to change items + flip status needsEdit → pending, and nothing else.
export async function mirrorResubmitRequest(requestId: string, items: MedicationItem[]): Promise<void> {
  await updateDoc(doc(firestore(), "authRequests", requestId), {
    items: items.map(encodeMedication),
    status: "pending",
  });
}

// Withdraw is a direct client update the rules allow for the raising nurse or a clinic admin:
// flip status pending/needsEdit → withdrawn (status only), and nothing else. The
// onAuthRequestWritten trigger then removes the reviewing doctor from openReviewerDoctorIds,
// revoking their read-only file access (spec 2026-07-07 revocation hardening).
export async function mirrorWithdrawRequest(requestId: string): Promise<void> {
  await updateDoc(doc(firestore(), "authRequests", requestId), { status: "withdrawn" });
}

// consumeRepeats both decrements repeats AND writes the treatment note in one
// server transaction (verified against backend/functions/src/index.ts). Callers
// pass the note here and must NOT separately create the treatment note.
export interface ConsumeRepeatsInput {
  patientId: string;
  clinicId: string | null;
  authorisationIds: string[];
  note: { title: string; body: string; medications: TreatmentMedication[]; attachments?: import("@/lib/demo/types").NoteAttachment[] };
}

export async function mirrorConsumeRepeats(input: ConsumeRepeatsInput): Promise<void> {
  // Attachment bytes upload here so they exist the moment the deployed callable learns to
  // persist attachments[]; today it drops the metadata (same gap as iOS, which shares this
  // Function), so a ticked note's attachments survive locally but not a rehydrate.
  await uploadNoteAttachments({ attachments: input.note.attachments });
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
      attachments: (input.note.attachments ?? []).map((a) => ({ fileId: a.fileID, displayName: a.displayName, mimeType: a.mimeType })),
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
// Avatar set: a single-field patient doc update (rules allow it — only
// prescribingDoctorIds/ownerType/ownerId are locked), mirroring how iOS records
// the freshly stored fileID on the patient via updatePatient.
export async function mirrorSetPatientAvatar(patientID: string, avatarFileId: string): Promise<void> {
  await updateDoc(doc(firestore(), "patients", patientID), { avatarFileId });
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

// Own-profile edits are direct rules-checked writes on users/{uid} (setDoc merge so a
// thin doc can't fail with "No document to update"). Only client-writable keys are sent —
// never abn/roles/clinics/mustChangePassword (rules reject the whole write if any is
// touched) and never the demo-only avatarDataUrl preview bytes.
export async function mirrorUpdateProfile(uid: string, edits: import("@/lib/demo/types").UserProfileEdit): Promise<void> {
  const values: Record<string, string> = {};
  if (edits.ahpra !== undefined) values.ahpra = edits.ahpra;
  if (edits.phone !== undefined) values.phone = edits.phone;
  if (edits.address !== undefined) values.address = edits.address;
  if (edits.avatarFileId !== undefined) values.avatarFileId = edits.avatarFileId;
  if (Object.keys(values).length === 0) return; // demo-only edit (avatarDataUrl) — nothing to persist
  await setDoc(doc(firestore(), "users", uid), values, { merge: true });
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
  patientID?: string; patientName?: string; lead?: import("@/lib/demo/types").AppointmentLead; note?: string;
}): Promise<void> {
  await httpsCallable(functions(), "bookTreatment")({
    ownerId: input.ownerID, dateISO: input.dateISO, startMinute: input.startMinute,
    durationMinutes: input.durationMinutes, patientId: input.patientID ?? null,
    patientName: input.patientName ?? null, lead: input.lead ?? null, note: input.note ?? "",
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
// Authorisation-slot mirrors → the deployed backend callables (publishAuthSlots / withdrawAuthSlots /
// bookAuthSlot). The doctor publishes/withdraws their own windows (doctorId comes from auth).
export async function mirrorPublishAvailability(window: import("@/lib/demo/types").AvailabilityWindow): Promise<void> {
  await httpsCallable(functions(), "publishAuthSlots")({
    dateISO: window.dateISO, startMinute: window.startMinute, endMinute: window.endMinute,
  });
}
export async function mirrorWithdrawAvailability(dateISO: string, startMinute: number): Promise<void> {
  await httpsCallable(functions(), "withdrawAuthSlots")({ dateISO, startMinute });
}
// Nurse-facing availability reads (server-side; the nurse has no local windows).
export async function mirrorListAvailableDoctors(): Promise<{ doctorID: string; doctorName: string; hasSlots: boolean; online: boolean; alwaysAcceptAuth: boolean }[]> {
  const res = await httpsCallable(functions(), "listAvailableDoctors")({});
  const raw = (res.data as { doctors?: unknown }).doctors;
  const doctors = Array.isArray(raw) ? (raw as { doctorId: string; doctorName: string; hasSlots: boolean; online: boolean; alwaysAcceptAuth: boolean }[]) : [];
  return doctors.map((d) => ({ doctorID: d.doctorId, doctorName: d.doctorName, hasSlots: d.hasSlots, online: d.online, alwaysAcceptAuth: d.alwaysAcceptAuth }));
}
// Full prescribing-doctor directory (any signed-in caller) — the auth-request picker.
export async function mirrorListDoctors(): Promise<{ doctorId: string; doctorName: string }[]> {
  const res = await httpsCallable(functions(), "listDoctors")({});
  const raw = (res.data as { doctors?: unknown }).doctors;
  const doctors = Array.isArray(raw) ? (raw as { doctorId?: unknown; doctorName?: unknown }[]) : [];
  return doctors
    .filter((d) => typeof d.doctorId === "string" && d.doctorId)
    .map((d) => ({ doctorId: d.doctorId as string, doctorName: typeof d.doctorName === "string" && d.doctorName ? d.doctorName : "Doctor" }));
}
export async function mirrorListDoctorOpenSlots(doctorID: string, dateISO: string): Promise<number[]> {
  const res = await httpsCallable(functions(), "listDoctorOpenSlots")({ doctorId: doctorID, dateISO });
  const raw = (res.data as { slots?: unknown }).slots;
  return Array.isArray(raw) ? (raw as number[]) : [];
}
// A clinician edits their treatment schedule → whole-config write to the backend
// `setTreatmentAvailability` callable (the same doc public/self booking gates on). Web
// days[7] (Mon-first) collapse to the backend's SPARSE windows[] keyed by getUTCDay()
// weekday (0=Sun … 6=Sat) — only open days emit a window; blocks drop their synthetic id.
export async function mirrorSetTreatmentAvailability(config: import("@/lib/demo/types").TreatmentAvailability): Promise<void> {
  const windows = config.days.flatMap((d, i) =>
    d.open ? [{ weekday: (i + 1) % 7, openMinute: d.openMinute, closeMinute: d.closeMinute }] : [],
  );
  const blocks = config.blocks.map((b) => ({ dateISO: b.dateISO, startMinute: b.startMinute, endMinute: b.endMinute }));
  await httpsCallable(functions(), "setTreatmentAvailability")({ ownerId: config.ownerID, windows, blocks });
}

// Google Calendar linking (deployed callables): authUrl begins the OAuth consent (the
// googleCalendarCallback Function stores the tokens server-side — never client-readable);
// sync pulls 14 days of free/busy into externalBusy/{uid} and mirrors confirmed treatment
// appointments to the linked calendar, returning the counts.
export async function mirrorGoogleCalendarAuthUrl(): Promise<string> {
  const res = await httpsCallable(functions(), "googleCalendarAuthUrl")({});
  return String((res.data as { url?: unknown }).url ?? "");
}
export async function mirrorSyncGoogleCalendar(timeZone: string): Promise<{ busyCount: number; mirrored: number }> {
  const res = await httpsCallable(functions(), "syncGoogleCalendar")({ timeZone });
  const d = res.data as { busyCount?: unknown; mirrored?: unknown };
  return {
    busyCount: typeof d.busyCount === "number" ? d.busyCount : 0,
    mirrored: typeof d.mirrored === "number" ? d.mirrored : 0,
  };
}

// A doctor toggles online/always-accept status → the existing, already-deployed
// setOnlineStatus callable (writes users/{uid}.onlineStatus/alwaysAcceptAuth, merge:true).
export async function mirrorSetOnlineStatus(status: import("@/lib/demo/types").DoctorStatus): Promise<void> {
  await httpsCallable(functions(), "setOnlineStatus")({ online: status.online, alwaysAcceptAuth: status.alwaysAcceptAuth });
}

// The server validates the slot + mints the appointment; a slot-taken double-book rejects here.
// The callables require patientId XOR lead (a new-patient booking sends the lead record).
export async function mirrorBookAuthSlot(p: {
  doctorID: string; dateISO: string; slotMinute: number;
  patientID?: string; lead?: import("@/lib/demo/types").AppointmentLead; counterpartyName: string;
}): Promise<void> {
  await httpsCallable(functions(), "bookAuthSlot")({
    doctorId: p.doctorID, dateISO: p.dateISO, slotMinute: p.slotMinute,
    patientId: p.patientID ?? null, lead: p.lead ?? null, counterpartyName: p.counterpartyName,
  });
}

export async function mirrorRequestAdHocAuth(p: {
  doctorID: string; dateISO: string; atMinute: number;
  patientID?: string; lead?: import("@/lib/demo/types").AppointmentLead; counterpartyName: string;
}): Promise<void> {
  await httpsCallable(functions(), "requestAdHocAuth")({
    doctorId: p.doctorID, dateISO: p.dateISO, atMinute: p.atMinute,
    patientId: p.patientID ?? null, lead: p.lead ?? null, counterpartyName: p.counterpartyName,
  });
}

// --- Consult calls (deployed startConsultCall/mintCallToken; livekit.ts + notificationsFn.ts) ---

// iOS parity: LiveBackend.recordCalledDoctor does a client-side own-profile update.
// setDoc merge (not updateDoc) so a thin users doc can't fail with "No document to update".
export async function mirrorRecordCalledDoctor(uid: string, doctorID: string): Promise<void> {
  await setDoc(doc(firestore(), "users", uid), { lastCalledDoctorId: doctorID }, { merge: true });
}

// Rings the other party (writes their consultSignals doc + enqueues the VoIP push).
// delivered = number of VoIP tokens pushed; 0 means no device will background-ring,
// though the in-app signal still reaches an open app.
export async function mirrorStartConsultCall(requestID: string): Promise<{ room: string; delivered: number }> {
  const res = await httpsCallable(functions(), "startConsultCall")({ requestId: requestID });
  const d = res.data as { room?: unknown; delivered?: unknown };
  return {
    room: typeof d.room === "string" ? d.room : `req-${requestID}`,
    delivered: typeof d.delivered === "number" ? d.delivered : 0,
  };
}

// Mints the LiveKit join token for the request's room (2h TTL, publish+subscribe).
export async function mirrorMintCallToken(requestID: string): Promise<{ room: string; token: string }> {
  const res = await httpsCallable(functions(), "mintCallToken")({ requestId: requestID });
  const d = res.data as { room?: unknown; token?: unknown };
  if (typeof d.token !== "string" || !d.token) throw new Error("mintCallToken returned no token");
  return { room: typeof d.room === "string" ? d.room : `req-${requestID}`, token: d.token };
}

// Super-admin user administration (both callables reject non-super-admin callers
// server-side). createUser assigns roles at creation, sets a temporary password +
// mustChangePassword claim, and queues the welcome email.
export async function mirrorCreateUser(input: import("@/lib/demo/userAdmin").NewUserInput): Promise<{ uid: string }> {
  const res = await httpsCallable(functions(), "createUser")({
    email: input.email, name: input.name, abn: input.abn, businessName: input.businessName,
    phone: input.phone, temporaryPassword: input.temporaryPassword, roles: input.roles,
    ...(input.ahpra ? { ahpra: input.ahpra } : {}),
  });
  const d = res.data as { uid?: unknown };
  if (typeof d.uid !== "string" || !d.uid) throw new Error("createUser returned no uid");
  return { uid: d.uid };
}

export async function mirrorResetUserPassword(email: string): Promise<void> {
  await httpsCallable(functions(), "resetUserPassword")({ email });
}

// Deletes the target's LOGIN (Auth record + users/{uid} profile doc); clinical
// records are retained server-side. Self-deletion is rejected by the Function —
// the in-app Delete account flow is the self-serve path.
export async function mirrorDeleteUserAccount(uid: string): Promise<void> {
  await httpsCallable(functions(), "deleteUserAccount")({ uid });
}

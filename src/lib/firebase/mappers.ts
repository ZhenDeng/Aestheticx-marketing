// Pure Firestore <-> domain mappers. Field names ported verbatim from the iOS
// LiveBackend.swift static decoders/encoders. No Firebase imports here (testable).
import type {
  AccountRecord, Appointment, AppointmentLead, AppointmentType, Authorisation, AuthorisationRequest, DateOfBirth,
  ExternalBusyCalendar, ExternalBusyEvent,
  MedicationItem, Note, NoteAttachment, Patient, PatientOwner, PatientSummary, ProductCategory,
  ProductUnit, RequestStatus, NoteKind, Role, TreatmentMedication, SignedFormRecord, FormAnswer,
  NoteTemplate, FollowUpTask, FollowUpStatus, DeliveryStatus, AvailabilityWindow,
  TreatmentAvailability, DaySchedule, TreatmentBlock, EmergencyAuthorisation, EmergencyKind,
} from "@/lib/demo/types";
import type { FormTemplateKind, SigningChannel } from "@/lib/demo/forms";
import { AFTERCARE_CATEGORIES, type AftercareCategory } from "@/lib/demo/aftercare";
import type { Invoice, InvoiceLine } from "@/lib/demo/invoicing";

type Doc = Record<string, unknown>;

// Firestore Timestamp | number | undefined -> epoch ms.
function toMillis(v: unknown): number {
  if (v && typeof v === "object" && "toMillis" in v && typeof (v as { toMillis: unknown }).toMillis === "function") {
    return (v as { toMillis: () => number }).toMillis();
  }
  return typeof v === "number" ? v : 0;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function intValue(v: unknown): number {
  return typeof v === "number" ? Math.trunc(v) : 0;
}
function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export function parseDob(s: string): DateOfBirth {
  const parts = s.split("-").map((p) => parseInt(p, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return { year: 0, month: 0, day: 0 };
  return { year: parts[0], month: parts[1], day: parts[2] };
}
export function formatDob(d: DateOfBirth): string {
  const p = (n: number, w: number) => String(n).padStart(w, "0");
  return `${p(d.year, 4)}-${p(d.month, 2)}-${p(d.day, 2)}`;
}

function mapOwner(data: Doc): PatientOwner {
  const id = str(data.ownerId);
  switch (data.ownerType) {
    case "doctor": return { kind: "doctor", id };
    case "clinic": return { kind: "clinic", id };
    default: return { kind: "nurse", id };
  }
}

export function mapMedication(data: Doc): MedicationItem {
  const areas = strArray(data.areas).length
    ? strArray(data.areas)
    : str(data.area) ? str(data.area).split(",").map((s) => s.trim()).filter(Boolean) : [];
  return {
    name: str(data.name),
    dosage: str(data.dosage),
    category: (str(data.category) || "other") as ProductCategory,
    brand: typeof data.brand === "string" ? data.brand : undefined,
    unit: (str(data.unit) || "freeText") as ProductUnit,
    areas,
    timing: typeof data.timing === "string" ? data.timing : undefined,
  };
}

export function mapPatient(id: string, data: Doc): Patient {
  return {
    id,
    givenName: str(data.givenName),
    lastName: str(data.lastName),
    dateOfBirth: parseDob(str(data.dateOfBirth)),
    gender: str(data.gender),
    address: str(data.address),
    phone: str(data.phone),
    email: str(data.email),
    allergies: str(data.allergies),
    currentMedications: str(data.currentMedications),
    owner: mapOwner(data),
    prescribingDoctorIDs: strArray(data.prescribingDoctorIds),
    openReviewerDoctorIDs: strArray(data.openReviewerDoctorIds),
    avatarFileId: typeof data.avatarFileId === "string" && data.avatarFileId ? data.avatarFileId : undefined,
    alert: typeof data.alert === "string" ? data.alert : undefined,
    preferredName: typeof data.preferredName === "string" ? data.preferredName : undefined,
  };
}

// The note doc's attachments[] → NoteAttachment[] (string fields only; junk entries dropped).
function mapAttachments(raw: unknown): NoteAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((a): NoteAttachment[] => {
    if (typeof a !== "object" || a === null) return [];
    const d = a as Doc;
    return [{ fileID: str(d.fileId), displayName: str(d.displayName), mimeType: str(d.mimeType) }];
  });
}

export function mapNote(id: string, patientID: string, data: Doc): Note {
  const meds = Array.isArray(data.medications) ? (data.medications as Doc[]) : [];
  return {
    id,
    patientID,
    kind: (str(data.kind) || "general") as NoteKind,
    title: str(data.title),
    body: str(data.body),
    createdAt: toMillis(data.createdAt),
    authorID: str(data.authorId),
    authorBadge: str(data.authorBadge),
    consumedAuthorisationIDs: strArray(data.consumedAuthorisationIds),
    medications: meds.map((m): TreatmentMedication => ({
      name: str(m.name), batch: str(m.batch), expiry: str(m.expiry), dosage: str(m.dosage),
    })),
    attachments: mapAttachments(data.attachments),
    deliveryStatus: ((): DeliveryStatus | undefined => {
      const s = str(data.deliveryStatus);
      return s === "queued" || s === "delivered" || s === "failed" ? s : undefined;
    })(),
    aftercareCategories: strArray(data.aftercareCategories)
      .filter((c): c is AftercareCategory => (AFTERCARE_CATEGORIES as readonly string[]).includes(c)),
  };
}

export function mapAuthorisation(id: string, data: Doc): Authorisation {
  const expiresAt = data.expiresAtMillis != null ? intValue(data.expiresAtMillis) : toMillis(data.expiresAt);
  return {
    id,
    requestID: str(data.requestId),
    patientID: str(data.patientId),
    doctorID: str(data.doctorId),
    nurseID: str(data.nurseId),
    clinicID: typeof data.clinicId === "string" ? data.clinicId : null,
    medication: mapMedication((data.medication as Doc) ?? {}),
    repeatsRemaining: intValue(data.repeatsRemaining),
    expiresAt,
    createdAt: toMillis(data.createdAt),
    invoiced: data.invoiced === true,
  };
}

// Emergency standing authorisation (spec 2026-07-08) written by the approveRequest Cloud
// Function. expiresAtMillis is a plain number; createdAt/refreshedAt are serverTimestamps.
export function mapEmergencyAuthorisation(id: string, data: Doc): EmergencyAuthorisation {
  const kind: EmergencyKind = data.kind === "hyaluronidase" ? "hyaluronidase" : "adrenaline";
  return {
    id,
    patientID: str(data.patientId),
    doctorID: str(data.doctorId),
    doctorName: str(data.doctorName) || "Doctor",
    kind,
    createdAt: toMillis(data.createdAt),
    refreshedAt: toMillis(data.refreshedAt),
    expiresAt: intValue(data.expiresAtMillis),
    sourceAuthorisationIDs: strArray(data.sourceAuthorisationIds),
  };
}

export function mapAuthRequest(id: string, data: Doc): AuthorisationRequest {
  const items = (Array.isArray(data.items) ? (data.items as Doc[]) : []).map(mapMedication);
  const clinicId = typeof data.clinicId === "string" ? data.clinicId : null;
  const summary = data.patientSummary as Doc | undefined;
  const patientSummary: PatientSummary | undefined = summary
    ? {
        fullName: str(summary.name),
        dateOfBirth: parseDob(str(summary.dateOfBirth)),
        allergies: str(summary.allergies),
        currentMedications: str(summary.currentMedications),
        alert: typeof summary.alert === "string" ? summary.alert : undefined,
      }
    : undefined;
  return {
    id,
    patientID: str(data.patientId),
    nurse: { id: str(data.nurseId), name: str(data.nurseName) },
    doctorID: str(data.doctorId),
    context: clinicId ? { kind: "clinic", clinic: { id: clinicId, name: clinicId } } : { kind: "independent" },
    items,
    status: (str(data.status) || "pending") as RequestStatus,
    createdAt: toMillis(data.createdAt),
    patientSummary,
  };
}

// slotPublications/{doctorId}_{dateISO}_{startMinute} → AvailabilityWindow. The backend doc
// has no doctorName (it's the caller's own window on hydrate; the doctor view doesn't show it).
export function mapAvailabilityWindow(id: string, data: Doc): AvailabilityWindow {
  return {
    id,
    doctorID: str(data.doctorId),
    doctorName: "", // backend slotPublications has no doctorName; the doctor view doesn't show it
    dateISO: str(data.dateISO),
    startMinute: intValue(data.startMinute),
    endMinute: intValue(data.endMinute),
    // data.slotStarts is intentionally dropped — slots are recomputed by slotsForWindow().
  };
}

// availability/{ownerId} (written by the backend setTreatmentAvailability callable) → web
// TreatmentAvailability. The backend stores a SPARSE windows[] keyed by getUTCDay() weekday
// (0=Sun … 6=Sat) plus id-less blocks; the web wants a DENSE days[7] indexed Mon-first and a
// stable id per block (React keys + remove). Web index i ↔ backend weekday (i + 1) % 7.
export function mapTreatmentAvailability(id: string, data: Doc): TreatmentAvailability {
  const windows = Array.isArray(data.windows) ? (data.windows as Doc[]) : [];
  const days: DaySchedule[] = Array.from({ length: 7 }, (_, i) => {
    const backendWeekday = (i + 1) % 7;
    const w = windows.find((x) => intValue((x as Doc).weekday) === backendWeekday);
    return w
      ? { open: true, openMinute: intValue((w as Doc).openMinute), closeMinute: intValue((w as Doc).closeMinute) }
      : { open: false, openMinute: 540, closeMinute: 1020 };
  });
  const rawBlocks = Array.isArray(data.blocks) ? (data.blocks as Doc[]) : [];
  const blocks: TreatmentBlock[] = rawBlocks.map((b) => {
    const dateISO = str(b.dateISO), startMinute = intValue(b.startMinute), endMinute = intValue(b.endMinute);
    return { id: `${dateISO}_${startMinute}_${endMinute}`, dateISO, startMinute, endMinute };
  });
  return { ownerID: id, days, blocks };
}

// The appointment doc's new-patient lead record → AppointmentLead (string fields only).
function mapLead(raw: unknown): AppointmentLead | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;
  const d = raw as Doc;
  const lead: AppointmentLead = { givenName: str(d.givenName), lastName: str(d.lastName) };
  if (typeof d.dob === "string") lead.dob = d.dob;
  if (typeof d.phone === "string") lead.phone = d.phone;
  if (typeof d.email === "string") lead.email = d.email;
  return lead;
}

// externalBusy/{ownerId}: synced busy times from a linked Google/Apple calendar (written by
// the sync Functions; owner + clinic members may read). Events are instants + the owner's zone.
export function mapExternalBusy(id: string, data: Doc): ExternalBusyCalendar {
  const raw = Array.isArray(data.events) ? (data.events as Doc[]) : [];
  const events: ExternalBusyEvent[] = raw.flatMap((e): ExternalBusyEvent[] => {
    if (typeof e !== "object" || e === null) return [];
    const startISO = str((e as Doc).startISO), endISO = str((e as Doc).endISO);
    if (!startISO || !endISO) return [];
    return [{
      startISO, endISO,
      ...(typeof (e as Doc).transparent === "boolean" && { transparent: (e as Doc).transparent as boolean }),
      ...(typeof (e as Doc).id === "string" && { id: (e as Doc).id as string }),
    }];
  });
  return {
    ownerID: id,
    timeZone: str(data.timeZone) || "Australia/Sydney",
    events,
    updatedAtMillis: toMillis(data.updatedAt) || undefined,
  };
}

export function mapAppointment(id: string, data: Doc): Appointment {
  const type: AppointmentType = data.type === "authorisation" ? "authSlot" : "treatment";
  return {
    id,
    type,
    ownerID: str(data.ownerId),
    dateISO: str(data.dateISO),
    startMinute: intValue(data.startMinute),
    endMinute: intValue(data.endMinute),
    status: (str(data.status) || "confirmed") as Appointment["status"],
    patientID: typeof data.patientId === "string" ? data.patientId : undefined,
    patientName: typeof data.patientName === "string" ? data.patientName : undefined,
    lead: mapLead(data.lead),
    appointmentNote: typeof data.appointmentNote === "string" ? data.appointmentNote : undefined,
  };
}

// --- Encoders (writes) ---

export function encodeMedication(m: MedicationItem): Doc {
  return {
    name: m.name, dosage: m.dosage, category: m.category, brand: m.brand ?? null,
    unit: m.unit, areas: m.areas, timing: m.timing ?? null, area: m.areas.join(", "),
  };
}

export function encodeAuthRequest(r: AuthorisationRequest): Doc {
  const clinicId = r.context.kind === "clinic" ? r.context.clinic.id : null;
  const summary = r.patientSummary
    ? {
        name: r.patientSummary.fullName,
        dateOfBirth: formatDob(r.patientSummary.dateOfBirth),
        allergies: r.patientSummary.allergies,
        currentMedications: r.patientSummary.currentMedications,
        alert: r.patientSummary.alert ?? null, // clinical safety flag — must persist
      }
    : null;
  return {
    patientId: r.patientID,
    nurseId: r.nurse.id,
    nurseName: r.nurse.name,
    doctorId: r.doctorID,
    clinicId,
    status: r.status,
    createdAt: r.createdAt,
    items: r.items.map(encodeMedication),
    patientSummary: summary,
  };
}

export function encodeNote(n: Note): Doc {
  return {
    kind: n.kind,
    title: n.title,
    body: n.body,
    createdAt: n.createdAt,
    authorId: n.authorID,
    authorBadge: n.authorBadge,
    consumedAuthorisationIds: n.consumedAuthorisationIDs,
    medications: n.medications.map((m) => ({ name: m.name, batch: m.batch ?? "", expiry: m.expiry ?? "", dosage: m.dosage ?? "" })),
    // Always written (iOS parity); the demo-only dataUrl never reaches Firestore.
    attachments: (n.attachments ?? []).map((a) => ({ fileId: a.fileID, displayName: a.displayName, mimeType: a.mimeType })),
    // Aftercare-only fields — omitted on general/treatment notes (iOS parity, no schema noise).
    ...(n.deliveryStatus !== undefined && { deliveryStatus: n.deliveryStatus }),
    ...(n.aftercareCategories !== undefined && { aftercareCategories: n.aftercareCategories }),
  };
}

function patientCore(p: Patient): Doc {
  return {
    givenName: p.givenName, lastName: p.lastName, dateOfBirth: formatDob(p.dateOfBirth),
    gender: p.gender, address: p.address, phone: p.phone, email: p.email,
    allergies: p.allergies, currentMedications: p.currentMedications,
    // iOS LiveBackend.encode always carries the avatar key; the demo-only
    // avatarDataUrl preview bytes never reach Firestore.
    avatarFileId: p.avatarFileId ?? null,
    alert: p.alert ?? null, preferredName: p.preferredName ?? null,
  };
}

// Create: mandatory keys + owner; never prescribingDoctorIds (rules block it on create).
export function encodePatientForCreate(p: Patient): Doc {
  return { ...patientCore(p), ownerType: p.owner.kind, ownerId: p.owner.id };
}

// Update: editable demographics only; owner/prescribers are server-maintained (rules block changes).
export function encodePatientEdits(p: Patient): Doc {
  return patientCore(p);
}

export function encodeForm(f: SignedFormRecord): Doc {
  return {
    template: f.template,
    channel: f.channel,
    signedAt: f.signedAt,
    intro: f.intro,
    clauses: f.clauses,
    answers: f.answers.map((a) => ({ questionId: a.questionID, answer: a.answer, detail: a.detail })),
    signatureImageFileId: f.signatureFileId ?? null,
    pdfFileId: f.pdfFileId ?? null,
  };
}

export function mapInvoice(id: string, data: Doc): Invoice {
  const lines = (Array.isArray(data.lines) ? (data.lines as Doc[]) : []).map((l): InvoiceLine => ({
    authorisationID: str(l.authorisationId),
    dateISO: str(l.dateISO),
    patientName: str(l.patientName),
    feeCents: intValue(l.feeCents),
    gstCents: intValue(l.gstCents),
  }));
  return {
    id,
    doctorID: str(data.doctorId),
    counterpartyID: str(data.counterpartyId),
    counterpartyType: data.counterpartyType === "clinic" ? "clinic" : "nurse",
    periodLabel: str(data.periodLabel),
    lines,
    subtotalCents: intValue(data.subtotalCents),
    gstCents: intValue(data.gstCents),
    totalCents: intValue(data.totalCents),
    authorisationIDs: strArray(data.authorisationIds),
    pdfFileId: typeof data.pdfFileId === "string" ? data.pdfFileId : undefined,
    createdAt: toMillis(data.createdAt),
  };
}

export function mapForm(id: string, patientID: string, data: Doc): SignedFormRecord {
  const answers = (Array.isArray(data.answers) ? (data.answers as Doc[]) : []).map((a): FormAnswer => ({
    questionID: str(a.questionId), answer: a.answer === true, detail: str(a.detail),
  }));
  return {
    id, patientID,
    template: (str(data.template) || "aestheticHistory") as FormTemplateKind,
    channel: (str(data.channel) || "onDevice") as SigningChannel,
    signedAt: toMillis(data.signedAt),
    answers,
    intro: str(data.intro),
    clauses: strArray(data.clauses),
    signatureFileId: typeof data.signatureImageFileId === "string" ? data.signatureImageFileId : undefined,
    pdfFileId: typeof data.pdfFileId === "string" ? data.pdfFileId : undefined,
  };
}

// Field names match iOS LiveBackend.encode(_:)/noteTemplate(id:data:). `ownerId` is also
// in the doc path (users/{ownerID}/noteTemplates/{id}); we store it in the body too for
// iOS wire parity. All writes go through this encoder, so the body field stays populated.
export function encodeNoteTemplate(t: NoteTemplate): Doc {
  return { ownerId: t.ownerID, name: t.name, body: t.body, aftercareCategories: t.aftercareCategories };
}

export function mapNoteTemplate(id: string, data: Doc): NoteTemplate {
  const cats = strArray(data.aftercareCategories)
    .filter((c): c is AftercareCategory => (AFTERCARE_CATEGORIES as readonly string[]).includes(c));
  return { id, ownerID: str(data.ownerId), name: str(data.name), body: str(data.body), aftercareCategories: cats };
}

// Follow-up tasks: ownerID lives in the doc path (users/{ownerID}/followUpTasks/{id}),
// not the body, so mapFollowUpTask takes it as a param.
export function encodeFollowUpTask(t: FollowUpTask): Doc {
  return { patientId: t.patientID, patientName: t.patientName, dueDateISO: t.dueDateISO, status: t.status, sourceNoteId: t.sourceNoteID ?? null };
}

export function mapFollowUpTask(id: string, ownerID: string, data: Doc): FollowUpTask {
  const raw = str(data.status);
  const status: FollowUpStatus = raw === "done" || raw === "ignored" ? raw : "pending";
  return {
    id, ownerID,
    patientID: str(data.patientId),
    patientName: str(data.patientName),
    dueDateISO: str(data.dueDateISO),
    status,
    sourceNoteID: typeof data.sourceNoteId === "string" ? data.sourceNoteId : undefined,
  };
}

// users/{uid} → super-admin inventory row. Tolerant of partial docs (bootstrap-script
// accounts may lack fields the createUser Function always writes); unknown role strings
// are dropped rather than crashing the console.
const isRole = (r: unknown): r is Role =>
  r === "doctor" || r === "nurse" || r === "clinicAdmin" || r === "superAdmin";

export function mapAccount(id: string, data: Doc): AccountRecord {
  const roles = Array.isArray(data.roles) ? data.roles.filter(isRole) : [];
  return {
    id,
    name: str(data.name),
    email: str(data.email),
    roles,
    mustChangePassword: data.mustChangePassword === true,
  };
}

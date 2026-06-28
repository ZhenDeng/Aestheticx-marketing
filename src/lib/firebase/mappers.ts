// Pure Firestore <-> domain mappers. Field names ported verbatim from the iOS
// LiveBackend.swift static decoders/encoders. No Firebase imports here (testable).
import type {
  Appointment, AppointmentType, Authorisation, AuthorisationRequest, DateOfBirth,
  MedicationItem, Note, Patient, PatientOwner, PatientSummary, ProductCategory,
  ProductUnit, RequestStatus, NoteKind, TreatmentMedication,
} from "@/lib/demo/types";

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
    alert: typeof data.alert === "string" ? data.alert : undefined,
    preferredName: typeof data.preferredName === "string" ? data.preferredName : undefined,
  };
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
  };
}

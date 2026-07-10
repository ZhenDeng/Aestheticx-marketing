// Pure domain rules ported from the iOS InMemoryBackend + PatientPermissions + Authorisations.
// Every mutator returns a NEW DemoState (immutable). `now` is passed in for deterministic tests.
import type {
  AccountRecord,
  Appointment,
  AppointmentLead,
  AppointmentStatus,
  AvailabilityWindow,
  Authorisation,
  AuthorisationRequest,
  DateOfBirth,
  DaySchedule,
  DeliveryStatus,
  DemoState,
  DoctorStatus,
  Identity,
  FollowUpSettings,
  FollowUpStatus,
  FollowUpTask,
  MedicationItem,
  Note,
  NoteAttachment,
  NoteTemplate,
  Patient,
  PatientDraft,
  PatientField,
  PatientOwner,
  PatientSummary,
  SignedFormRecord,
  FormAnswer,
  TreatmentAvailability,
  TreatmentBlock,
  TreatmentMedication,
  UserProfile,
  UserProfileEdit,
  CooperationRelationship,
  CounterpartyType,
  RelationshipStatus,
  RelationshipAuditEntry,
  RelationshipAction,
  AuditLogEntry,
  AuditAction,
} from "./types";
import { isoWeekday } from "./calendar";
import { fullName, displayName, identityBadge, emptyDraft } from "./types";
import type { AftercareCategory } from "./aftercare";
import { monthKey } from "./billing";
import { computeInvoice, DEFAULT_SCRIPT_PRICE_CENTS, GST_RATE, type Invoice } from "./invoicing";
import { formTemplate, type FormTemplateKind, type SigningChannel } from "./forms";
import { identityKey } from "./identityPrefs";
import { EMERGENCY_VALIDITY_MONTHS, applyEmergencyAuthorisations, emergencyKindsFor } from "./emergency";
import { cooperatingDoctorsFor, relationshipFor, priceCentsFor, invoiceAppliesFor, cooperationDocId } from "./cooperation";

export const REPEATS_PER_AUTHORISATION = 5;
export const VALIDITY_MONTHS = 6;

export class BackendError extends Error {}

export function emptyState(): DemoState {
  return {
    patients: {},
    requests: {},
    authorisations: {},
    notesByPatient: {},
    appointments: {},
    usages: [],
    formsByPatient: {},
    invoices: [],
    scriptPricing: {},
    noteTemplatesByOwner: {},
    followUpTasksByID: {},
    followUpSettingsByUser: {},
    bookingTokensByUser: {},
    availabilityWindows: {},
    treatmentAvailabilityByOwner: {},
    doctorStatusByID: {},
    externalBusyByOwner: {},
    lastCalledDoctorByUser: {},
    profileByUser: {},
    addressByIdentity: {},
    accountsByID: {},
    emergencyAuthorisationsByID: {},
    cooperationRelationshipsByID: {},
    relationshipAuditByID: {},
    auditLogByID: {},
  };
}

// --- Super-admin account inventory ---

// Sorted for a stable console list; localeCompare with sensitivity:"base" gives a
// case-insensitive order that keeps equal names in insertion order.
export function accountsInventory(state: DemoState): AccountRecord[] {
  return Object.values(state.accountsByID)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

// --- Search ---

export type SearchKind = "name" | "dateOfBirth" | "phone";

export function classifySearch(raw: string): SearchKind {
  const trimmed = raw.trim();
  const digits = [...trimmed].filter((c) => c >= "0" && c <= "9");
  if (trimmed.includes("/") && digits.length > 0) return "dateOfBirth";
  if (digits.length > 0 && [...trimmed].every((c) => (c >= "0" && c <= "9") || c === " " || c === "+")) {
    return "phone";
  }
  return "name";
}

// --- Permissions (port of PatientPermissions) ---

export interface Permissions {
  canView: boolean;
  canEditDetails: boolean;
  canDelete: boolean;
  canMerge: boolean;
  canWriteGeneralNote: boolean;
  canWriteTreatmentNote: boolean;
  canSendForms: boolean;
  canViewBusinessStats: boolean;
  // Separate from canWriteGeneralNote: a non-owner doctor sees general/aftercare notes only
  // when they authored them (spec: 2026-07-06 treatment/general note access rules, rule 3);
  // this flag means "view ALL general/aftercare notes on the file". Super admin keeps it
  // despite never writing.
  canViewGeneralNotes: boolean;
  // Treatment notes are visible to the record nurse, prescribing doctor, clinic admin and
  // super admin only (spec: 2026-07-06 rule 2) — narrower than plain canView.
  canViewTreatmentNotes: boolean;
}

function perms(p: Partial<Permissions>): Permissions {
  return {
    canView: false,
    canEditDetails: false,
    canDelete: false,
    canMerge: false,
    canWriteGeneralNote: false,
    canWriteTreatmentNote: false,
    canSendForms: false,
    canViewBusinessStats: false,
    canViewGeneralNotes: false,
    canViewTreatmentNotes: false,
    ...p,
  };
}

function contextClinicID(identity: Identity): string | null {
  return identity.context.kind === "clinic" ? identity.context.clinic.id : null;
}

// Grants for a prescribing doctor viewing a patient NOT under their own name (spec:
// 2026-07-06 treatment/general note access rules): they read + write treatment notes (rule
// 1/2) and may write general notes (rule 3), but see general/aftercare notes only when they
// authored them — canViewGeneralNotes stays false and the note filter falls back to authorID.
const PRESCRIBING_DOCTOR = perms({
  canView: true,
  canWriteTreatmentNote: true,
  canViewTreatmentNotes: true,
  canWriteGeneralNote: true,
});

// A doctor with an open (pending/needsEdit) request gets READ-ONLY access to the file while
// they review — demographics, allergies/meds, TREATMENT notes, history and forms, but no
// writes, edits, forms or deletes until they approve (spec 2026-07-07 reviewer-file-access).
// General/aftercare notes stay hidden (feedback 2026-07-07 [1a]): they may carry non-clinical
// remarks irrelevant to the authorisation decision, so canViewGeneralNotes stays false and the
// note filter falls back to own-authored only. Prescriber access is richer and wins.
const REVIEWER = perms({
  canView: true,
  canViewTreatmentNotes: true,
});

export function patientPermissions(identity: Identity, patient: Patient): Permissions {
  if (identity.role === "superAdmin") {
    return perms({ canView: true, canViewBusinessStats: true, canViewGeneralNotes: true, canViewTreatmentNotes: true });
  }
  const userID = identity.user.id;
  const isPrescriber = identity.role === "doctor" && patient.prescribingDoctorIDs.includes(userID);
  const isReviewer = identity.role === "doctor" && (patient.openReviewerDoctorIDs ?? []).includes(userID);
  // Fallback for a doctor who is neither owner nor prescriber: read-only if reviewing, else none.
  const doctorFallback = isReviewer ? REVIEWER : perms({});

  switch (patient.owner.kind) {
    case "doctor":
      if (identity.role === "doctor" && identity.context.kind === "independent" && userID === patient.owner.id) {
        // The doctor is the prescribing doctor of their own private patient — full access.
        return perms({ canView: true, canEditDetails: true, canDelete: true, canWriteGeneralNote: true, canWriteTreatmentNote: true, canSendForms: true, canViewGeneralNotes: true, canViewTreatmentNotes: true });
      }
      if (isPrescriber) return PRESCRIBING_DOCTOR;
      return doctorFallback;
    case "nurse":
      if (identity.role === "nurse" && identity.context.kind === "independent" && userID === patient.owner.id) {
        return perms({ canView: true, canEditDetails: true, canDelete: true, canWriteGeneralNote: true, canWriteTreatmentNote: true, canSendForms: true, canViewGeneralNotes: true, canViewTreatmentNotes: true });
      }
      if (isPrescriber) return PRESCRIBING_DOCTOR;
      return doctorFallback;
    case "clinic":
      if (contextClinicID(identity) === patient.owner.id) {
        switch (identity.role) {
          case "clinicAdmin":
            // Views every note (incl. treatment, rule 2) but writes general notes only.
            return perms({ canView: true, canEditDetails: true, canDelete: true, canMerge: true, canWriteGeneralNote: true, canSendForms: true, canViewBusinessStats: true, canViewGeneralNotes: true, canViewTreatmentNotes: true });
          case "nurse":
            return perms({ canView: true, canEditDetails: true, canWriteGeneralNote: true, canWriteTreatmentNote: true, canSendForms: true, canViewGeneralNotes: true, canViewTreatmentNotes: true });
          case "doctor":
            // Owner decision 2026-07-10: a clinic-employee doctor sees the clinic patient's
            // treatment record even without a prescribing relationship (clinical safety), but
            // WRITING treatment notes stays tied to prescribing, and general/aftercare notes
            // stay hidden except their own (the prescriber/reviewer note pattern).
            if (isPrescriber) return perms({ ...PRESCRIBING_DOCTOR, canEditDetails: true, canSendForms: true });
            return perms({ canView: true, canEditDetails: true, canWriteGeneralNote: true, canSendForms: true, canViewTreatmentNotes: true });
          default:
            return perms({ canView: true, canViewBusinessStats: true, canViewGeneralNotes: true, canViewTreatmentNotes: true });
        }
      }
      if (isPrescriber) return PRESCRIBING_DOCTOR;
      return doctorFallback;
  }
}

// --- Doctor patient-list split (port of DoctorPatientList + PatientListView.split) ---

// Splits the doctor's visible patients into the ones they own (owner == doctor(doctorID))
// and the rest, preserving input order (port of DoctorPatientList.partition).
export function partitionPatients(patients: Patient[], doctorID: string): { own: Patient[]; others: Patient[] } {
  const own: Patient[] = [];
  const others: Patient[] = [];
  for (const p of patients) {
    if (p.owner.kind === "doctor" && p.owner.id === doctorID) own.push(p);
    else others.push(p);
  }
  return { own, others };
}

// Under a doctor account the list is split into the doctor's own patients and everything
// else (grouped on a subpage). Other roles keep one combined list (PatientListView.split).
export function splitPatients(patients: Patient[], identity: Identity): { own: Patient[]; others: Patient[] } {
  if (identity.role !== "doctor") return { own: patients, others: [] };
  return partitionPatients(patients, identity.user.id);
}

// Groups the "other" patients by a display label (clinic or nurse name), returning groups
// sorted by key with each bucket's input order preserved (port of DoctorPatientList.grouped;
// numeric-aware sort matches Swift's localizedStandardCompare).
export function groupPatientsByOwner(
  others: Patient[], label: (owner: PatientOwner) => string,
): { key: string; patients: Patient[] }[] {
  const buckets = new Map<string, Patient[]>();
  for (const p of others) {
    const key = label(p.owner);
    buckets.set(key, [...(buckets.get(key) ?? []), p]);
  }
  return [...buckets.keys()]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((key) => ({ key, patients: buckets.get(key) ?? [] }));
}

export function visiblePatients(state: DemoState, identity: Identity): Patient[] {
  return Object.values(state.patients)
    .filter((p) => patientPermissions(identity, p).canView)
    .sort((a, b) => (a.lastName + a.givenName).localeCompare(b.lastName + b.givenName));
}

export function searchPatients(state: DemoState, query: string, identity: Identity): Patient[] {
  const scope = visiblePatients(state, identity);
  const trimmed = query.trim();
  if (!trimmed) return scope;

  switch (classifySearch(trimmed)) {
    case "name": {
      const needle = trimmed.toLowerCase();
      return scope.filter((p) => fullName(p).toLowerCase().includes(needle));
    }
    case "phone": {
      const digits = [...trimmed].filter((c) => c >= "0" && c <= "9").join("");
      return scope.filter((p) => [...p.phone].filter((c) => c >= "0" && c <= "9").join("") === digits);
    }
    case "dateOfBirth": {
      const parts = trimmed.split("/").map((s) => parseInt(s, 10)).filter((n) => !Number.isNaN(n));
      if (parts.length !== 3) return [];
      return scope.filter(
        (p) => p.dateOfBirth.day === parts[0] && p.dateOfBirth.month === parts[1] && p.dateOfBirth.year === parts[2],
      );
    }
  }
}

// --- Authorisations ---

function patientSummary(p: Patient): PatientSummary {
  return {
    fullName: fullName(p),
    dateOfBirth: p.dateOfBirth,
    allergies: p.allergies,
    currentMedications: p.currentMedications,
    alert: p.alert,
  };
}

function addMonthsUTC(epochMs: number, months: number): number {
  const d = new Date(epochMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
}

export function isAuthActive(a: Authorisation, now: number): boolean {
  return a.repeatsRemaining > 0 && now < a.expiresAt;
}

export function activeAuthorisations(state: DemoState, patientID: string, now: number): Authorisation[] {
  return Object.values(state.authorisations)
    .filter((a) => a.patientID === patientID && isAuthActive(a, now))
    .sort((a, b) => a.expiresAt - b.expiresAt);
}

function makeID(prefix: string): string {
  // Collision-safe across sessions, tabs, and repeat provider mounts.
  return `${prefix}-${crypto.randomUUID()}`;
}

export interface SubmitRequestInput {
  patientID: string;
  doctorID: string;
  items: MedicationItem[];
  identity: Identity;
}

// Recompute a patient's open-reviewer doctors from the current request set — the demo
// mirror of the backend's onAuthRequestWritten trigger. A doctor is a reviewer iff they
// hold a pending/needsEdit request for the patient (spec 2026-07-07 reviewer-file-access).
function syncReviewerAccess(state: DemoState, patientID: string): DemoState {
  const patient = state.patients[patientID];
  if (!patient) return state;
  const reviewers = [...new Set(
    Object.values(state.requests)
      .filter((r) => r.patientID === patientID && (r.status === "pending" || r.status === "needsEdit"))
      .map((r) => r.doctorID),
  )];
  return { ...state, patients: { ...state.patients, [patientID]: { ...patient, openReviewerDoctorIDs: reviewers } } };
}

export function submitRequest(
  state: DemoState,
  input: SubmitRequestInput,
  now: number,
): { state: DemoState; request: AuthorisationRequest } {
  const patient = state.patients[input.patientID];
  if (!patient) throw new BackendError("notFound");
  if (input.identity.role !== "nurse" || !patientPermissions(input.identity, patient).canView) {
    throw new BackendError("notPermitted");
  }
  const request: AuthorisationRequest = {
    id: makeID("req"),
    patientID: input.patientID,
    nurse: input.identity.user,
    doctorID: input.doctorID,
    context: input.identity.context,
    items: input.items,
    status: "pending",
    createdAt: now,
    patientSummary: patientSummary(patient),
  };
  const next = syncReviewerAccess({ ...state, requests: { ...state.requests, [request.id]: request } }, input.patientID);
  return { state: next, request };
}

export function pendingRequestsForDoctor(state: DemoState, doctorID: string): AuthorisationRequest[] {
  return Object.values(state.requests)
    .filter((r) => r.doctorID === doctorID && r.status === "pending")
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function openRequestsForPatient(state: DemoState, patientID: string, nurseID: string): AuthorisationRequest[] {
  return Object.values(state.requests)
    .filter((r) => r.patientID === patientID && r.nurse.id === nurseID && (r.status === "pending" || r.status === "needsEdit"))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function approveRequest(
  state: DemoState,
  requestID: string,
  identity: Identity,
  now: number,
  options: { generateEmergency?: boolean; recordAudit?: boolean } = {},
): { state: DemoState; granted: Authorisation[] } {
  const request = state.requests[requestID];
  if (!request) throw new BackendError("notFound");
  if (identity.role !== "doctor" || identity.user.id !== request.doctorID || request.status !== "pending") {
    throw new BackendError("notPermitted");
  }
  const expiry = addMonthsUTC(now, VALIDITY_MONTHS);
  const clinicID = request.context.kind === "clinic" ? request.context.clinic.id : null;
  const granted: Authorisation[] = request.items.map((item, index) => ({
    id: `${request.id}-${index}`,
    requestID: request.id,
    patientID: request.patientID,
    doctorID: request.doctorID,
    nurseID: request.nurse.id,
    clinicID,
    medication: item,
    repeatsRemaining: REPEATS_PER_AUTHORISATION,
    expiresAt: expiry,
    createdAt: now,
    invoiced: false,
  }));

  const authorisations = { ...state.authorisations };
  for (const a of granted) authorisations[a.id] = a;

  // Spec 2026-07-08 emergency-authorisations: every approval creates/refreshes an Adrenaline
  // standing authorisation for (patient, prescribing doctor); an HA filler adds Hyaluronidase.
  // Skipped in live mode (`generateEmergency: false`): there the deployed approveRequest Cloud
  // Function is the writer (companion backend PR) and hydrate reads the persisted records, so the
  // client must NOT optimistically fabricate one that would silently vanish on the next hydrate.
  const generateEmergency = options.generateEmergency ?? true;
  const emergencyAuthorisationsByID = generateEmergency
    ? applyEmergencyAuthorisations(state.emergencyAuthorisationsByID, {
        patientID: request.patientID,
        doctorID: request.doctorID,
        doctorName: identity.user.name, // the approver is the addressed doctor (asserted above)
        kinds: emergencyKindsFor(request.items),
        sourceAuthIDs: granted.map((a) => a.id),
        now,
        expiresAt: addMonthsUTC(now, EMERGENCY_VALIDITY_MONTHS),
      })
    : state.emergencyAuthorisationsByID;

  const patient = state.patients[request.patientID];
  const patients = { ...state.patients };
  if (patient && !patient.prescribingDoctorIDs.includes(identity.user.id)) {
    patients[patient.id] = { ...patient, prescribingDoctorIDs: [...patient.prescribingDoctorIDs, identity.user.id] };
  }

  const approvedState = syncReviewerAccess(
    {
      ...state,
      patients,
      authorisations,
      emergencyAuthorisationsByID,
      requests: { ...state.requests, [requestID]: { ...request, status: "approved" } },
    },
    request.patientID,
  );

  // Demo audit write (constitution §21) — representative parity with the backend's approveRequest
  // Cloud Function, which writes the durable `request_approved` entry in live. Gated by
  // `recordAudit: !live` (like generateEmergency) so the optimistic client never fabricates a
  // live entry that would vanish on the next hydrate; the server + hydrate own it there.
  const recordAudit = options.recordAudit ?? true;
  if (!recordAudit) return { state: approvedState, granted };
  const patientName = patient ? fullName(patient) : (request.patientSummary?.fullName ?? "patient");
  const kinds = emergencyKindsFor(request.items);
  const audited = appendAuditEntry(
    approvedState,
    {
      actor: identity,
      action: "request_approved",
      targetType: "request",
      targetID: requestID,
      summary: `approved for ${patientName}${kinds.length ? ` · emergency: ${kinds.join(", ")}` : ""}`,
    },
    now,
  );
  return { state: audited, granted };
}

// `auditNow` (epoch ms) opts into a demo audit write (constitution §21): when provided a
// `request_edit_requested` entry is appended with that timestamp; omit it to skip the write.
// The store passes the session `now` in demo and `undefined` in live, where the requireEdit
// Cloud Function writes the durable entry and hydrate reads it (no optimistic client fabrication).
export function requireEdit(state: DemoState, requestID: string, identity: Identity, auditNow?: number): DemoState {
  const request = state.requests[requestID];
  if (!request) throw new BackendError("notFound");
  // Only a pending request may be returned for edit. Guarding the status stops a doctor from
  // flipping their own terminal (withdrawn/approved) request back to needsEdit — an open
  // status that would re-grant reviewer file access and defeat withdraw + the TTL sweep
  // (spec 2026-07-07 revocation hardening). Mirrors the live requireEdit Cloud Function.
  if (identity.role !== "doctor" || identity.user.id !== request.doctorID || request.status !== "pending") {
    throw new BackendError("notPermitted");
  }
  const next: DemoState = { ...state, requests: { ...state.requests, [requestID]: { ...request, status: "needsEdit" } } };
  if (auditNow === undefined) return next;
  const patient = state.patients[request.patientID];
  const patientName = patient ? fullName(patient) : (request.patientSummary?.fullName ?? "patient");
  return appendAuditEntry(
    next,
    { actor: identity, action: "request_edit_requested", targetType: "request", targetID: requestID, summary: `returned for edit · ${patientName}` },
    auditNow,
  );
}

export interface ResubmitRequestInput {
  requestID: string;
  items: MedicationItem[];
  identity: Identity;
}

// The nurse edits a doctor-returned request and sends it back for review (port of iOS
// InMemoryBackend.resubmitRequest). Only the raising nurse may resubmit, only while the
// request is in needsEdit, and only the items change — the addressed doctor is fixed
// (Firestore rules allow the client update to touch items + status only).
export function resubmitRequest(state: DemoState, input: ResubmitRequestInput): DemoState {
  const request = state.requests[input.requestID];
  if (!request) throw new BackendError("notFound");
  if (
    input.identity.role !== "nurse" ||
    request.nurse.id !== input.identity.user.id ||
    request.status !== "needsEdit"
  ) {
    throw new BackendError("notPermitted");
  }
  return {
    ...state,
    requests: {
      ...state.requests,
      [input.requestID]: { ...request, items: input.items, status: "pending" },
    },
  };
}

// The nurse who raised a request (or a clinic admin over the request's clinic) withdraws it
// while it is still open (pending/needsEdit), moving it to the terminal `withdrawn` status
// (spec 2026-07-07 revocation hardening). Because `withdrawn` leaves the open set,
// syncReviewerAccess drops the addressed doctor from openReviewerDoctorIDs — revoking the
// read-only file access a never-approved request would otherwise grant forever. Mirrors the
// Firestore rule that permits exactly this transition (status only) for the same principals.
export function withdrawRequest(state: DemoState, requestID: string, identity: Identity): DemoState {
  const request = state.requests[requestID];
  if (!request) throw new BackendError("notFound");
  const isOwner = identity.role === "nurse" && request.nurse.id === identity.user.id;
  const requestClinicID = request.context.kind === "clinic" ? request.context.clinic.id : null;
  const isClinicAdmin =
    identity.role === "clinicAdmin" && requestClinicID !== null && contextClinicID(identity) === requestClinicID;
  const isOpen = request.status === "pending" || request.status === "needsEdit";
  if ((!isOwner && !isClinicAdmin) || !isOpen) throw new BackendError("notPermitted");
  return syncReviewerAccess(
    { ...state, requests: { ...state.requests, [requestID]: { ...request, status: "withdrawn" } } },
    request.patientID,
  );
}

// --- Notes ---

function canUseAuthorisation(a: Authorisation, identity: Identity): boolean {
  if (a.clinicID) return contextClinicID(identity) === a.clinicID;
  return identity.context.kind === "independent" && identity.user.id === a.nurseID;
}

export function notesForPatient(state: DemoState, patientID: string): Note[] {
  return [...(state.notesByPatient[patientID] ?? [])].sort((a, b) => b.createdAt - a.createdAt);
}

// The note stream as one identity sees it (spec: 2026-07-06 treatment/general note access
// rules): treatment notes need canViewTreatmentNotes (rule 2); general/aftercare notes need
// canViewGeneralNotes, else fall back to own-authored only (rule 3).
export function visibleNotesForPatient(state: DemoState, patientID: string, identity: Identity): Note[] {
  const patient = state.patients[patientID];
  if (!patient) return [];
  const permissions = patientPermissions(identity, patient);
  if (!permissions.canView) return [];
  const me = identity.user.id;
  return notesForPatient(state, patientID).filter((n) =>
    n.kind === "treatment"
      ? permissions.canViewTreatmentNotes
      : permissions.canViewGeneralNotes || n.authorID === me,
  );
}

// List-row text: the title if present, else the body's first line + "…".
export function notePreview(note: Note): string {
  if (note.title.trim()) return note.title;
  const firstLine = note.body.split("\n")[0] ?? "";
  return firstLine ? `${firstLine}…` : "(empty note)";
}

// --- Note templates (clinician-owned, private) ---

export function noteTemplatesForOwner(state: DemoState, ownerID: string): NoteTemplate[] {
  return [...(state.noteTemplatesByOwner[ownerID] ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

export function saveNoteTemplate(state: DemoState, template: NoteTemplate, identity: Identity): DemoState {
  // Defence-in-depth: a user may only write their own templates (mirrors the Firestore
  // rule uid()==userId). The management UI always builds templates with ownerID = me.user.id,
  // so this guard is unreachable in normal use — it guards against a future bad call-site.
  if (template.ownerID !== identity.user.id) throw new BackendError("notPermitted");
  const list = state.noteTemplatesByOwner[template.ownerID] ?? [];
  const next = [...list.filter((t) => t.id !== template.id), template]; // upsert by id
  return { ...state, noteTemplatesByOwner: { ...state.noteTemplatesByOwner, [template.ownerID]: next } };
}

export function deleteNoteTemplate(state: DemoState, id: string, identity: Identity): DemoState {
  const ownerID = identity.user.id; // scoped to the caller — never another user's list
  const list = state.noteTemplatesByOwner[ownerID] ?? [];
  return { ...state, noteTemplatesByOwner: { ...state.noteTemplatesByOwner, [ownerID]: list.filter((t) => t.id !== id) } };
}

// --- Clinician follow-up reminders ---

const DAY_MS = 86_400_000;

/**
 * Epoch ms -> "yyyy-MM-dd" in **UTC** (matches iOS followUpISODay). The interval
 * arithmetic in saveTreatmentNote adds whole days in ms, which is exact in UTC.
 * Keep this on `toISOString()` — switching to a local-timezone formatter would make
 * due-date math inconsistent across DST/offset boundaries.
 */
export function isoDay(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

// UTC minute-of-day, floored to the nearest 10 — must share isoDay's UTC convention (local
// hours/minutes would disagree with isoDay's UTC date near a day boundary).
export function nowFlooredTo10(epochMs: number): number {
  const d = new Date(epochMs);
  return Math.floor((d.getUTCHours() * 60 + d.getUTCMinutes()) / 10) * 10;
}

// Whether a dateISO+minute slot is already behind "now", in the same UTC frame as
// isoDay/nowFlooredTo10. The current floored slot counts as not-past so a "now" request
// always passes. UI guard only — neither the demo backend nor the deployed adHocAuthTx
// rejects past times.
export function isPastSlot(dateISO: string, minute: number, nowMs: number): boolean {
  const today = isoDay(nowMs);
  if (dateISO !== today) return dateISO < today;
  return minute < nowFlooredTo10(nowMs);
}

// --- Most-recently-called doctor (iOS recordCalledDoctor/mostRecentlyCalledDoctor parity) ---

/** Recorded whenever the user starts a consult call; latest call wins. */
export function recordCalledDoctor(state: DemoState, userID: string, doctorID: string): DemoState {
  return { ...state, lastCalledDoctorByUser: { ...state.lastCalledDoctorByUser, [userID]: doctorID } };
}

export function mostRecentlyCalledDoctor(state: DemoState, userID: string): string | null {
  return state.lastCalledDoctorByUser[userID] ?? null;
}

/**
 * The doctor a booking picker should preselect: the most-recently-called doctor when they
 * are actually in the pickable list (iOS parity — a recent doctor who is no longer
 * available must not be forced onto the picker), else the first doctor, else null.
 */
export function defaultDoctorID(doctors: { doctorID: string }[], recentDoctorID: string | null): string | null {
  if (recentDoctorID && doctors.some((d) => d.doctorID === recentDoctorID)) return recentDoctorID;
  return doctors[0]?.doctorID ?? null;
}

export function followUpSettingsForUser(state: DemoState, userID: string): FollowUpSettings {
  return state.followUpSettingsByUser[userID] ?? { enabled: false, intervalDays: 14 };
}

export function setFollowUpSettings(state: DemoState, settings: FollowUpSettings, identity: Identity): DemoState {
  return { ...state, followUpSettingsByUser: { ...state.followUpSettingsByUser, [identity.user.id]: settings } };
}

// Pending tasks due on or before dateISO, oldest first (overdue keep showing until actioned).
export function followUpTasksForOwnerOn(state: DemoState, ownerID: string, dateISO: string): FollowUpTask[] {
  return Object.values(state.followUpTasksByID)
    .filter((t) => t.ownerID === ownerID && t.status === "pending" && t.dueDateISO <= dateISO)
    .sort((a, b) => a.dueDateISO.localeCompare(b.dueDateISO));
}

export function setFollowUpStatus(state: DemoState, id: string, status: FollowUpStatus, identity: Identity): DemoState {
  const task = state.followUpTasksByID[id];
  if (!task) throw new BackendError("notFound");
  if (task.ownerID !== identity.user.id) throw new BackendError("notPermitted");
  return { ...state, followUpTasksByID: { ...state.followUpTasksByID, [id]: { ...task, status } } };
}

// --- Patient self-booking (link/QR + pending-bookings inbox) ---

// Owner of a calendar/appointment scope: the active clinic in a clinic context, else the user.
// Shared by booking (bookedByID), the calendar viewer, and mutation-ownership gates.
export function appointmentOwnerScope(identity: Identity): string {
  return identity.context.kind === "clinic" ? identity.context.clinic.id : identity.user.id;
}

// Whether the viewer (at `ownerScope`) may reschedule/resize/mutate the appointment: only its
// owner can, and only while it is still live. A booking nurse viewing the doctor's auth slot on
// their own calendar sees it read-only (a.ownerID is the doctor, not the nurse's scope).
export function canRescheduleAppointment(a: Appointment, ownerScope: string): boolean {
  return a.ownerID === ownerScope && (a.status === "awaitingConfirmation" || a.status === "confirmed");
}

export function bookingTokenForUser(state: DemoState, userID: string): string | undefined {
  return state.bookingTokensByUser[userID];
}

// Stable per-user token, minted once (matches iOS bookingLink(forUser:)).
export function mintBookingToken(state: DemoState, identity: Identity): { state: DemoState; token: string } {
  const existing = state.bookingTokensByUser[identity.user.id];
  if (existing) return { state, token: existing };
  const token = makeID("bk");
  return { state: { ...state, bookingTokensByUser: { ...state.bookingTokensByUser, [identity.user.id]: token } }, token };
}

// Awaiting-confirmation bookings on the owner's calendar, all dates, earliest first.
export function pendingBookings(state: DemoState, ownerID: string): Appointment[] {
  return Object.values(state.appointments)
    .filter((a) => a.ownerID === ownerID && a.status === "awaitingConfirmation")
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO) || a.startMinute - b.startMinute);
}

export function confirmAppointment(state: DemoState, id: string, identity: Identity): DemoState {
  const appt = state.appointments[id];
  if (!appt) throw new BackendError("notFound");
  if (appt.ownerID !== appointmentOwnerScope(identity)) throw new BackendError("notPermitted");
  if (appt.status !== "awaitingConfirmation") throw new BackendError("notActive"); // only pending bookings confirm
  return { ...state, appointments: { ...state.appointments, [id]: { ...appt, status: "confirmed" } } };
}

export interface BookTreatmentInput {
  dateISO: string;
  startMinute: number;
  durationMinutes: number;
  patientID?: string;
  patientName?: string;
  lead?: AppointmentLead;
  note?: string;
  identity: Identity;
}

// A booking's patient arm: an existing file XOR a new-patient lead carrying at least a name.
// `allowNeither` admits treatment block time (auth bookings always need one or the other) —
// matching the deployed callables' (!patientId && !lead) guard.
function validateBookingPatient(input: { patientID?: string; lead?: AppointmentLead }, allowNeither: boolean): void {
  if (input.patientID && input.lead) throw new BackendError("validationFailed");
  if (input.lead && !input.lead.givenName.trim() && !input.lead.lastName.trim()) throw new BackendError("validationFailed");
  if (!allowNeither && !input.patientID && !input.lead) throw new BackendError("validationFailed");
}

export function bookTreatmentAppointment(state: DemoState, input: BookTreatmentInput): { state: DemoState; appt: Appointment } {
  validateBookingPatient(input, true); // neither = block time
  const owner = appointmentOwnerScope(input.identity);
  const end = input.startMinute + input.durationMinutes;
  if (!isTimeAvailableForTreatment(treatmentAvailabilityForOwner(state, owner), input.dateISO, input.startMinute, end)) {
    throw new BackendError("unavailable");
  }
  const appt: Appointment = {
    id: makeID("appt"),
    type: "treatment",
    ownerID: owner,
    dateISO: input.dateISO,
    startMinute: input.startMinute,
    endMinute: input.startMinute + input.durationMinutes,
    status: "confirmed", // a clinician's own booking lands confirmed
    patientID: input.patientID,
    patientName: input.patientName,
    lead: input.lead,
    appointmentNote: input.note || undefined,
  };
  return { state: { ...state, appointments: { ...state.appointments, [appt.id]: appt } }, appt };
}

export function rescheduleAppointment(
  state: DemoState, id: string, dateISO: string, startMinute: number, durationMinutes: number, identity: Identity,
): DemoState {
  const appt = state.appointments[id];
  if (!appt) throw new BackendError("notFound");
  if (appt.ownerID !== appointmentOwnerScope(identity)) throw new BackendError("notPermitted");
  if (appt.status !== "awaitingConfirmation" && appt.status !== "confirmed") throw new BackendError("notActive"); // terminal appts aren't reschedulable
  if (appt.type === "treatment") {
    const config = treatmentAvailabilityForOwner(state, appt.ownerID);
    if (!isTimeAvailableForTreatment(config, dateISO, startMinute, startMinute + durationMinutes)) {
      throw new BackendError("unavailable");
    }
  }
  const moved = { ...appt, dateISO, startMinute, endMinute: startMinute + durationMinutes };
  return { ...state, appointments: { ...state.appointments, [id]: moved } };
}

// completed | noShow | cancelled — only awaiting/confirmed appointments may be marked.
export function markAppointment(
  state: DemoState, id: string, status: Extract<AppointmentStatus, "completed" | "noShow" | "cancelled">, identity: Identity,
): DemoState {
  const appt = state.appointments[id];
  if (!appt) throw new BackendError("notFound");
  if (appt.ownerID !== appointmentOwnerScope(identity)) throw new BackendError("notPermitted");
  if (appt.status !== "awaitingConfirmation" && appt.status !== "confirmed") throw new BackendError("notActive");
  return { ...state, appointments: { ...state.appointments, [id]: { ...appt, status } } };
}

export function appointmentsForOwnerOnDay(state: DemoState, ownerID: string, dateISO: string): Appointment[] {
  return Object.values(state.appointments)
    .filter((a) => (a.ownerID === ownerID || a.bookedByID === ownerID) && a.dateISO === dateISO && a.status !== "cancelled")
    .sort((a, b) => a.startMinute - b.startMinute);
}

// ── Authorisation availability slots ────────────────────────────────────────
export const SLOT_MINUTES = 10;

// Bookable 10-minute start minutes derived from a window; a trailing partial is dropped.
export function slotsForWindow(w: AvailabilityWindow): number[] {
  const out: number[] = [];
  for (let s = w.startMinute; s + SLOT_MINUTES <= w.endMinute; s += SLOT_MINUTES) out.push(s);
  return out;
}

export interface PublishAvailabilityInput { doctorID: string; dateISO: string; startMinute: number; endMinute: number; }

// A doctor publishes their own availability window (denormalising their name onto it).
export function publishAvailability(
  state: DemoState, input: PublishAvailabilityInput, identity: Identity,
): { state: DemoState; window: AvailabilityWindow } {
  if (identity.role !== "doctor" || input.doctorID !== identity.user.id) throw new BackendError("notPermitted");
  if (input.endMinute <= input.startMinute) throw new BackendError("validationFailed");
  const window: AvailabilityWindow = {
    // Match the backend slotPublications doc id ({doctorId}_{dateISO}_{startMinute}) so an
    // optimistic local window and its hydrated server copy share one key (no ghost duplicate),
    // and re-publishing the same window is idempotent.
    id: `${input.doctorID}_${input.dateISO}_${input.startMinute}`,
    doctorID: input.doctorID, doctorName: identity.user.name,
    dateISO: input.dateISO, startMinute: input.startMinute, endMinute: input.endMinute,
  };
  return { state: { ...state, availabilityWindows: { ...state.availabilityWindows, [window.id]: window } }, window };
}

export function availabilityWindowsForDoctor(state: DemoState, doctorID: string): AvailabilityWindow[] {
  return Object.values(state.availabilityWindows)
    .filter((w) => w.doctorID === doctorID)
    .sort((a, b) => (a.dateISO === b.dateISO ? a.startMinute - b.startMinute : a.dateISO < b.dateISO ? -1 : 1));
}

// Distinct doctors who have published any availability (for the nurse booking picker).
export function doctorsWithAvailability(state: DemoState): {
  doctorID: string; doctorName: string; hasSlots: boolean; online: boolean; alwaysAcceptAuth: boolean;
}[] {
  const names = new Map<string, string>();
  const slotDoctorIDs = new Set<string>();
  for (const w of Object.values(state.availabilityWindows)) {
    if (!names.has(w.doctorID)) names.set(w.doctorID, w.doctorName);
    slotDoctorIDs.add(w.doctorID);
  }
  const statusDoctorIDs = Object.entries(state.doctorStatusByID)
    .filter(([, s]) => s.online || s.alwaysAcceptAuth)
    .map(([id]) => id);
  for (const id of statusDoctorIDs) if (!names.has(id)) names.set(id, "");
  const allIDs = new Set([...slotDoctorIDs, ...statusDoctorIDs]);
  return [...allIDs].map((doctorID) => {
    const status = doctorStatusForUser(state, doctorID);
    return {
      doctorID, doctorName: names.get(doctorID) ?? "",
      hasSlots: slotDoctorIDs.has(doctorID), online: status.online, alwaysAcceptAuth: status.alwaysAcceptAuth,
    };
  });
}

// A slot is taken when a non-cancelled authSlot appointment of that doctor sits on it.
export function isSlotTaken(state: DemoState, doctorID: string, dateISO: string, startMinute: number): boolean {
  return Object.values(state.appointments).some(
    (a) => a.type === "authSlot" && a.ownerID === doctorID && a.dateISO === dateISO && a.startMinute === startMinute && a.status !== "cancelled",
  );
}

// Spec (double-booking rules): two authorisation appointments on the same doctor must not
// overlap — half-open intervals, so touching is allowed; treatment appointments never block.
// Mirrors the deployed assertNoAuthOverlapTx (AestheticX#49); subsumes isSlotTaken's exact
// match for booking (isSlotTaken stays for the open-slot display grid).
export function hasAuthOverlap(state: DemoState, doctorID: string, dateISO: string, startMinute: number, endMinute: number): boolean {
  return Object.values(state.appointments).some(
    (a) => a.type === "authSlot" && a.ownerID === doctorID && a.dateISO === dateISO && a.status !== "cancelled"
      && startMinute < a.endMinute && a.startMinute < endMinute,
  );
}

export function openSlotsForDoctorOnDay(state: DemoState, doctorID: string, dateISO: string): number[] {
  const open = new Set<number>();
  for (const w of Object.values(state.availabilityWindows)) {
    if (w.doctorID !== doctorID || w.dateISO !== dateISO) continue;
    for (const s of slotsForWindow(w)) if (!isSlotTaken(state, doctorID, dateISO, s)) open.add(s);
  }
  return [...open].sort((a, b) => a - b);
}

function slotInAnyWindow(state: DemoState, doctorID: string, dateISO: string, startMinute: number): boolean {
  // O(1) per window: on the slot grid and a full 10 minutes inside [start, end).
  return Object.values(state.availabilityWindows).some(
    (w) => w.doctorID === doctorID && w.dateISO === dateISO &&
      startMinute >= w.startMinute && startMinute + SLOT_MINUTES <= w.endMinute &&
      (startMinute - w.startMinute) % SLOT_MINUTES === 0,
  );
}

export interface BookAuthSlotInput {
  doctorID: string; dateISO: string; startMinute: number;
  patientID?: string; patientName?: string; lead?: AppointmentLead; identity: Identity;
}

// Book a published 10-minute slot for an existing patient or a new-patient lead. The slot
// must belong to a window and be open (no double-book).
export function bookAuthSlot(state: DemoState, input: BookAuthSlotInput): { state: DemoState; appt: Appointment } {
  validateBookingPatient(input, false);
  if (!slotInAnyWindow(state, input.doctorID, input.dateISO, input.startMinute)) throw new BackendError("notActive");
  // Overlap, not just exact-slot: an off-grid ad-hoc appointment also blocks (deployed parity).
  if (hasAuthOverlap(state, input.doctorID, input.dateISO, input.startMinute, input.startMinute + SLOT_MINUTES)) throw new BackendError("slotTaken");
  const appt: Appointment = {
    id: makeID("appt"), type: "authSlot", ownerID: input.doctorID, bookedByID: appointmentOwnerScope(input.identity),
    dateISO: input.dateISO,
    startMinute: input.startMinute, endMinute: input.startMinute + SLOT_MINUTES, status: "confirmed",
    patientID: input.patientID, patientName: input.patientName, lead: input.lead,
    appointmentNote: `Auth request · ${input.identity.user.name}`,
  };
  return { state: { ...state, appointments: { ...state.appointments, [appt.id]: appt } }, appt };
}

export interface RequestAdHocAuthInput {
  doctorID: string; dateISO: string; atMinute: number;
  patientID?: string; patientName?: string; lead?: AppointmentLead; identity: Identity;
}

// Ad-hoc (no published slot) request to an online/always-accepting doctor, for an existing
// patient or a new-patient lead. Never gated by treatment hours or published slots, but IS
// subject to the auth-overlap rule — matching the deployed adHocAuthTx since AestheticX#49.
// Mirrors bookAuthSlot's appointment shape (10-minute, confirmed).
export function requestAdHocAuth(state: DemoState, input: RequestAdHocAuthInput): { state: DemoState; appt: Appointment } {
  validateBookingPatient(input, false);
  const status = doctorStatusForUser(state, input.doctorID);
  if (!status.online && !status.alwaysAcceptAuth) throw new BackendError("notAccepting");
  if (hasAuthOverlap(state, input.doctorID, input.dateISO, input.atMinute, input.atMinute + SLOT_MINUTES)) throw new BackendError("slotTaken");
  const appt: Appointment = {
    id: makeID("appt"), type: "authSlot", ownerID: input.doctorID, bookedByID: appointmentOwnerScope(input.identity),
    dateISO: input.dateISO,
    startMinute: input.atMinute, endMinute: input.atMinute + SLOT_MINUTES, status: "confirmed",
    patientID: input.patientID, patientName: input.patientName, lead: input.lead,
    appointmentNote: `Auth request · ${input.identity.user.name}`,
  };
  return { state: { ...state, appointments: { ...state.appointments, [appt.id]: appt } }, appt };
}

// A doctor withdraws one of their windows, only if no booking falls within it.
export function withdrawAvailability(state: DemoState, windowID: string, identity: Identity): DemoState {
  const w = state.availabilityWindows[windowID];
  if (!w) throw new BackendError("notFound");
  if (w.doctorID !== identity.user.id) throw new BackendError("notPermitted");
  const booked = Object.values(state.appointments).some(
    (a) => a.type === "authSlot" && a.ownerID === w.doctorID && a.dateISO === w.dateISO && a.status !== "cancelled" && a.startMinute >= w.startMinute && a.startMinute < w.endMinute,
  );
  if (booked) throw new BackendError("notActive");
  const next = { ...state.availabilityWindows };
  delete next[windowID];
  return { ...state, availabilityWindows: next };
}

// --- Treatment availability windows ---

export function defaultTreatmentAvailability(ownerID: string): TreatmentAvailability {
  const open: DaySchedule = { open: true, openMinute: 540, closeMinute: 1020 };   // 09:00–17:00
  const closed: DaySchedule = { open: false, openMinute: 540, closeMinute: 1020 };
  return { ownerID, days: [open, open, open, open, open, closed, closed], blocks: [] }; // Mon–Fri open
}

export function treatmentAvailabilityForOwner(state: DemoState, ownerID: string): TreatmentAvailability {
  return state.treatmentAvailabilityByOwner[ownerID] ?? defaultTreatmentAvailability(ownerID);
}

export type TreatmentAvailabilityResult = ReturnType<typeof treatmentAvailabilityForOwner>;

export function isTimeAvailableForTreatment(
  config: TreatmentAvailability, dateISO: string, startMinute: number, endMinute: number,
): boolean {
  const day = config.days[isoWeekday(dateISO)];
  if (!day || !day.open) return false;
  if (startMinute < day.openMinute || endMinute > day.closeMinute) return false;
  const overlapsBlock = config.blocks.some(
    (b) => b.dateISO === dateISO && startMinute < b.endMinute && b.startMinute < endMinute,
  );
  return !overlapsBlock;
}

export function setTreatmentDaySchedule(
  state: DemoState, ownerID: string, weekday: number, patch: Partial<DaySchedule>,
): DemoState {
  const config = treatmentAvailabilityForOwner(state, ownerID);
  const merged = { ...config.days[weekday], ...patch };
  if (merged.open && merged.openMinute >= merged.closeMinute) throw new BackendError("validationFailed");
  const days = config.days.map((d, i) => (i === weekday ? merged : d));
  const next = { ...config, ownerID, days };
  return { ...state, treatmentAvailabilityByOwner: { ...state.treatmentAvailabilityByOwner, [ownerID]: next } };
}

export function addTreatmentBlock(
  state: DemoState, ownerID: string, input: { dateISO: string; startMinute: number; endMinute: number },
): { state: DemoState; block: TreatmentBlock } {
  if (input.endMinute <= input.startMinute) throw new BackendError("validationFailed");
  const config = treatmentAvailabilityForOwner(state, ownerID);
  const block: TreatmentBlock = { id: makeID("block"), ...input };
  const next = { ...config, ownerID, blocks: [...config.blocks, block] };
  return { state: { ...state, treatmentAvailabilityByOwner: { ...state.treatmentAvailabilityByOwner, [ownerID]: next } }, block };
}

export function removeTreatmentBlock(state: DemoState, ownerID: string, blockID: string): DemoState {
  const config = treatmentAvailabilityForOwner(state, ownerID);
  const next = { ...config, ownerID, blocks: config.blocks.filter((b) => b.id !== blockID) };
  return { ...state, treatmentAvailabilityByOwner: { ...state.treatmentAvailabilityByOwner, [ownerID]: next } };
}

// --- Doctor online status ---

export function doctorStatusForUser(state: DemoState, doctorID: string): DoctorStatus {
  return state.doctorStatusByID[doctorID] ?? { online: false, alwaysAcceptAuth: false };
}

export function setDoctorStatus(state: DemoState, doctorID: string, patch: Partial<DoctorStatus>): DemoState {
  const next = { ...doctorStatusForUser(state, doctorID), ...patch };
  return { ...state, doctorStatusByID: { ...state.doctorStatusByID, [doctorID]: next } };
}

// --- User profile (spec: auth-accounts / ProfileView) ---

// iOS's InMemoryBackend seeds no profile data (ProfileView hardcodes its demo rows),
// so an unseeded user resolves to empty fields rather than sample values.
export function profileForUser(state: DemoState, userID: string): UserProfile {
  return state.profileByUser[userID] ?? { ahpra: "", abn: "", phone: "", address: "" };
}

// Merges only the client-writable fields — abn (and roles/clinics/mustChangePassword)
// are rules-immutable, so a stray abn in the patch is dropped, matching what Firestore
// would reject server-side.
export function updateProfile(state: DemoState, userID: string, edits: UserProfileEdit): DemoState {
  const current = profileForUser(state, userID);
  const next: UserProfile = {
    ...current,
    ...(edits.ahpra !== undefined ? { ahpra: edits.ahpra } : {}),
    ...(edits.phone !== undefined ? { phone: edits.phone } : {}),
    ...(edits.address !== undefined ? { address: edits.address } : {}),
    ...(edits.avatarFileId !== undefined ? { avatarFileId: edits.avatarFileId } : {}),
    ...(edits.avatarDataUrl !== undefined ? { avatarDataUrl: edits.avatarDataUrl } : {}),
  };
  return { ...state, profileByUser: { ...state.profileByUser, [userID]: next } };
}

// Per-identity address (owner feedback #2). Key: `${uid}:${identityKey}` so the same user
// under a different role/context can hold a different address. Falls back to the per-user
// default in profileByUser (e.g. the value seeded at createUser) until an override is set.
function addressIdentityKey(identity: Identity): string {
  return `${identity.user.id}:${identityKey(identity)}`;
}

export function addressForIdentity(state: DemoState, identity: Identity): string {
  return state.addressByIdentity[addressIdentityKey(identity)] ?? profileForUser(state, identity.user.id).address;
}

export function setAddressForIdentity(state: DemoState, identity: Identity, address: string): DemoState {
  return { ...state, addressByIdentity: { ...state.addressByIdentity, [addressIdentityKey(identity)]: address } };
}

export type DoctorStatusResult = ReturnType<typeof doctorStatusForUser>;

// A patient's full appointment history, most-recent-first (date desc, then start desc).
// All statuses are included (completed / no-show / cancelled are part of the history).
export function appointmentsForPatient(state: DemoState, patientID: string): Appointment[] {
  return Object.values(state.appointments)
    .filter((a) => a.patientID === patientID)
    // dateISO is yyyy-mm-dd, so lexicographic order == chronological; desc for newest-first.
    .sort((a, b) => (a.dateISO === b.dateISO ? b.startMinute - a.startMinute : a.dateISO < b.dateISO ? 1 : -1));
}

// Denormalised calendar form of a patient's name (preferred wins), shown on calendar items.
export function calendarName(p: { preferredName?: string; givenName: string; lastName: string }): string {
  const first = p.preferredName?.trim() ? p.preferredName.trim() : p.givenName;
  return `${first} ${p.lastName}`.trim();
}

// A lead appointment has a structured lead — or, legacy, a bare name — but no linked patient
// file yet (block-time has neither).
export function isLeadAppointment(a: Appointment): boolean {
  return !a.patientID && (!!a.lead || !!a.patientName);
}

// The lead's display name: the structured lead's names, else the legacy patientName with a
// trailing "(new lead)" marker stripped.
export function leadName(a: Appointment): string {
  if (a.lead) return `${a.lead.givenName} ${a.lead.lastName}`.trim();
  return (a.patientName ?? "").replace(/\s*\(new lead\)\s*$/i, "").trim();
}

// ISO yyyy-mm-dd (the lead wire format) → DateOfBirth; anything else → null.
function dobFromISO(dob: string | undefined): DateOfBirth | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob ?? "");
  return m ? { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) } : null;
}

// A create-patient draft prefilled from the lead: a structured lead maps its captured fields
// directly; a legacy name-only lead splits first token given, remainder last.
export function draftFromLead(a: Appointment): PatientDraft {
  if (a.lead) {
    return {
      ...emptyDraft(),
      givenName: a.lead.givenName.trim(), lastName: a.lead.lastName.trim(),
      phone: a.lead.phone ?? "", email: a.lead.email ?? "",
      dateOfBirth: dobFromISO(a.lead.dob),
    };
  }
  const name = leadName(a);
  const space = name.indexOf(" ");
  const givenName = space === -1 ? name : name.slice(0, space);
  const lastName = space === -1 ? "" : name.slice(space + 1).trim();
  return { ...emptyDraft(), givenName, lastName };
}

// Calendar-item title per the appointments spec's resolution order: a new-patient lead name
// (annotated "new patient"), else the appointment's stored patient name, else a placeholder
// for blocked time. (Names are always stamped at booking here, so no live-lookup arm.)
export function appointmentTitle(a: Appointment, blockPlaceholder = "—"): string {
  if (isLeadAppointment(a)) {
    const name = leadName(a);
    return name ? `${name} · new patient` : "New patient"; // a live doc's lead may be no-name
  }
  return a.patientName ?? blockPlaceholder;
}

// Client contact details for a calendar item (spec: pending bookings on the calendar show
// DOB/phone/email). Per-field: the structured lead wins, the linked patient record fills
// gaps; absent fields are omitted (a blocked time yields {}). DOB renders d/m/yyyy, the
// patient-file convention.
export interface AppointmentContact {
  dobLabel?: string;
  phone?: string;
  email?: string;
}

function isoToAuDate(iso: string): string | undefined {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return undefined;
  return `${parseInt(m[3], 10)}/${parseInt(m[2], 10)}/${parseInt(m[1], 10)}`;
}

export function appointmentContact(a: Appointment, patient: Patient | undefined): AppointmentContact {
  const leadDob = a.lead?.dob ? isoToAuDate(a.lead.dob) : undefined;
  const patientDob = patient ? `${patient.dateOfBirth.day}/${patient.dateOfBirth.month}/${patient.dateOfBirth.year}` : undefined;
  const pick = (leadValue: string | undefined, patientValue: string | undefined) => {
    const v = leadValue?.trim() || patientValue?.trim();
    return v ? v : undefined;
  };
  const contact: AppointmentContact = {};
  const dob = leadDob ?? patientDob;
  if (dob) contact.dobLabel = dob;
  const phone = pick(a.lead?.phone, patient?.phone);
  if (phone) contact.phone = phone;
  const email = pick(a.lead?.email, patient?.email);
  if (email) contact.email = email;
  return contact;
}

// Existing patients OWNED BY the acting subject that match a booking lead on name + full DOB —
// "return patient" detection so a self-booking reuses the file instead of minting a duplicate.
// Per-subject isolation (feedback 2026-07-07 item 4): matches only the caller's OWN files
// (owner === ownerFor(identity)), never another subject's records. Requires given + last name
// (trimmed, case-insensitive) AND a complete DOB; a partial/absent DOB yields no confident match
// (returns []), so two different people are never silently treated as one.
export function matchLeadToPatients(state: DemoState, lead: AppointmentLead, identity: Identity): Patient[] {
  const dob = dobFromISO(lead.dob);
  if (!dob) return [];
  const given = lead.givenName.trim().toLowerCase();
  const last = lead.lastName.trim().toLowerCase();
  if (!given || !last) return [];
  const owner = ownerFor(identity);
  return Object.values(state.patients).filter(
    (p) =>
      p.owner.kind === owner.kind && p.owner.id === owner.id &&
      p.givenName.trim().toLowerCase() === given &&
      p.lastName.trim().toLowerCase() === last &&
      p.dateOfBirth.year === dob.year && p.dateOfBirth.month === dob.month && p.dateOfBirth.day === dob.day,
  );
}

// Link a lead appointment to a patient: stamp the id + calendar name, clear the lead.
export function linkAppointmentPatient(
  state: DemoState, apptId: string, patientId: string, identity: Identity,
): DemoState {
  const appt = state.appointments[apptId];
  if (!appt) throw new BackendError("notFound");
  if (appt.ownerID !== appointmentOwnerScope(identity)) throw new BackendError("notPermitted");
  if (appt.patientID) throw new BackendError("notActive"); // only an unlinked lead can be linked
  const patient = state.patients[patientId];
  if (!patient) throw new BackendError("notFound");
  // Same-subject isolation (feedback 2026-07-07 item 4): a lead may only be linked to a file the
  // acting subject owns — never one belonging to another doctor/nurse/clinic.
  const owner = ownerFor(identity);
  if (patient.owner.kind !== owner.kind || patient.owner.id !== owner.id) throw new BackendError("notPermitted");
  return {
    ...state,
    appointments: { ...state.appointments, [apptId]: { ...appt, patientID: patientId, patientName: calendarName(patient), lead: undefined } },
  };
}

// Owner's appointments with startISO <= dateISO <= endISO (ISO dates compare lexically),
// excluding cancelled, sorted by date then start. Backs the week/month views.
export function appointmentsForOwnerInRange(
  state: DemoState, ownerID: string, startISO: string, endISO: string,
): Appointment[] {
  return Object.values(state.appointments)
    .filter((a) => (a.ownerID === ownerID || a.bookedByID === ownerID) && a.status !== "cancelled" && a.dateISO >= startISO && a.dateISO <= endISO)
    .sort((a, b) => (a.dateISO === b.dateISO ? a.startMinute - b.startMinute : a.dateISO < b.dateISO ? -1 : 1));
}

// Active authorisations the identity is allowed to tick when writing a treatment note.
export function usableAuthorisations(
  state: DemoState, patientID: string, identity: Identity, now: number,
): Authorisation[] {
  return activeAuthorisations(state, patientID, now).filter((a) => canUseAuthorisation(a, identity));
}

// Aftercare is sender-restricted to nurses and doctors (clinic admins may write
// general notes but MUST NOT send aftercare, per the clinical-notes spec).
export function canSendAftercare(identity: Identity): boolean {
  return identity.role === "nurse" || identity.role === "doctor";
}

// Aftercare + delivery-status are note writes: they need an actual note-write grant, not
// just canView. A read-only reviewer (open request) has neither write flag, so this is
// false for them (spec 2026-07-07 reviewer-file-access).
export function canWriteAnyNote(perms: Permissions): boolean {
  return perms.canWriteTreatmentNote || perms.canWriteGeneralNote;
}

export interface RecordAftercareSendInput {
  patientID: string;
  content: string;
  medications: TreatmentMedication[];
  categories: AftercareCategory[];
  identity: Identity;
}

export function recordAftercareSend(
  state: DemoState, input: RecordAftercareSendInput, now: number,
): { state: DemoState; note: Note } {
  const patient = state.patients[input.patientID];
  if (!patient) throw new BackendError("notFound");
  // Aftercare is a note-write: a read-only reviewer (open request, no write perms) may not
  // send it even though their role could (spec 2026-07-07 reviewer-file-access).
  if (!canSendAftercare(input.identity) || !canWriteAnyNote(patientPermissions(input.identity, patient))) {
    throw new BackendError("notPermitted");
  }
  const note: Note = {
    id: makeID("n"),
    patientID: input.patientID,
    kind: "aftercareRecord",
    title: "Aftercare sent",
    body: input.content,
    createdAt: now,
    authorID: input.identity.user.id,
    authorBadge: identityBadge(input.identity),
    consumedAuthorisationIDs: [],
    medications: input.medications,
    deliveryStatus: "queued",
    aftercareCategories: input.categories,
  };
  return appendNote(state, note);
}

// Update the delivery status of an aftercare send-record note (mirror-back / demo retry).
export function setNoteDeliveryStatus(
  state: DemoState, patientID: string, noteID: string, status: DeliveryStatus, identity: Identity,
): DemoState {
  const patient = state.patients[patientID];
  if (!patient) throw new BackendError("notFound");
  // Mirror recordAftercareSend's gate exactly — only a sender (nurse/doctor) with note-write
  // access may change an aftercare record's delivery status. A read-only reviewer cannot.
  if (!canSendAftercare(identity) || !canWriteAnyNote(patientPermissions(identity, patient))) {
    throw new BackendError("notPermitted");
  }
  const list = state.notesByPatient[patientID] ?? [];
  const idx = list.findIndex((n) => n.id === noteID);
  if (idx < 0) throw new BackendError("notFound");
  const next = [...list];
  next[idx] = { ...next[idx], deliveryStatus: status };
  return { ...state, notesByPatient: { ...state.notesByPatient, [patientID]: next } };
}

// Spec (clinical-notes): photos are the image/* attachments; they thumbnail inline and in
// the note list, while other files show a renameable display name.
export function isImageAttachment(a: NoteAttachment): boolean {
  return a.mimeType.startsWith("image/");
}
export function imageAttachments(n: Note): NoteAttachment[] {
  return (n.attachments ?? []).filter(isImageAttachment);
}

export interface SaveGeneralNoteInput {
  patientID: string;
  title: string;
  body: string;
  attachments?: NoteAttachment[];
  identity: Identity;
}

export function saveGeneralNote(state: DemoState, input: SaveGeneralNoteInput, now: number): { state: DemoState; note: Note } {
  const patient = state.patients[input.patientID];
  if (!patient) throw new BackendError("notFound");
  if (!patientPermissions(input.identity, patient).canWriteGeneralNote) throw new BackendError("notPermitted");
  const note: Note = {
    id: makeID("n"),
    patientID: input.patientID,
    kind: "general",
    title: input.title,
    body: input.body,
    createdAt: now,
    authorID: input.identity.user.id,
    authorBadge: identityBadge(input.identity),
    consumedAuthorisationIDs: [],
    medications: [],
    attachments: input.attachments,
  };
  return appendNote(state, note);
}

export interface SaveTreatmentNoteInput {
  patientID: string;
  tickedIDs: string[];
  title: string;
  body: string;
  medications: TreatmentMedication[];
  attachments?: NoteAttachment[];
  identity: Identity;
}

export function saveTreatmentNote(state: DemoState, input: SaveTreatmentNoteInput, now: number): { state: DemoState; note: Note; followUp?: FollowUpTask } {
  const patient = state.patients[input.patientID];
  if (!patient) throw new BackendError("notFound");
  if (!patientPermissions(input.identity, patient).canWriteTreatmentNote) throw new BackendError("notPermitted");

  const authorisations = { ...state.authorisations };
  const usages = [...state.usages];

  // Rule 1 (spec: 2026-07-06): a treatment note needs no authorisation — nurse and prescribing
  // doctor alike may save without ticking one. When authorisations ARE ticked they are still
  // validated (all-or-nothing) and consumed.
  if (input.tickedIDs.length > 0) {
    for (const id of input.tickedIDs) {
      const a = state.authorisations[id];
      if (!a) throw new BackendError("notFound");
      if (!isAuthActive(a, now)) throw new BackendError("notActive");
      if (!canUseAuthorisation(a, input.identity)) throw new BackendError("notPermitted");
    }
    for (const id of input.tickedIDs) {
      const a = state.authorisations[id];
      authorisations[id] = { ...a, repeatsRemaining: a.repeatsRemaining - 1 };
      usages.push({ authorisationID: id, patientID: input.patientID, clinicID: a.clinicID, nurseID: input.identity.user.id, date: now });
    }
  }

  const note: Note = {
    id: makeID("n"),
    patientID: input.patientID,
    kind: "treatment",
    title: input.title,
    body: input.body,
    createdAt: now,
    authorID: input.identity.user.id,
    authorBadge: identityBadge(input.identity),
    consumedAuthorisationIDs: input.tickedIDs,
    medications: input.medications,
    attachments: input.attachments,
  };
  const withNote = appendNote({ ...state, authorisations, usages }, note);

  // Follow-up reminder (opt-in): schedule one intervalDays after the treatment.
  const settings = followUpSettingsForUser(withNote.state, input.identity.user.id);
  if (!settings.enabled) return { state: withNote.state, note };
  const followUp: FollowUpTask = {
    id: makeID("fu"),
    ownerID: input.identity.user.id,
    patientID: input.patientID,
    patientName: displayName(patient),
    dueDateISO: isoDay(now + settings.intervalDays * DAY_MS),
    status: "pending",
    sourceNoteID: note.id,
  };
  const state2 = { ...withNote.state, followUpTasksByID: { ...withNote.state.followUpTasksByID, [followUp.id]: followUp } };
  return { state: state2, note, followUp };
}

function appendNote(state: DemoState, note: Note): { state: DemoState; note: Note } {
  const existing = state.notesByPatient[note.patientID] ?? [];
  return {
    state: { ...state, notesByPatient: { ...state.notesByPatient, [note.patientID]: [...existing, note] } },
    note,
  };
}

// --- Patient CRUD + merge ---

export const PATIENT_FIELDS: PatientField[] = [
  "givenName", "lastName", "dateOfBirth", "gender",
  "address", "phone", "email", "allergies", "currentMedications",
];

export function missingFields(draft: PatientDraft): Set<PatientField> {
  const missing = new Set<PatientField>();
  const check = (v: string, f: PatientField) => { if (!v.trim()) missing.add(f); };
  check(draft.givenName, "givenName");
  check(draft.lastName, "lastName");
  if (!draft.dateOfBirth) missing.add("dateOfBirth");
  if (!draft.gender.trim()) missing.add("gender");
  check(draft.address, "address");
  check(draft.phone, "phone");
  check(draft.email, "email");
  check(draft.allergies, "allergies");
  check(draft.currentMedications, "currentMedications");
  return missing;
}

export function canCreatePatient(identity: Identity): boolean {
  return identity.role !== "superAdmin";
}

function ownerFor(identity: Identity): PatientOwner {
  if (identity.context.kind === "clinic") return { kind: "clinic", id: identity.context.clinic.id };
  if (identity.role === "doctor") return { kind: "doctor", id: identity.user.id };
  return { kind: "nurse", id: identity.user.id };
}

export function createPatient(
  state: DemoState, draft: PatientDraft, identity: Identity,
): { state: DemoState; patient: Patient } {
  if (!canCreatePatient(identity)) throw new BackendError("notPermitted");
  if (missingFields(draft).size > 0) throw new BackendError("validationFailed");
  const patient: Patient = {
    id: makeID("p"),
    givenName: draft.givenName.trim(),
    lastName: draft.lastName.trim(),
    dateOfBirth: draft.dateOfBirth!,
    gender: draft.gender,
    address: draft.address.trim(),
    phone: draft.phone.trim(),
    email: draft.email.trim(),
    allergies: draft.allergies.trim(),
    currentMedications: draft.currentMedications.trim(),
    owner: ownerFor(identity),
    prescribingDoctorIDs: [],
    openReviewerDoctorIDs: [],
    alert: draft.alert.trim() ? draft.alert.trim() : undefined,
    preferredName: draft.preferredName.trim() ? draft.preferredName.trim() : undefined,
  };
  return { state: { ...state, patients: { ...state.patients, [patient.id]: patient } }, patient };
}

export function updatePatient(state: DemoState, patient: Patient, identity: Identity): DemoState {
  const existing = state.patients[patient.id];
  if (!existing) throw new BackendError("notFound");
  if (!patientPermissions(identity, existing).canEditDetails) throw new BackendError("notPermitted");
  const merged: Patient = { ...patient, owner: existing.owner, prescribingDoctorIDs: existing.prescribingDoctorIDs, openReviewerDoctorIDs: existing.openReviewerDoctorIDs };
  return { ...state, patients: { ...state.patients, [patient.id]: merged } };
}

// Which avatar representation is being set: the live Storage object key, the demo-only
// inline preview bytes, or both (only provided keys are applied).
export interface PatientAvatarEdit {
  avatarFileId?: string;
  avatarDataUrl?: string;
}

// Sets the patient photo (spec: patient-records — PatientAvatarPicker). Gated on
// canEditDetails, exactly like updatePatient — iOS routes the picked photo through
// InMemoryBackend.updatePatient, which enforces the same permission.
export function setPatientAvatar(
  state: DemoState, patientID: string, avatar: PatientAvatarEdit, identity: Identity,
): DemoState {
  const existing = state.patients[patientID];
  if (!existing) throw new BackendError("notFound");
  if (!patientPermissions(identity, existing).canEditDetails) throw new BackendError("notPermitted");
  const next: Patient = {
    ...existing,
    ...(avatar.avatarFileId !== undefined ? { avatarFileId: avatar.avatarFileId } : {}),
    ...(avatar.avatarDataUrl !== undefined ? { avatarDataUrl: avatar.avatarDataUrl } : {}),
  };
  return { ...state, patients: { ...state.patients, [patientID]: next } };
}

export function deletePatient(state: DemoState, id: string, identity: Identity): DemoState {
  const existing = state.patients[id];
  if (!existing) throw new BackendError("notFound");
  if (!patientPermissions(identity, existing).canDelete) throw new BackendError("notPermitted");
  const patients = { ...state.patients };
  delete patients[id];
  const notesByPatient = { ...state.notesByPatient };
  delete notesByPatient[id];
  const formsByPatient = { ...state.formsByPatient };
  delete formsByPatient[id];
  // Drop the patient's relational records so no orphaned rows drive the UI.
  const authorisations = Object.fromEntries(
    Object.entries(state.authorisations).filter(([, a]) => a.patientID !== id),
  );
  const requests = Object.fromEntries(
    Object.entries(state.requests).filter(([, r]) => r.patientID !== id),
  );
  const usages = state.usages.filter((u) => u.patientID !== id);
  return { ...state, patients, notesByPatient, formsByPatient, authorisations, requests, usages };
}

export function mergePatients(state: DemoState, keepId: string, removeId: string, identity: Identity): DemoState {
  const keep = state.patients[keepId];
  const remove = state.patients[removeId];
  if (!keep || !remove) throw new BackendError("notFound");
  if (!patientPermissions(identity, keep).canMerge || !patientPermissions(identity, remove).canMerge) {
    throw new BackendError("notPermitted");
  }
  const movedNotes = (state.notesByPatient[removeId] ?? []).map((n) => ({ ...n, patientID: keepId }));
  const notesByPatient = { ...state.notesByPatient, [keepId]: [...(state.notesByPatient[keepId] ?? []), ...movedNotes] };
  delete notesByPatient[removeId];

  // Move signed forms onto the kept file too.
  const movedForms = (state.formsByPatient[removeId] ?? []).map((f) => ({ ...f, patientID: keepId }));
  const formsByPatient = { ...state.formsByPatient, [keepId]: [...(state.formsByPatient[keepId] ?? []), ...movedForms] };
  delete formsByPatient[removeId];

  const authorisations = { ...state.authorisations };
  for (const [id, a] of Object.entries(authorisations)) {
    if (a.patientID === removeId) authorisations[id] = { ...a, patientID: keepId };
  }
  // Re-point usage records too, so billing/usage history follows the merged file.
  const usages = state.usages.map((u) => (u.patientID === removeId ? { ...u, patientID: keepId } : u));

  // Re-point appointments so the removed file's calendar history follows the merge,
  // refreshing the denormalised name to the kept patient's calendar name.
  const keepCalendarName = calendarName(keep);
  const appointments = { ...state.appointments };
  for (const [id, a] of Object.entries(appointments)) {
    if (a.patientID === removeId) appointments[id] = { ...a, patientID: keepId, patientName: keepCalendarName };
  }

  // Re-point requests so review-access + request history follow the merge (and no request
  // is orphaned pointing at the deleted file — an orphan would break a later approval).
  const requests = Object.fromEntries(
    Object.entries(state.requests).map(([id, r]) =>
      (r.patientID === removeId ? [id, { ...r, patientID: keepId }] : [id, r])),
  );

  const mergedKeep: Patient = {
    ...keep,
    prescribingDoctorIDs: [...new Set([...keep.prescribingDoctorIDs, ...remove.prescribingDoctorIDs])],
  };
  const patients = { ...state.patients, [keepId]: mergedKeep };
  delete patients[removeId];

  // Recompute the kept file's reviewer set from the re-pointed request set (mirror of the
  // backend trigger) rather than unioning the two stale arrays — this drops any reviewer
  // whose request didn't actually move, keeping the invariant true.
  return syncReviewerAccess(
    { ...state, patients, notesByPatient, formsByPatient, authorisations, usages, appointments, requests },
    keepId,
  );
}

// --- Signed forms ---

export function formsForPatient(state: DemoState, patientID: string): SignedFormRecord[] {
  return [...(state.formsByPatient[patientID] ?? [])].sort((a, b) => b.signedAt - a.signedAt);
}

export interface RecordFormInput {
  patientID: string;
  template: FormTemplateKind;
  channel: SigningChannel;
  answers: FormAnswer[];
  signatureFileId?: string;
  signatureDataUrl?: string;
}

export function recordSignedForm(
  state: DemoState, input: RecordFormInput, identity: Identity, now: number,
): { state: DemoState; form: SignedFormRecord } {
  const patient = state.patients[input.patientID];
  if (!patient) throw new BackendError("notFound");
  if (!patientPermissions(identity, patient).canSendForms) throw new BackendError("notPermitted");
  const t = formTemplate(input.template);
  const form: SignedFormRecord = {
    id: makeID("f"),
    patientID: input.patientID,
    template: input.template,
    channel: input.channel,
    signedAt: now,
    answers: input.answers,
    intro: t.intro,
    clauses: t.clauses,
    signatureFileId: input.signatureFileId,
    signatureDataUrl: input.signatureDataUrl,
  };
  const existing = state.formsByPatient[input.patientID] ?? [];
  return {
    state: { ...state, formsByPatient: { ...state.formsByPatient, [input.patientID]: [...existing, form] } },
    form,
  };
}

export function deleteForm(state: DemoState, patientID: string, formId: string, identity: Identity): DemoState {
  const patient = state.patients[patientID];
  if (!patient) throw new BackendError("notFound");
  if (!patientPermissions(identity, patient).canSendForms) throw new BackendError("notPermitted");
  const list = (state.formsByPatient[patientID] ?? []).filter((f) => f.id !== formId);
  return { ...state, formsByPatient: { ...state.formsByPatient, [patientID]: list } };
}

// Key for a doctor's per-counterparty price. Safe with the project's id charset
// (uuids/hyphenated ids never contain "_"); matches the backend scriptPricing doc id.
export function scriptPriceKey(doctorID: string, counterpartyID: string): string {
  return `${doctorID}_${counterpartyID}`;
}

export function setScriptPrice(state: DemoState, doctorID: string, counterpartyID: string, priceCents: number): DemoState {
  if (!Number.isInteger(priceCents) || priceCents <= 0) throw new BackendError("validationFailed");
  return { ...state, scriptPricing: { ...state.scriptPricing, [scriptPriceKey(doctorID, counterpartyID)]: priceCents } };
}

// The price a doctor's invoice/preview will use for a counterparty: relationship admin-override →
// the doctor's own scriptPricing → default. counterpartyType isn't threaded here (billing UI only
// has the id), and an id is a nurse XOR clinic (disjoint namespaces), so try both relationship keys.
export function resolvedScriptPriceCents(state: DemoState, doctorID: string, counterpartyID: string): number {
  const rel = relationshipFor(state.cooperationRelationshipsByID, doctorID, "nurse", counterpartyID)
    ?? relationshipFor(state.cooperationRelationshipsByID, doctorID, "clinic", counterpartyID);
  return priceCentsFor(rel, state.scriptPricing[scriptPriceKey(doctorID, counterpartyID)]);
}

// --- Cooperation relationships (spec 2026-07-08 cooperation-relationships, constitution §17) ---

// The doctors the acting nurse/clinic may request authorisation from (the single eligibility source).
export function cooperatingDoctors(state: DemoState, identity: Identity): { doctorId: string; doctorName: string }[] {
  const owner = ownerFor(identity);
  if (owner.kind === "doctor") return []; // doctors don't raise requests
  return cooperatingDoctorsFor(Object.values(state.cooperationRelationshipsByID), owner.kind, owner.id);
}

export function cooperationRelationshipsList(state: DemoState): CooperationRelationship[] {
  return Object.values(state.cooperationRelationshipsByID)
    .sort((a, b) => a.doctorName.localeCompare(b.doctorName) || a.counterpartyName.localeCompare(b.counterpartyName));
}

export function relationshipAuditForRelationship(state: DemoState, relationshipID: string): RelationshipAuditEntry[] {
  return Object.values(state.relationshipAuditByID)
    .filter((e) => e.relationshipID === relationshipID)
    .sort((a, b) => b.at - a.at);
}

export interface SetCooperationRelationshipInput {
  doctorID: string;
  doctorName: string;
  counterpartyType: CounterpartyType;
  counterpartyID: string;
  counterpartyName: string;
  status: RelationshipStatus;
  authRequestsAllowed: boolean;
  invoiceApplies: boolean;
  priceCentsOverride: number | null;
}

function relationshipSummary(r: CooperationRelationship): string {
  const price = r.priceCentsOverride == null ? "default" : `$${(r.priceCentsOverride / 100).toFixed(2)}`;
  return `${r.status}${r.authRequestsAllowed ? "" : " · requests paused"} · price ${price} · invoicing ${r.invoiceApplies ? "on" : "off"}`;
}

function relationshipAudit(action: RelationshipAction, rel: CooperationRelationship, actor: Identity, now: number): RelationshipAuditEntry {
  return {
    id: makeID("relaudit"),
    relationshipID: rel.id,
    actorID: actor.user.id,
    actorName: actor.user.name,
    action,
    summary: `${action} · ${relationshipSummary(rel)}`,
    at: now,
  };
}

// superAdmin upsert of a relationship (create or edit), always recording an audit entry.
export function setCooperationRelationship(state: DemoState, input: SetCooperationRelationshipInput, actor: Identity, now: number): DemoState {
  if (actor.role !== "superAdmin") throw new BackendError("notPermitted");
  if (input.priceCentsOverride != null && (!Number.isInteger(input.priceCentsOverride) || input.priceCentsOverride <= 0)) {
    throw new BackendError("validationFailed");
  }
  const id = cooperationDocId(input.doctorID, input.counterpartyType, input.counterpartyID);
  const prior = state.cooperationRelationshipsByID[id];
  const rel: CooperationRelationship = {
    id,
    doctorID: input.doctorID,
    doctorName: input.doctorName,
    counterpartyType: input.counterpartyType,
    counterpartyID: input.counterpartyID,
    counterpartyName: input.counterpartyName,
    status: input.status,
    authRequestsAllowed: input.authRequestsAllowed,
    invoiceApplies: input.invoiceApplies,
    priceCentsOverride: input.priceCentsOverride,
    createdAt: prior?.createdAt ?? now,
    updatedAt: now,
  };
  const audit = relationshipAudit(prior ? "updated" : "created", rel, actor, now);
  return {
    ...state,
    cooperationRelationshipsByID: { ...state.cooperationRelationshipsByID, [id]: rel },
    relationshipAuditByID: { ...state.relationshipAuditByID, [audit.id]: audit },
  };
}

// "Remove" is a soft deactivation (status inactive) so history is preserved; the gate excludes it.
export function removeCooperationRelationship(state: DemoState, id: string, actor: Identity, now: number): DemoState {
  if (actor.role !== "superAdmin") throw new BackendError("notPermitted");
  const prior = state.cooperationRelationshipsByID[id];
  if (!prior) throw new BackendError("notFound");
  const rel: CooperationRelationship = { ...prior, status: "inactive", updatedAt: now };
  const audit = relationshipAudit("removed", rel, actor, now);
  return {
    ...state,
    cooperationRelationshipsByID: { ...state.cooperationRelationshipsByID, [id]: rel },
    relationshipAuditByID: { ...state.relationshipAuditByID, [audit.id]: audit },
  };
}

// --- Platform audit log (constitution §21) ---

export interface AuditEntryInput {
  actor: Identity;
  action: AuditAction;
  targetType?: string | null;
  targetID?: string | null;
  summary: string;
}

// Appends one entry to the platform audit log, denormalising the acting identity (actorRole =
// actor.role) and a human-readable summary so the log renders standalone. Append-only — each
// call is its own event (no dedup). Mirrors the backend `auditLog` writer.
export function appendAuditEntry(state: DemoState, input: AuditEntryInput, now: number): DemoState {
  const entry: AuditLogEntry = {
    id: makeID("audit"),
    actorID: input.actor.user.id,
    actorName: input.actor.user.name,
    actorRole: input.actor.role,
    action: input.action,
    targetType: input.targetType ?? null,
    targetID: input.targetID ?? null,
    summary: input.summary,
    at: now,
  };
  return { ...state, auditLogByID: { ...state.auditLogByID, [entry.id]: entry } };
}

// Records a Platform Admin opening a patient file (constitution §16/§21) as an
// `admin_patient_access` audit entry. A no-op for any non-superAdmin identity (only admin
// access is audit-logged here) — returns state unchanged so callers can fire it unconditionally.
export function recordAdminPatientAccess(state: DemoState, actor: Identity, patient: Patient, now: number): DemoState {
  if (actor.role !== "superAdmin") return state;
  return appendAuditEntry(
    state,
    { actor, action: "admin_patient_access", targetType: "patient", targetID: patient.id, summary: `opened ${fullName(patient)}` },
    now,
  );
}

export function auditLogEntries(state: DemoState): AuditLogEntry[] {
  return Object.values(state.auditLogByID).sort((a, b) => b.at - a.at);
}

export interface BillableAuthorisation {
  id: string;
  counterpartyID: string;
  counterpartyType: "nurse" | "clinic";
  monthKey: string;
  invoiced: boolean;
  patientName: string;
  dateISO: string;
}

export function billableAuthorisations(state: DemoState, doctorID: string): BillableAuthorisation[] {
  return Object.values(state.authorisations)
    .filter((a) => a.doctorID === doctorID && !a.invoiced)
    .map((a) => {
      const patient = state.patients[a.patientID];
      const counterpartyType: "clinic" | "nurse" = a.clinicID ? "clinic" : "nurse";
      return {
        id: a.id,
        counterpartyID: a.clinicID ?? a.nurseID,
        counterpartyType,
        monthKey: monthKey(a.createdAt),
        invoiced: a.invoiced,
        patientName: patient ? fullName(patient) : "",
        dateISO: new Date(a.createdAt).toISOString().slice(0, 10),
      };
    })
    // Spec 2026-07-08: a relationship with invoiceApplies:false makes its counterparty's auths non-billable.
    .filter((r) => invoiceAppliesFor(relationshipFor(state.cooperationRelationshipsByID, doctorID, r.counterpartyType, r.counterpartyID)));
}

export interface GenerateInvoiceInput {
  doctorID: string;
  counterpartyID: string;
  counterpartyType: "nurse" | "clinic";
  periodLabel: string;
  authIDs: string[];
}

export function generateInvoice(
  state: DemoState, input: GenerateInvoiceInput, identity: Identity, now: number,
): { state: DemoState; invoice: Invoice } {
  if (identity.role !== "doctor" || identity.user.id !== input.doctorID) throw new BackendError("notPermitted");
  const rows = billableAuthorisations(state, input.doctorID)
    .filter((r) => input.authIDs.includes(r.id) && r.counterpartyID === input.counterpartyID && !r.invoiced);
  if (rows.length === 0) throw new BackendError("validationFailed");
  // Spec 2026-07-08: price precedence is relationship override → legacy scriptPricing → default.
  const priceRel = relationshipFor(state.cooperationRelationshipsByID, input.doctorID, input.counterpartyType, input.counterpartyID);
  const priceCents = priceCentsFor(priceRel, state.scriptPricing[scriptPriceKey(input.doctorID, input.counterpartyID)]);
  const computed = computeInvoice({
    pricePerScriptCents: priceCents, gstRate: GST_RATE,
    authorisations: rows.map((r) => ({ id: r.id, dateISO: r.dateISO, patientName: r.patientName })),
  });
  const invoice: Invoice = {
    id: makeID("inv"),
    doctorID: input.doctorID,
    counterpartyID: input.counterpartyID,
    counterpartyType: input.counterpartyType,
    periodLabel: input.periodLabel,
    ...computed,
    authorisationIDs: rows.map((r) => r.id),
    createdAt: now,
  };
  const invoicedIDs = new Set(rows.map((r) => r.id));
  const authorisations = { ...state.authorisations };
  for (const id of invoicedIDs) authorisations[id] = { ...authorisations[id], invoiced: true };
  // Demo audit write (constitution §21): representative parity with the backend's invoice path,
  // which writes the durable `invoice_generated` entry in live. Only reached in demo — the store
  // routes live invoicing through the deployed callable + hydrate, never this function.
  const priced = { ...state, authorisations, invoices: [...state.invoices, invoice] };
  const audited = appendAuditEntry(
    priced,
    { actor: identity, action: "invoice_generated", targetType: "invoice", targetID: invoice.id, summary: `invoice ${input.periodLabel} · $${(invoice.totalCents / 100).toFixed(2)}` },
    now,
  );
  return { state: audited, invoice };
}

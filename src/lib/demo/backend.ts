// Pure domain rules ported from the iOS InMemoryBackend + PatientPermissions + Authorisations.
// Every mutator returns a NEW DemoState (immutable). `now` is passed in for deterministic tests.
import type {
  Authorisation,
  AuthorisationRequest,
  BillingEvent,
  DemoState,
  Identity,
  MedicationItem,
  Note,
  Patient,
  PatientDraft,
  PatientField,
  PatientOwner,
  PatientSummary,
  TreatmentMedication,
} from "./types";
import { fullName, identityBadge } from "./types";

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
    ledger: [],
    usages: [],
  };
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
    ...p,
  };
}

function contextClinicID(identity: Identity): string | null {
  return identity.context.kind === "clinic" ? identity.context.clinic.id : null;
}

export function patientPermissions(identity: Identity, patient: Patient): Permissions {
  if (identity.role === "superAdmin") {
    return perms({ canView: true, canViewBusinessStats: true });
  }
  const userID = identity.user.id;
  const isPrescriber = identity.role === "doctor" && patient.prescribingDoctorIDs.includes(userID);

  switch (patient.owner.kind) {
    case "doctor":
      if (identity.role === "doctor" && identity.context.kind === "independent" && userID === patient.owner.id) {
        return perms({ canView: true, canEditDetails: true, canDelete: true, canWriteGeneralNote: true, canWriteTreatmentNote: true, canSendForms: true });
      }
      return perms({});
    case "nurse":
      if (identity.role === "nurse" && identity.context.kind === "independent" && userID === patient.owner.id) {
        return perms({ canView: true, canEditDetails: true, canDelete: true, canWriteGeneralNote: true, canWriteTreatmentNote: true, canSendForms: true });
      }
      if (isPrescriber) {
        return perms({ canView: true, canWriteGeneralNote: true, canWriteTreatmentNote: true });
      }
      return perms({});
    case "clinic":
      if (contextClinicID(identity) === patient.owner.id) {
        switch (identity.role) {
          case "clinicAdmin":
            return perms({ canView: true, canEditDetails: true, canDelete: true, canMerge: true, canWriteGeneralNote: true, canSendForms: true, canViewBusinessStats: true });
          case "doctor":
          case "nurse":
            return perms({ canView: true, canEditDetails: true, canWriteGeneralNote: true, canWriteTreatmentNote: true, canSendForms: true });
          default:
            return perms({ canView: true, canViewBusinessStats: true });
        }
      }
      if (isPrescriber) {
        return perms({ canView: true, canWriteGeneralNote: true, canWriteTreatmentNote: true });
      }
      return perms({});
  }
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
  return { state: { ...state, requests: { ...state.requests, [request.id]: request } }, request };
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
  }));

  const authorisations = { ...state.authorisations };
  for (const a of granted) authorisations[a.id] = a;

  const event: BillingEvent = {
    id: makeID("ev"),
    requestID: request.id,
    patientID: request.patientID,
    counterpartyID: clinicID ?? request.nurse.id,
    createdAt: now,
  };

  const patient = state.patients[request.patientID];
  const patients = { ...state.patients };
  if (patient && !patient.prescribingDoctorIDs.includes(identity.user.id)) {
    patients[patient.id] = { ...patient, prescribingDoctorIDs: [...patient.prescribingDoctorIDs, identity.user.id] };
  }

  return {
    state: {
      ...state,
      patients,
      authorisations,
      requests: { ...state.requests, [requestID]: { ...request, status: "approved" } },
      ledger: [...state.ledger, event],
    },
    granted,
  };
}

export function requireEdit(state: DemoState, requestID: string, identity: Identity): DemoState {
  const request = state.requests[requestID];
  if (!request) throw new BackendError("notFound");
  if (identity.role !== "doctor" || identity.user.id !== request.doctorID) {
    throw new BackendError("notPermitted");
  }
  return { ...state, requests: { ...state.requests, [requestID]: { ...request, status: "needsEdit" } } };
}

// --- Notes ---

function canUseAuthorisation(a: Authorisation, identity: Identity): boolean {
  if (a.clinicID) return contextClinicID(identity) === a.clinicID;
  return identity.context.kind === "independent" && identity.user.id === a.nurseID;
}

export function notesForPatient(state: DemoState, patientID: string): Note[] {
  return [...(state.notesByPatient[patientID] ?? [])].sort((a, b) => b.createdAt - a.createdAt);
}

export interface SaveGeneralNoteInput {
  patientID: string;
  title: string;
  body: string;
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
  };
  return appendNote(state, note);
}

export interface SaveTreatmentNoteInput {
  patientID: string;
  tickedIDs: string[];
  title: string;
  body: string;
  medications: TreatmentMedication[];
  identity: Identity;
}

export function saveTreatmentNote(state: DemoState, input: SaveTreatmentNoteInput, now: number): { state: DemoState; note: Note } {
  const patient = state.patients[input.patientID];
  if (!patient) throw new BackendError("notFound");
  if (!patientPermissions(input.identity, patient).canWriteTreatmentNote) throw new BackendError("notPermitted");

  const authorisations = { ...state.authorisations };
  const usages = [...state.usages];

  const isDoctorDirect = input.identity.role === "doctor" && input.tickedIDs.length === 0;
  if (!isDoctorDirect) {
    if (input.tickedIDs.length === 0) throw new BackendError("nothingTicked");
    // Validate all before mutating any (all-or-nothing).
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
  };
  const withNote = appendNote({ ...state, authorisations, usages }, note);
  return withNote;
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
  state: DemoState, draft: PatientDraft, identity: Identity, _now: number,
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
    alert: draft.alert.trim() ? draft.alert.trim() : undefined,
    preferredName: draft.preferredName.trim() ? draft.preferredName.trim() : undefined,
  };
  return { state: { ...state, patients: { ...state.patients, [patient.id]: patient } }, patient };
}

export function updatePatient(state: DemoState, patient: Patient, identity: Identity): DemoState {
  const existing = state.patients[patient.id];
  if (!existing) throw new BackendError("notFound");
  if (!patientPermissions(identity, existing).canEditDetails) throw new BackendError("notPermitted");
  const merged: Patient = { ...patient, owner: existing.owner, prescribingDoctorIDs: existing.prescribingDoctorIDs };
  return { ...state, patients: { ...state.patients, [patient.id]: merged } };
}

export function deletePatient(state: DemoState, id: string, identity: Identity): DemoState {
  const existing = state.patients[id];
  if (!existing) throw new BackendError("notFound");
  if (!patientPermissions(identity, existing).canDelete) throw new BackendError("notPermitted");
  const patients = { ...state.patients };
  delete patients[id];
  const notesByPatient = { ...state.notesByPatient };
  delete notesByPatient[id];
  return { ...state, patients, notesByPatient };
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

  const authorisations = { ...state.authorisations };
  for (const [id, a] of Object.entries(authorisations)) {
    if (a.patientID === removeId) authorisations[id] = { ...a, patientID: keepId };
  }

  const mergedKeep: Patient = { ...keep, prescribingDoctorIDs: [...new Set([...keep.prescribingDoctorIDs, ...remove.prescribingDoctorIDs])] };
  const patients = { ...state.patients, [keepId]: mergedKeep };
  delete patients[removeId];

  return { ...state, patients, notesByPatient, authorisations };
}

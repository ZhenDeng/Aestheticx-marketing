// Faithful TypeScript port of the iOS app's AXDomain models.
// Source of truth: AestheticXKit/Sources/AXDomain/{Models,Authorisations}.swift.
// Enum raw values match the Swift `rawValue`s so the shapes stay wire-compatible.

import type { FormTemplateKind, SigningChannel } from "./forms";
import type { AftercareCategory } from "./aftercare";

export type Role = "doctor" | "nurse" | "clinicAdmin" | "superAdmin";

export interface UserRef {
  id: string;
  name: string;
}

export interface ClinicRef {
  id: string;
  name: string;
}

export type PracticeContext =
  | { kind: "independent" }
  | { kind: "clinic"; clinic: ClinicRef };

export interface Identity {
  user: UserRef;
  role: Role;
  context: PracticeContext;
}

export type PatientOwner =
  | { kind: "doctor"; id: string }
  | { kind: "nurse"; id: string }
  | { kind: "clinic"; id: string };

export interface DateOfBirth {
  year: number;
  month: number;
  day: number;
}

export type ProductCategory =
  | "neurotoxin"
  | "haFiller"
  | "skinBooster"
  | "collagenStimulator"
  | "prpPrf"
  | "other";

export type ProductUnit = "units" | "millilitres" | "vial" | "syringe" | "tube" | "freeText";

export interface MedicationItem {
  name: string;
  dosage: string;
  category: ProductCategory;
  brand?: string;
  unit: ProductUnit;
  areas: string[];
  timing?: string;
}

export interface Patient {
  id: string;
  givenName: string;
  lastName: string;
  dateOfBirth: DateOfBirth;
  gender: string;
  address: string;
  phone: string;
  email: string;
  allergies: string;
  currentMedications: string;
  owner: PatientOwner;
  prescribingDoctorIDs: string[];
  alert?: string;
  preferredName?: string;
}

export type RequestStatus = "pending" | "needsEdit" | "approved";

export interface PatientSummary {
  fullName: string;
  dateOfBirth: DateOfBirth;
  allergies: string;
  currentMedications: string;
  alert?: string;
}

export interface AuthorisationRequest {
  id: string;
  patientID: string;
  nurse: UserRef;
  doctorID: string;
  context: PracticeContext;
  items: MedicationItem[];
  status: RequestStatus;
  createdAt: number; // epoch ms
  patientSummary?: PatientSummary;
}

export interface Authorisation {
  id: string;
  requestID: string;
  patientID: string;
  doctorID: string;
  nurseID: string;
  clinicID: string | null;
  medication: MedicationItem;
  repeatsRemaining: number;
  expiresAt: number; // epoch ms
  createdAt: number; // epoch ms — when approved (for invoice month grouping)
  invoiced: boolean; // set true when an invoice includes it
}

export type NoteKind = "general" | "treatment" | "aftercareRecord";

export type DeliveryStatus = "queued" | "delivered" | "failed";

export interface TreatmentMedication {
  name: string;
  batch?: string;
  expiry?: string;
  dosage?: string;
}

export interface Note {
  id: string;
  patientID: string;
  kind: NoteKind;
  title: string;
  body: string;
  createdAt: number; // epoch ms
  authorID: string;
  authorBadge: string;
  consumedAuthorisationIDs: string[];
  medications: TreatmentMedication[];
  deliveryStatus?: DeliveryStatus;       // aftercare records only
  aftercareCategories?: AftercareCategory[]; // audit trail of an aftercare send
}

export interface NoteTemplate {
  id: string;
  ownerID: string; // private to this user
  name: string;
  body: string;
  aftercareCategories: AftercareCategory[];
}

export type FollowUpStatus = "pending" | "done" | "ignored";

export interface FollowUpTask {
  id: string;
  ownerID: string;
  patientID: string;
  patientName: string; // denormalised for display
  dueDateISO: string; // "yyyy-MM-dd" (UTC)
  status: FollowUpStatus;
  sourceNoteID?: string;
}

export interface FollowUpSettings {
  enabled: boolean;
  intervalDays: number;
}

export type AppointmentType = "authSlot" | "treatment";
export type AppointmentStatus =
  | "awaitingConfirmation"
  | "confirmed"
  | "completed"
  | "noShow"
  | "cancelled";

// A new-patient lead captured at booking for a patient not yet on file (spec: appointments —
// nurse slot booking / add-appointment). Mirrors the backend appointment doc's lead record;
// dob is ISO yyyy-mm-dd (the wire format every producer emits, e.g. the public booking form).
export interface AppointmentLead {
  givenName: string;
  lastName: string;
  dob?: string; // ISO yyyy-mm-dd
  phone?: string;
  email?: string;
}

export interface Appointment {
  id: string;
  type: AppointmentType;
  ownerID: string;
  dateISO: string; // yyyy-mm-dd
  startMinute: number;
  endMinute: number;
  status: AppointmentStatus;
  patientID?: string;
  patientName?: string;
  lead?: AppointmentLead; // set only while no patientID (cleared on linking)
  appointmentNote?: string;
}

// A doctor's published availability window for authorisation teleconsults. Bookable 10-min
// slots are derived from [startMinute, endMinute); doctorName is denormalised at publish.
export interface AvailabilityWindow {
  id: string;
  doctorID: string;
  doctorName: string;
  dateISO: string; // yyyy-mm-dd
  startMinute: number;
  endMinute: number;
}

// A clinician's treatment working schedule (feedback: treatment availability windows).
// `days` is indexed Mon-first (0=Mon … 6=Sun) to match calendar.ts isoWeekday. A treatment
// appointment is bookable only on an open day, within [openMinute, closeMinute), and not
// overlapping a block. Distinct from AvailabilityWindow (authorisation teleconsult slots).
export interface DaySchedule {
  open: boolean;
  openMinute: number;  // minutes from midnight, e.g. 540 = 09:00
  closeMinute: number; // e.g. 1020 = 17:00
}
export interface TreatmentBlock {
  id: string;
  dateISO: string; // yyyy-mm-dd
  startMinute: number;
  endMinute: number;
}
export interface TreatmentAvailability {
  ownerID: string;
  days: DaySchedule[]; // length 7, index = isoWeekday (0=Mon … 6=Sun)
  blocks: TreatmentBlock[];
}

// A doctor's online/always-accept status for authorisation requests (feedback: doctor online
// status + always-on authorisations). Independent booleans — always-accept works even while
// offline (spec: "Always-accept overrides availability"). Absent entry -> both false.
export interface DoctorStatus {
  online: boolean;
  alwaysAcceptAuth: boolean;
}

export interface RepeatUsage {
  authorisationID: string;
  patientID: string;
  clinicID: string | null;
  nurseID: string;
  date: number;
}

export interface FormAnswer {
  questionID: string;
  answer: boolean;
  detail: string;
}

export interface SignedFormRecord {
  id: string;
  patientID: string;
  template: FormTemplateKind;
  channel: SigningChannel;
  signedAt: number;
  answers: FormAnswer[];
  intro: string;       // snapshot of the template text at signing
  clauses: string[];   // snapshot
  signatureFileId?: string;   // live: Storage path
  signatureDataUrl?: string;  // demo only: inline PNG data URL (never written to Firestore)
  pdfFileId?: string;
}

export interface DemoState {
  patients: Record<string, Patient>;
  requests: Record<string, AuthorisationRequest>;
  authorisations: Record<string, Authorisation>;
  notesByPatient: Record<string, Note[]>;
  appointments: Record<string, Appointment>;
  usages: RepeatUsage[];
  formsByPatient: Record<string, SignedFormRecord[]>;
  invoices: import("./invoicing").Invoice[];
  scriptPricing: Record<string, number>; // "{doctorID}_{counterpartyID}" -> cents
  noteTemplatesByOwner: Record<string, NoteTemplate[]>;
  followUpTasksByID: Record<string, FollowUpTask>;
  followUpSettingsByUser: Record<string, FollowUpSettings>;
  bookingTokensByUser: Record<string, string>;
  availabilityWindows: Record<string, AvailabilityWindow>;
  treatmentAvailabilityByOwner: Record<string, TreatmentAvailability>;
  doctorStatusByID: Record<string, DoctorStatus>;
}

// --- Pure display helpers (port of Patient computed properties) ---

function trimmedPreferred(p: Patient): string | undefined {
  const t = p.preferredName?.trim();
  return t ? t : undefined;
}

export function fullName(p: Patient): string {
  return `${p.givenName} ${p.lastName}`;
}

export function displayName(p: Patient): string {
  const pref = trimmedPreferred(p);
  return pref ? `${p.givenName} '${pref}' ${p.lastName}` : fullName(p);
}

export function calendarName(p: Patient): string {
  const pref = trimmedPreferred(p);
  return pref ? `${pref} ${p.lastName}` : fullName(p);
}

export function hasAlert(p: Patient): boolean {
  return (p.alert ?? "").trim().length > 0;
}

export function identityBadge(identity: Identity): string {
  return identity.context.kind === "clinic"
    ? `${identity.user.name} @ ${identity.context.clinic.name}`
    : identity.user.name;
}

export type PatientField =
  | "givenName" | "lastName" | "dateOfBirth" | "gender"
  | "address" | "phone" | "email" | "allergies" | "currentMedications";

// All-string form state for the intake/edit form (dob held separately).
export interface PatientDraft {
  givenName: string;
  lastName: string;
  preferredName: string;
  dateOfBirth: DateOfBirth | null;
  gender: string; // "" | "Male" | "Female" | "Other"
  address: string;
  phone: string;
  email: string;
  allergies: string;
  currentMedications: string;
  alert: string;
}

export function emptyDraft(): PatientDraft {
  return {
    givenName: "", lastName: "", preferredName: "", dateOfBirth: null, gender: "",
    address: "", phone: "", email: "", allergies: "", currentMedications: "", alert: "",
  };
}

export function draftFromPatient(p: Patient): PatientDraft {
  return {
    givenName: p.givenName, lastName: p.lastName, preferredName: p.preferredName ?? "",
    dateOfBirth: p.dateOfBirth, gender: p.gender, address: p.address, phone: p.phone,
    email: p.email, allergies: p.allergies, currentMedications: p.currentMedications,
    alert: p.alert ?? "",
  };
}

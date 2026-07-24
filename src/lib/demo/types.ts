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
  /** Street address — the clinic's fixed premise of administration (round 6). Demo-side
   *  convenience; live documents resolve it from the clinics/{id} doc server-side. */
  address?: string;
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

// First-class Business Entity (Tier 3 #4), keyed by the existing ownerId (doctor/nurse uid or clinic
// id). The public business identity behind an owner — business name + ABN, used for invoice/document
// display. Carries NO contact PII (email/address stay on the access-scoped user/clinic docs; the
// `businessEntities` collection is readable by any signed-in user). Mirrors the backend `BusinessEntityDoc`.
export type BusinessEntityType = "clinic" | "independentNurse" | "independentDoctor";
export interface BusinessEntity {
  id: string;
  type: BusinessEntityType;
  legalName: string;
  tradingName?: string;
  abn: string;
  isActive: boolean;
}

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

// Clause 68C route of administration (round 6). Wire strings mirror the backend's
// ROUTES_OF_ADMINISTRATION / iOS RouteOfAdministration.rawValue — exactly these five are
// ever accepted on new items; legacy items may have none (renderers print an em dash).
export const ROUTES_OF_ADMINISTRATION = [
  "intradermal", "subdermal", "subcutaneous", "intramuscular", "supraPeriosteal",
] as const;
export type RouteOfAdministration = (typeof ROUTES_OF_ADMINISTRATION)[number];

/** Display labels printed on documents — must match backend ROUTE_DISPLAY_LABELS. */
export const ROUTE_DISPLAY_LABELS: Record<RouteOfAdministration, string> = {
  intradermal: "Intradermal",
  subdermal: "Subdermal",
  subcutaneous: "Subcutaneous",
  intramuscular: "Intramuscular",
  supraPeriosteal: "Supra-periosteal",
};

/** Label for a route wire string; raw passthrough for unknown values; null when absent. */
export function routeLabel(route: string | null | undefined): string | null {
  if (route == null || route === "") return null;
  return ROUTE_DISPLAY_LABELS[route as RouteOfAdministration] ?? route;
}

export interface MedicationItem {
  name: string;
  dosage: string;
  category: ProductCategory;
  brand?: string;
  unit: ProductUnit;
  areas: string[];
  timing?: string;
  /** Route of administration wire string (round 6); absent on legacy items. */
  route?: string;
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
  // Doctors with an open (pending/needsEdit) request for this patient — granted read-only
  // file access while they review (spec 2026-07-07 reviewer-file-access). Maintained
  // server-side (Firestore trigger) / by the demo backend; cleared on approval, where
  // access continues via prescribingDoctorIDs. Mirrors the persisted `openReviewerDoctorIds`.
  // Optional: patient docs created before this feature (and older fixtures) simply have none.
  openReviewerDoctorIDs?: string[];
  // Patient photo (spec: patient-records — monogram until one is uploaded). Mirrors iOS
  // Patient.avatarFileID / the patient doc's `avatarFileId`: a Storage object key under
  // patients/{id}/** minted fresh per upload (iOS mints a new fileID per pick too).
  avatarFileId?: string;
  // Demo only: inline preview bytes (no Storage in demo) — never encoded to Firestore.
  avatarDataUrl?: string;
  alert?: string;
  preferredName?: string;
}

export type RequestStatus = "pending" | "needsEdit" | "approved" | "withdrawn";

export interface PatientSummary {
  fullName: string;
  dateOfBirth: DateOfBirth;
  allergies: string;
  currentMedications: string;
  alert?: string;
}

// A premise of administration (round 6): a named location an independent RN works
// from. Rows live on users/{uid}.premises; a copy is STAMPED onto each authorisation
// request at submission (immutable afterwards — documents must reflect the premise at
// request time even if the nurse later edits/deletes it). Mirrors backend PremiseStamp.
export interface Premise {
  id: string;
  name: string;
  address: string;
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
  /** Premise of administration stamped at submission (round 6); absent on legacy/clinic requests. */
  premise?: Premise | null;
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
  /** Approval time — the Clause 68C "date the prescriber reviewed the patient" (round 6).
   *  Absent on authorisations approved before the stamp existed. */
  reviewedAt?: number;
  /** Party names denormalised AT APPROVAL for the Clause 68C direction — the prescriber who
   *  authorised and the nurse responsible. Stamped rather than resolved at render time: the
   *  document must name the parties as they were at authorisation, and a nurse exporting in
   *  live mode cannot read the doctor's users doc to look one up. Absent on authorisations
   *  approved before the stamp existed — directionPrescriberName/directionResponsibleProvider
   *  fall back to the cooperation directory, then fail closed. */
  doctorName?: string;
  nurseName?: string;
  /** Copy of the request's stamped premise (round 6); absent on legacy documents. */
  premise?: Premise | null;
  /** The clinic's premises, stamped at approval (2026-07-18) — the Clause 68C "premises of
   *  administration" for a clinic authorisation. Stamped rather than looked up because
   *  clinics/{id} is readable only to clinic members, so an independent cooperating doctor
   *  exporting this direction could not resolve it. Absent for independent authorisations and on
   *  authorisations approved before the stamp existed. */
  clinicPremise?: Premise;
  /** Prescriber contact stamped at approval by approveRequest (Clause 68C direction). Absent on
   *  authorisations approved before the stamp shipped, and when the profile field was blank. */
  prescriberPhone?: string;
  prescriberPrincipalPlace?: string;
}

export type NoteKind = "general" | "treatment" | "aftercareRecord";

export interface TreatmentMedication {
  name: string;
  batch?: string;
  expiry?: string;
  dosage?: string;
}

// A note's photo/file attachment (spec: clinical-notes — photo and file attachments).
// Mirrors the iOS Attachment: fileID is the Storage object key and never changes after
// upload; renaming touches only displayName. dataUrl is DEMO-ONLY inline preview bytes
// (the demo has no Storage) — never encoded to Firestore.
export interface NoteAttachment {
  fileID: string;
  displayName: string;
  mimeType: string;
  dataUrl?: string;
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
  attachments?: NoteAttachment[];        // absent on legacy/aftercare notes
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

// Follow-up interval presets (Tier 3 #2). Named presets replace the old free 1–90 day number;
// `custom` falls back to `customDays`. `perTreatment` optionally overrides the interval per product
// category (of the consumed authorisations). `intervalDays` is KEPT as a derived mirror of the global
// preset for back-compat (iOS + any un-migrated reader still read the single `followUpIntervalDays`).
export type FollowUpNamedPreset = "2wk" | "2mo" | "4mo" | "6mo";
export type FollowUpPreset = FollowUpNamedPreset | "custom";
export interface FollowUpSettings {
  enabled: boolean;
  preset: FollowUpPreset;
  customDays?: number; // used only when preset === "custom" (clamped 1–90)
  perTreatment?: Partial<Record<ProductCategory, FollowUpNamedPreset>>;
  intervalDays: number; // derived from the GLOBAL preset — back-compat mirror field
}

// Per-clinician appointment-reminder lead time: email the patient this many days before the
// appointment. 0 = no reminder. Deliberately a small enum (None / 1 day / 2 days).
export type AppointmentReminderLead = 0 | 1 | 2;

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
  // The booker's calendar scope for an auth slot (appointmentOwnerScope of the booking nurse:
  // their user id, or the clinic id when booked in a clinic context). Lets the booked auth also
  // show on the nurse's/clinic's calendar — not just the doctor-owner's. Unset for self-booked
  // treatment appointments. The booker may reschedule or cancel the auth slot (15/07 feedback,
  // canManageAppointment); completed/noShow stay the owner's call.
  bookedByID?: string;
  dateISO: string; // yyyy-mm-dd
  startMinute: number;
  endMinute: number;
  status: AppointmentStatus;
  patientID?: string;
  patientName?: string;
  lead?: AppointmentLead; // set only while no patientID (cleared on linking)
  appointmentNote?: string;
  // Where the booking came from: "google" = ingested from a linked Google calendar
  // (e.g. the clinic's Google booking page); absent or "manual" = created in-app.
  source?: "manual" | "google";
  // The Google event behind a mirrored or ingested appointment — the server's dedupe
  // and reconciliation key. Read-only on the web; written by the sync Functions.
  externalCalendarRef?: { provider: "google"; eventId: string };
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

// A busy block on a linked external calendar (Google via syncGoogleCalendar, Apple via the
// iOS device path), expressed as absolute instants — the owner's IANA zone on the calendar
// doc makes the local-day conversion DST-correct (mirrors backend calendarSync.ts).
export interface ExternalBusyEvent {
  startISO: string; // RFC3339 instant
  endISO: string;
  transparent?: boolean; // "free" events must not block
  id?: string;
}
export interface ExternalBusyCalendar {
  ownerID: string;
  timeZone: string; // IANA
  events: ExternalBusyEvent[];
  updatedAtMillis?: number;
}

// A doctor's standing opt-in to ad-hoc authorisation requests (requests with no booked slot).
// 20/07: the old transient "I'm online now" flag was removed — it was OR'd with this one in
// every gate, so it duplicated this switch while implying a presence indicator that nothing
// ever displayed. Absent entry -> false.
export interface DoctorStatus {
  alwaysAcceptAuth: boolean;
}

// The signed-in user's own profile fields on users/{uid}. Wire names match the
// createUser Cloud Function's profile doc (abn, phone, ahpra); address is a
// rules-writable extension. abn is client-immutable (firestore.rules), and
// roles/clinics/mustChangePassword never live here — they change server-side only.
export interface UserProfile {
  ahpra: string;   // doctor/nurse registration; empty for admins
  abn: string;     // display-only on the client (rules-immutable)
  phone: string;
  address: string;
  /** Doctors: the Clause 68C principal place of practice (round 6). */
  principalPlace: string;
  /** Nurses: premises of administration (round 6); empty for other roles. */
  premises: Premise[];
  defaultPremiseId?: string;
  /** The active premise — persists across sign-outs on the users doc (most-recent
   *  selection wins until changed; falls back to default when missing/dangling). */
  selectedPremiseId?: string;
  avatarFileId?: string;  // live: Storage object under users/{uid}/** (storage.rules avatar path)
  avatarDataUrl?: string; // demo only: inline preview bytes (never written to Firestore)
}

// The client-writable subset — mirrors the users/{uid} update rule, which rejects
// any write touching roles/clinics/abn/mustChangePassword.
export type UserProfileEdit = Partial<Pick<UserProfile,
  "ahpra" | "phone" | "address" | "principalPlace" | "premises" | "defaultPremiseId" | "selectedPremiseId" | "avatarFileId" | "avatarDataUrl">>;

// One row of the super-admin account inventory. Live: a users/{uid} doc (rules allow
// superAdmin to list the collection); demo: derived from DEMO_ACCOUNTS. mustChangePassword
// true means the account still holds its temporary password (createUser sets it; the
// user's first login clears it).
export interface AccountRecord {
  id: string;
  name: string;
  email: string; // "" for demo-cast accounts (the demo has no sign-in emails)
  roles: Role[];
  // Clinics this account belongs to (users doc `clinics` map keys in live; clinic identity
  // contexts in the demo seed). Lets the console resolve a clinic-keyed business entity to
  // the account that administers it (20/07 feedback: entities live on account rows).
  clinicIDs?: string[];
  mustChangePassword: boolean;
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

export type CounterpartyType = "nurse" | "clinic";
export type RelationshipStatus = "active" | "inactive";
// Doctor↔clinic relationships carry a SET of kinds (19/07 feedback, kind-set rework): an
// employee works at the clinic (grants clinic membership + identity); a prescriber authorises
// for it externally (gate + pricing, no membership). The kinds are not mutually exclusive —
// a doctor can be both — but a clinic relationship always has at least one. Nurse
// relationships carry no kinds.
export type RelationshipKind = "employee" | "prescriber";
// Canonical display/storage order; also the closed enum used to sanitise decoded values.
export const RELATIONSHIP_KINDS: readonly RelationshipKind[] = ["employee", "prescriber"];

// A doctor ↔ (nurse|clinic) cooperation relationship (spec 2026-07-08 cooperation-relationships,
// constitution §17). Gates which doctors a nurse/clinic may request authorisation from
// (status active && authRequestsAllowed) and carries the pricing override + invoice-applies flag
// folded from scriptPricing. Function-only writes in live; deterministic id so admin edits upsert.
export interface CooperationRelationship {
  id: string; // `${doctorID}_${counterpartyType}_${counterpartyID}`
  doctorID: string;
  doctorName: string;         // denormalised for display
  counterpartyType: CounterpartyType;
  counterpartyID: string;     // nurse uid or clinic id
  counterpartyName: string;   // denormalised
  relationshipKinds?: RelationshipKind[]; // clinic counterparties only; absent ⇒ ["employee"] (pre-kind docs)
  status: RelationshipStatus;
  authRequestsAllowed: boolean;
  invoiceApplies: boolean;
  priceCentsOverride: number | null; // null ⇒ DEFAULT_SCRIPT_PRICE_CENTS
  createdAt: number;
  updatedAt: number;
}

// The kind set a relationship effectively has, in canonical order: clinic relationships
// default to ["employee"] (every pre-kind doc was created under grant-membership semantics,
// and an empty/garbled set must not silently revoke); nurse relationships have none.
export function effectiveRelationshipKinds(
  rel: Pick<CooperationRelationship, "counterpartyType" | "relationshipKinds">,
): RelationshipKind[] | null {
  if (rel.counterpartyType !== "clinic") return null;
  const kinds = RELATIONSHIP_KINDS.filter((k) => rel.relationshipKinds?.includes(k));
  return kinds.length > 0 ? kinds : ["employee"];
}

export type RelationshipAction = "created" | "updated" | "removed";
// One entry in a relationship's change history (constitution §17 "history should be auditable").
export interface RelationshipAuditEntry {
  id: string;
  relationshipID: string;
  actorID: string;   // the acting super admin
  actorName: string;
  action: RelationshipAction;
  summary: string;   // human-readable, e.g. "created · active · price $30.00 · invoicing on"
  at: number;
}

// The platform audit log's action verbs (constitution §21). Matches the backend `auditLog`
// doc's `action` field one-for-one — keep in sync with the writer (separate backend repo).
export type AuditAction =
  | "request_created"
  | "request_resubmitted"
  | "request_withdrawn"
  | "request_edit_requested"
  | "request_approved"
  | "invoice_generated"
  | "invoice_marked_paid"
  | "invoice_deleted"
  | "wallet_topup"
  | "client_checkout"
  | "service_fee_finalized"
  | "service_invoice_issued"
  | "client_invoice_issued"
  | "user_created"
  | "user_deleted"
  | "admin_patient_access";

// One durable platform-audit-log entry (constitution §21). Mirrors the backend `auditLog`
// collection doc: the acting identity + a human-readable summary are denormalised so the log
// renders standalone. Append-only — each action is its own event. Supersedes the old
// admin-access-only entry: admin patient-file access is now one action among many.
export interface AuditLogEntry {
  id: string;
  actorID: string;
  actorName: string;      // denormalised at write for display
  actorRole: string;      // the acting identity's role at the time
  action: AuditAction;
  targetType: string | null; // e.g. "patient" | "request" | "invoice"
  targetID: string | null;
  summary: string;        // human-readable, e.g. "opened Danni Wang"
  at: number;
}

export type EmergencyKind = "adrenaline" | "hyaluronidase";

// An automatically-generated emergency standing authorisation (spec 2026-07-08 emergency-
// authorisations). Created/refreshed on every approval: Adrenaline always; Hyaluronidase for
// HA fillers. Deterministic id `${patientID}_${doctorID}_${kind}` — one per patient per
// prescribing doctor per kind, so a repeat approval refreshes rather than duplicates. Not
// billable, no repeats — deliberately separate from Authorisation.
export interface EmergencyAuthorisation {
  id: string;
  patientID: string;
  doctorID: string;
  doctorName: string; // denormalised at issue for display
  kind: EmergencyKind;
  createdAt: number;   // first issued (preserved across refreshes)
  refreshedAt: number; // last approval that refreshed it
  expiresAt: number;   // refreshedAt + EMERGENCY_VALIDITY_MONTHS
  sourceAuthorisationIDs: string[]; // audit trail of triggering authorisations
}

// --- Billing matrix: price lists, service fees, patient wallets (change: multi-tenant-billing-matrix) ---

/** Stable key for a data silo: `${kind}:${id}` (e.g. "nurse:u-sarah", "clinic:clinic-lumiere"). */
export function ownerKeyOf(owner: PatientOwner): string {
  return `${owner.kind}:${owner.id}`;
}

// One sellable row of a silo's fee schedule / retail price list. Prices are
// GST-INCLUSIVE retail (what the client pays) — see computeInclusiveTotals.
export interface PriceListItem {
  id: string;
  kind: "service" | "product";
  name: string;
  priceCents: number;
}

// Append-only wallet ledger entry for a client's account balance. The balance is always
// derived (Σ credits − Σ drawdowns), never stored — no drift. A top-up keeps the cash and
// promotional portions as separate integer-cent fields so they stay independently
// auditable inside the one entry (spec: patient-wallet).
export type WalletEntry =
  | {
      id: string;
      kind: "topup";
      paidCents: number;
      giftCents: number;
      totalCreditCents: number;
      invoiceID: string;
      by: string;
      at: number;
    }
  | { id: string; kind: "drawdown"; amountCents: number; invoiceID: string; by: string; at: number };

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
  appointmentReminderByUser: Record<string, AppointmentReminderLead>;
  bookingTokensByUser: Record<string, string>;
  availabilityWindows: Record<string, AvailabilityWindow>;
  treatmentAvailabilityByOwner: Record<string, TreatmentAvailability>;
  doctorStatusByID: Record<string, DoctorStatus>;
  externalBusyByOwner: Record<string, ExternalBusyCalendar>;
  // users/{uid}.lastCalledDoctorId — set whenever the user starts a consult call.
  lastCalledDoctorByUser: Record<string, string>;
  // users/{uid} profile fields (ahpra/abn/phone/address + avatar) keyed by user id. `address`
  // here is the per-user default/fallback; per-identity overrides live in addressByIdentity.
  profileByUser: Record<string, UserProfile>;
  // Per-identity address overrides (owner feedback #2), keyed by
  // `${user.id}:${identityKey(identity)}` — the same user practising under a different
  // role/context can hold a different address. Falls back to profileByUser[uid].address.
  addressByIdentity: Record<string, string>;
  // Super-admin account inventory (live: every users/{uid} doc; demo: the demo cast).
  accountsByID: Record<string, AccountRecord>;
  // Auto-generated emergency standing authorisations, keyed by `${patientID}_${doctorID}_${kind}`.
  emergencyAuthorisationsByID: Record<string, EmergencyAuthorisation>;
  // Cooperation relationships (spec 2026-07-08) keyed `${doctorID}_${counterpartyType}_${counterpartyID}`,
  // and their append-only change audit.
  cooperationRelationshipsByID: Record<string, CooperationRelationship>;
  relationshipAuditByID: Record<string, RelationshipAuditEntry>;
  // Platform audit log (constitution §21). Append-only; durable in live (hydrated from the
  // Firestore `auditLog` collection, superAdmin-read only) and in-session in demo. Admin
  // patient-file access (constitution §16) is one action among many recorded here.
  auditLogByID: Record<string, AuditLogEntry>;
  // Admin-editable prescribing catalog (Tier 3 #5B), keyed by product slug. Live: hydrated from the
  // Firestore `products` collection. Demo: currently empty (like live pre-hydrate); selection falls
  // back to the built-in PRODUCT_CATALOG via `effectiveCatalog`. The upcoming super-admin editor slice
  // will seed this from PRODUCT_CATALOG in demo so demo edits have a dataset to act on.
  productsByID: Record<string, import("./catalog").CatalogProduct>;
  // First-class Business Entities (Tier 3 #4), keyed by ownerId. Live: hydrated from the world-
  // readable Firestore `businessEntities` collection. Demo: empty until the editor slice seeds it.
  // Invoices carry their own issuer/billTo snapshot, so this map feeds the admin editor + identity
  // display rather than invoice rendering.
  businessEntitiesByID: Record<string, BusinessEntity>;
  // Clinic directory (spec: cooperation-linking), keyed by clinic id. Live: super-admin
  // hydration reads the `clinics` collection (rules: member or superAdmin) for the admin
  // console's clinic pickers; empty for everyone else. Demo: seeds Lumière.
  clinicsByID: Record<string, ClinicRef>;
  // Billing matrix (change: multi-tenant-billing-matrix). Demo-mode-first — live mode
  // gates these features off until the backend repo ships collections + callables.
  /** Per-silo fee schedule / retail price list, keyed by ownerKeyOf(owner). */
  priceListByOwner: Record<string, PriceListItem[]>;
  /** Fixed per-session labor fee (手工费) in GST-exclusive cents, keyed `${clinicID}_${practitionerUid}`. */
  serviceFeeCentsByPair: Record<string, number>;
  /** Append-only wallet ledger per client. The client's silo is its patient's owner. */
  walletByPatientID: Record<string, WalletEntry[]>;
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

// "Sarah Chen @ Lumière Clinic". A clinic whose name could not be resolved yields a BLANK name
// (never the clinic id — see identitiesFromClaims), so drop the "@" clause rather than render a
// dangling separator.
export function identityBadge(identity: Identity): string {
  if (identity.context.kind !== "clinic") return identity.user.name;
  const clinic = identity.context.clinic.name.trim();
  return clinic ? `${identity.user.name} @ ${clinic}` : identity.user.name;
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

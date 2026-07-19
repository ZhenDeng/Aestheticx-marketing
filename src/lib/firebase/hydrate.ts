"use client";

import {
  collection, query, where, getDocs, doc, getDoc, type QueryConstraint,
} from "firebase/firestore";
import { FirebaseError } from "firebase/app";
import { firestore } from "./client";
import { mapPatient, mapNote, mapAuthorisation, mapAuthRequest, mapAppointment, mapForm, mapInvoice, mapNoteTemplate, mapFollowUpTask, mapAvailabilityWindow, mapTreatmentAvailability, mapExternalBusy, mapAccount, mapEmergencyAuthorisation, mapCooperationRelationship, mapRelationshipAudit, mapAuditLogEntry, mapProduct, mapBusinessEntity, mapClinic, mapPremise } from "./mappers";
import type { AppointmentReminderLead, DemoState, FollowUpSettings, Premise, UserProfile } from "@/lib/demo/types";
import { readFollowUpSettings } from "@/lib/demo/backend";
import type { DemoClaims } from "./identity";

export interface Row { id: string; data: Record<string, unknown> }
export interface HydrationRows {
  patients: Row[];
  notesByPatient: Record<string, Row[]>;
  authorisations: Row[];
  requests: Row[];
  appointments: Row[];
  formsByPatient: Record<string, Row[]>;
  invoices: Row[];
  scriptPricing: Row[];
  noteTemplates: Row[];
  followUpTasks: Row[];
  followUpSettings: FollowUpSettings | null;
  appointmentReminderLead: AppointmentReminderLead | null;
  bookingToken: string | null;
  doctorStatus: { online: boolean; alwaysAcceptAuth: boolean };
  lastCalledDoctorId?: string | null;
  /** users/{uid} profile fields (null when the doc is missing). */
  profile?: UserProfile | null;
  slotPublications?: Row[];
  treatmentAvailability?: Row[];
  externalBusy?: Row[];
  /** users collection rows — super-admin hydration only (rules gate the list to that role). */
  accounts?: Row[];
  emergencyAuthorisations?: Row[];
  cooperationRelationships?: Row[];
  relationshipAudit?: Row[];
  /** auditLog rows — super-admin hydration only (rules gate the read to that role). */
  auditLog?: Row[];
  /** products rows — the admin-editable catalog (Tier 3 #5B), readable by any signed-in user. */
  products?: Row[];
  /** businessEntities rows — first-class entity + ABN (Tier 3 #4), readable by any signed-in user. */
  businessEntities?: Row[];
  /** clinics rows — the clinic directory for admin pickers; super-admin hydration only. */
  clinics?: Row[];
  currentUserID: string;
}

// Pure: rows -> DemoState (testable, no Firebase).
export function assembleState(rows: HydrationRows): DemoState {
  const patients: DemoState["patients"] = {};
  for (const r of rows.patients) patients[r.id] = mapPatient(r.id, r.data);

  const notesByPatient: DemoState["notesByPatient"] = {};
  for (const [pid, list] of Object.entries(rows.notesByPatient)) {
    notesByPatient[pid] = list.map((n) => mapNote(n.id, pid, n.data));
  }

  const authorisations: DemoState["authorisations"] = {};
  for (const r of rows.authorisations) authorisations[r.id] = mapAuthorisation(r.id, r.data);

  const requests: DemoState["requests"] = {};
  for (const r of rows.requests) requests[r.id] = mapAuthRequest(r.id, r.data);

  const appointments: DemoState["appointments"] = {};
  for (const r of rows.appointments) appointments[r.id] = mapAppointment(r.id, r.data);

  const formsByPatient: DemoState["formsByPatient"] = {};
  for (const [pid, list] of Object.entries(rows.formsByPatient)) {
    formsByPatient[pid] = list.map((f) => mapForm(f.id, pid, f.data));
  }

  const invoices = rows.invoices.map((r) => mapInvoice(r.id, r.data));
  const scriptPricing: DemoState["scriptPricing"] = {};
  for (const r of rows.scriptPricing) {
    const cents = typeof r.data.priceCents === "number" ? r.data.priceCents : 0;
    if (cents > 0) scriptPricing[r.id] = cents; // doc id is "{doctorId}_{counterpartyId}"
  }
  const noteTemplatesByOwner: DemoState["noteTemplatesByOwner"] = {};
  for (const r of rows.noteTemplates) {
    const t = mapNoteTemplate(r.id, r.data);
    (noteTemplatesByOwner[t.ownerID] ??= []).push(t);
  }
  const followUpTasksByID: DemoState["followUpTasksByID"] = {};
  for (const r of rows.followUpTasks) followUpTasksByID[r.id] = mapFollowUpTask(r.id, rows.currentUserID, r.data);
  const followUpSettingsByUser: DemoState["followUpSettingsByUser"] = {};
  if (rows.followUpSettings) followUpSettingsByUser[rows.currentUserID] = rows.followUpSettings;
  const appointmentReminderByUser: DemoState["appointmentReminderByUser"] = {};
  if (rows.appointmentReminderLead != null) appointmentReminderByUser[rows.currentUserID] = rows.appointmentReminderLead;
  const bookingTokensByUser: DemoState["bookingTokensByUser"] = {};
  if (rows.bookingToken) bookingTokensByUser[rows.currentUserID] = rows.bookingToken;
  const lastCalledDoctorByUser: DemoState["lastCalledDoctorByUser"] = {};
  if (rows.lastCalledDoctorId) lastCalledDoctorByUser[rows.currentUserID] = rows.lastCalledDoctorId;

  // The caller's own published auth-slot windows (slotPublications where doctorId == uid).
  const availabilityWindows: DemoState["availabilityWindows"] = {};
  for (const r of rows.slotPublications ?? []) availabilityWindows[r.id] = mapAvailabilityWindow(r.id, r.data);

  const treatmentAvailabilityByOwner: DemoState["treatmentAvailabilityByOwner"] = {};
  for (const r of rows.treatmentAvailability ?? []) treatmentAvailabilityByOwner[r.id] = mapTreatmentAvailability(r.id, r.data);

  const doctorStatusByID: DemoState["doctorStatusByID"] = { [rows.currentUserID]: rows.doctorStatus };

  const externalBusyByOwner: DemoState["externalBusyByOwner"] = {};
  for (const r of rows.externalBusy ?? []) externalBusyByOwner[r.id] = mapExternalBusy(r.id, r.data);

  const profileByUser: DemoState["profileByUser"] = {};
  if (rows.profile) profileByUser[rows.currentUserID] = rows.profile;

  const accountsByID: DemoState["accountsByID"] = {};
  for (const r of rows.accounts ?? []) accountsByID[r.id] = mapAccount(r.id, r.data);

  const emergencyAuthorisationsByID: DemoState["emergencyAuthorisationsByID"] = {};
  for (const r of rows.emergencyAuthorisations ?? []) emergencyAuthorisationsByID[r.id] = mapEmergencyAuthorisation(r.id, r.data);

  const cooperationRelationshipsByID: DemoState["cooperationRelationshipsByID"] = {};
  for (const r of rows.cooperationRelationships ?? []) cooperationRelationshipsByID[r.id] = mapCooperationRelationship(r.id, r.data);
  const relationshipAuditByID: DemoState["relationshipAuditByID"] = {};
  for (const r of rows.relationshipAudit ?? []) relationshipAuditByID[r.id] = mapRelationshipAudit(r.id, r.data);

  // Platform audit log (§21): durable Firestore `auditLog` collection, read + decoded only in
  // the super-admin hydration path (rules gate the read to that role) — {} for everyone else.
  const auditLogByID: DemoState["auditLogByID"] = {};
  for (const r of rows.auditLog ?? []) auditLogByID[r.id] = mapAuditLogEntry(r.id, r.data);

  // Admin-editable catalog (Tier 3 #5B): decode the hydrated products. Empty (no rows, or the
  // read failed) leaves selection to fall back to the static list via effectiveCatalog.
  const productsByID: DemoState["productsByID"] = {};
  for (const r of rows.products ?? []) productsByID[r.id] = mapProduct(r.id, r.data);

  // First-class Business Entities (Tier 3 #4): decode the hydrated entities. Empty (no rows, or the
  // read failed) — invoices carry their own snapshot, so an empty map degrades gracefully.
  const businessEntitiesByID: DemoState["businessEntitiesByID"] = {};
  for (const r of rows.businessEntities ?? []) businessEntitiesByID[r.id] = mapBusinessEntity(r.id, r.data);

  // Clinic directory (spec: cooperation-linking): super-admin hydration only — {} for
  // everyone else, and the admin console's clinic pickers are the sole consumer.
  const clinicsByID: DemoState["clinicsByID"] = {};
  for (const r of rows.clinics ?? []) clinicsByID[r.id] = mapClinic(r.id, r.data);

  // addressByIdentity: per-identity address overrides have no Firestore schema yet (owner
  // feedback #2, live tracked separately) — hydrate empty so live falls back to the per-user
  // address in profileByUser.
  // Billing matrix (price lists / service fees / wallets): no Firestore schema yet — the
  // feature is demo-mode-first (live UI gates it off), so hydrate empty slices.
  return { patients, notesByPatient, authorisations, requests, appointments, usages: [], formsByPatient, invoices, scriptPricing, noteTemplatesByOwner, followUpTasksByID, followUpSettingsByUser, appointmentReminderByUser, bookingTokensByUser, availabilityWindows, treatmentAvailabilityByOwner, doctorStatusByID, externalBusyByOwner, lastCalledDoctorByUser, profileByUser, addressByIdentity: {}, accountsByID, emergencyAuthorisationsByID, cooperationRelationshipsByID, relationshipAuditByID, auditLogByID, productsByID, businessEntitiesByID, clinicsByID, priceListByOwner: {}, serviceFeeCentsByPair: {}, walletByPatientID: {} };
}

async function runQuery(path: string, ...constraints: QueryConstraint[]): Promise<Row[]> {
  const snap = await getDocs(query(collection(firestore(), path), ...constraints));
  return snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }));
}

// Best-effort query for a collection whose read rule may not be deployed yet (the
// emergencyAuthorisations rule ships in a separate backend deploy). Firestore denies a query
// against a collection with no matching allow rule, which would otherwise reject the whole
// hydrate — so a failure here degrades to "none" instead of breaking live loading.
async function runQuerySafe(path: string, ...constraints: QueryConstraint[]): Promise<Row[]> {
  try {
    return await runQuery(path, ...constraints);
  } catch {
    return [];
  }
}

const isPermissionDenied = (e: unknown): boolean =>
  e instanceof FirebaseError && e.code === "permission-denied";

/**
 * A patient's notes, with a provably-safe fallback ("rules are not filters"). The unconstrained
 * list is provable only for full-note-access viewers (owner/clinic staff); for prescriber /
 * reviewer / clinic-doctor visibility the read rule depends on per-doc fields, so Firestore
 * rejects the WHOLE list. On DENIAL (not a transient error — those rethrow so a full-access viewer
 * fails loudly and retries), fall back to the union of treatment notes (provable for anyone who
 * can see the patient) and the viewer's own authored notes (a grant that ships with a later rules
 * deploy: denied → [] until then, deploy-order-safe).
 *
 * Exported for testing. `q` mirrors runQuery: no filter = the wide list; a filter = a constrained
 * query. It must throw a permission-denied FirebaseError when a read is rejected by rules.
 */
export async function notesRowsForPatient(
  notesPath: string,
  uid: string,
  q: (path: string, filter?: { field: string; value: string }) => Promise<Row[]>,
): Promise<Row[]> {
  try {
    return await q(notesPath);
  } catch (e) {
    if (!isPermissionDenied(e)) throw e;
  }
  const treatment = await q(notesPath, { field: "kind", value: "treatment" });
  let own: Row[] = [];
  try {
    own = await q(notesPath, { field: "authorId", value: uid });
  } catch (e) {
    if (!isPermissionDenied(e)) throw e; // authorId grant not deployed yet → [] ; real outage → loud
  }
  const byId = new Map(treatment.map((r) => [r.id, r] as const));
  for (const r of own) byId.set(r.id, r);
  return [...byId.values()];
}

/**
 * Appointments for the caller's calendar scopes, deduped by id. The OWN-calendar query
 * (ownerId == uid) stays hard so a real outage fails loudly for everyone. The clinic-calendar
 * queries (ownerId == clinicId) degrade on permission-denied ONLY: their read grant
 * (inClinic(ownerId)) ships in its own rules deploy, and before it lands the denial is
 * wholesale ("rules are not filters") — a hard query here aborted the entire hydrate and
 * locked every clinic account out at login (19/07 bug 1). bookedById queries keep their
 * existing best-effort contract (grant deployed separately). Transient errors rethrow on
 * every scope — degrading is reserved for provability gaps, never outages.
 *
 * Exported for testing. `q` mirrors runQuery for one equality constraint and must throw a
 * permission-denied FirebaseError when rules reject the read.
 */
export async function appointmentRowsForScopes(
  uid: string,
  clinicIds: string[],
  q: (field: "ownerId" | "bookedById", owner: string) => Promise<Row[]>,
): Promise<Row[]> {
  const deniedToEmpty = async (field: "ownerId" | "bookedById", owner: string): Promise<Row[]> => {
    try {
      return await q(field, owner);
    } catch (e) {
      if (isPermissionDenied(e)) return [];
      throw e;
    }
  };
  const byId = new Map<string, Row>();
  for (const row of await q("ownerId", uid)) byId.set(row.id, row);
  for (const row of await deniedToEmpty("bookedById", uid)) byId.set(row.id, row);
  for (const cid of clinicIds) {
    for (const row of await deniedToEmpty("ownerId", cid)) byId.set(row.id, row);
    for (const row of await deniedToEmpty("bookedById", cid)) byId.set(row.id, row);
  }
  return [...byId.values()];
}

// availability/{ownerId} is a single doc per calendar owner (publicly readable). Read the
// caller's own + any clinics they belong to; a missing doc means "not configured" → the
// default schedule applies client-side. Doc id == ownerId, matching mapTreatmentAvailability.
async function readAvailability(ownerIds: string[]): Promise<Row[]> {
  const rows = await Promise.all(ownerIds.map(async (ownerId) => {
    const snap = await getDoc(doc(firestore(), "availability", ownerId));
    return snap.exists() ? { id: ownerId, data: snap.data() as Record<string, unknown> } : null;
  }));
  return rows.filter((r): r is Row => r !== null);
}

// externalBusy/{ownerId}: one doc per calendar owner (rules: owner or clinic member reads).
// A missing doc simply means no linked external calendar.
async function readExternalBusy(ownerIds: string[]): Promise<Row[]> {
  const rows = await Promise.all(ownerIds.map(async (ownerId) => {
    const snap = await getDoc(doc(firestore(), "externalBusy", ownerId));
    return snap.exists() ? { id: ownerId, data: snap.data() as Record<string, unknown> } : null;
  }));
  return rows.filter((r): r is Row => r !== null);
}

// The user's own profile doc carries follow-up settings, their booking token, and their
// online/always-accept-auth status (one read). Follow-up settings (preset model + legacy
// migration + custom-day clamp) are decoded by `readFollowUpSettings` (backend.ts).
async function readUserProfile(uid: string): Promise<{
  followUpSettings: FollowUpSettings | null;
  appointmentReminderLead: AppointmentReminderLead | null;
  bookingToken: string | null;
  doctorStatus: { online: boolean; alwaysAcceptAuth: boolean };
  lastCalledDoctorId: string | null;
  profile: UserProfile | null;
}> {
  const snap = await getDoc(doc(firestore(), "users", uid));
  if (!snap.exists()) return { followUpSettings: null, appointmentReminderLead: null, bookingToken: null, doctorStatus: { online: false, alwaysAcceptAuth: false }, lastCalledDoctorId: null, profile: null };
  const d = snap.data();
  // Follow-up settings: new preset model, migrating a legacy followUpIntervalDays-only doc (Tier 3 #2).
  const followUpSettings = readFollowUpSettings(d);
  // Appointment-reminder lead time: coerce a stored value to the {0,1,2} enum (unknown → 0/off).
  const rawLead = d.appointmentReminderLeadDays;
  const appointmentReminderLead: AppointmentReminderLead | null =
    rawLead === 1 ? 1 : rawLead === 2 ? 2 : rawLead === 0 ? 0 : null;
  const bookingToken = typeof d.bookingToken === "string" ? d.bookingToken : null;
  // onlineStatus is a "online"|"offline" string on the backend doc (the setOnlineStatus
  // callable's own schema); the client model is a plain boolean, hence the coercion here.
  const doctorStatus = { online: d.onlineStatus === "online", alwaysAcceptAuth: d.alwaysAcceptAuth === true };
  const lastCalledDoctorId = typeof d.lastCalledDoctorId === "string" && d.lastCalledDoctorId ? d.lastCalledDoctorId : null;
  // Profile fields written by the createUser Function (abn/phone/ahpra) plus the
  // client-writable address/avatarFileId. ahpra is nullable on the wire (createUser
  // writes `ahpra: data.ahpra ?? null` for admins) — coerce non-strings to "".
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  // Premises of administration + principal place (round 6) — written by createUser and
  // the profile/dashboard UI; malformed rows are dropped by mapPremise.
  const premises = Array.isArray(d.premises)
    ? d.premises.map(mapPremise).filter((p): p is Premise => p !== null)
    : [];
  const profile: UserProfile = {
    ahpra: str(d.ahpra), abn: str(d.abn), phone: str(d.phone), address: str(d.address),
    principalPlace: str(d.principalPlace),
    premises,
    ...(typeof d.defaultPremiseId === "string" && d.defaultPremiseId ? { defaultPremiseId: d.defaultPremiseId } : {}),
    ...(typeof d.selectedPremiseId === "string" && d.selectedPremiseId ? { selectedPremiseId: d.selectedPremiseId } : {}),
    ...(typeof d.avatarFileId === "string" && d.avatarFileId ? { avatarFileId: d.avatarFileId } : {}),
  };
  return { followUpSettings, appointmentReminderLead, bookingToken, doctorStatus, lastCalledDoctorId, profile };
}

// Firestore's reviewer grant explicitly requires hasRole('doctor'). Running the
// openReviewerDoctorIds query for a nurse/clinic-only account is therefore not merely
// empty: rules reject the whole query and abort hydration (rules are not filters).
export function shouldQueryReviewerPatients(roles: string[]): boolean {
  return roles.includes("doctor");
}

// Thin: run the same rules-safe queries as iOS LiveBackend.hydrate(), then assemble.
export async function hydrate(claims: DemoClaims): Promise<DemoState> {
  const uid = claims.uid;
  const clinicIds = Object.keys(claims.clinics);

  // Super admin reads everything (the rules allow unconstrained queries for that
  // role) — mirrors iOS LiveBackend.hydrateEverything().
  if (claims.roles.includes("superAdmin")) {
    const profile = await readUserProfile(uid);
    const all = await runQuery("patients");
    const notes: Record<string, Row[]> = {};
    await Promise.all(all.map(async (p) => { notes[p.id] = await runQuery(`patients/${p.id}/notes`); }));
    const forms: Record<string, Row[]> = {};
    await Promise.all(all.map(async (p) => { forms[p.id] = await runQuery(`patients/${p.id}/forms`); }));
    return assembleState({
      patients: all,
      notesByPatient: notes,
      authorisations: await runQuery("authorisations"),
      requests: await runQuery("authRequests"),
      appointments: await runQuery("appointments"),
      formsByPatient: forms,
      invoices: await runQuery("invoices"),
      scriptPricing: await runQuery("scriptPricing"),
      // Note templates + follow-ups are private per-owner even for a super admin (rules
      // only allow users/{uid}/… where uid()==userId), so these load the caller's own only.
      noteTemplates: await runQuery(`users/${uid}/noteTemplates`),
      followUpTasks: await runQuery(`users/${uid}/followUpTasks`),
      followUpSettings: profile.followUpSettings,
      appointmentReminderLead: profile.appointmentReminderLead,
      bookingToken: profile.bookingToken,
      doctorStatus: profile.doctorStatus,
      lastCalledDoctorId: profile.lastCalledDoctorId,
      profile: profile.profile,
      slotPublications: await runQuery("slotPublications", where("doctorId", "==", uid)),
      treatmentAvailability: await readAvailability([uid]),
      externalBusy: await readExternalBusy([uid]),
      // The admin console's account inventory (rules: users list is superAdmin-only).
      accounts: await runQuery("users"),
      emergencyAuthorisations: await runQuerySafe("emergencyAuthorisations"),
      cooperationRelationships: await runQuerySafe("cooperationRelationships"),
      relationshipAudit: await runQuerySafe("relationshipAudit"),
      // Platform audit log (§21): superAdmin-read only. Deploy-order-safe via runQuerySafe —
      // a not-yet-deployed read rule degrades to "none" instead of failing the whole hydrate.
      auditLog: await runQuerySafe("auditLog"),
      products: await runQuerySafe("products"),
      businessEntities: await runQuerySafe("businessEntities"),
      // The clinic directory for the admin console's cooperation picker (rules: the
      // clinics collection is superAdmin- or member-readable; unconstrained list is
      // provable for a super admin only). Best-effort like its sibling directories.
      clinics: await runQuerySafe("clinics"),
      currentUserID: uid,
    });
  }

  // Patients: union the visibility-edge queries by id (rules are "not filters").
  const patientQueries: QueryConstraint[][] = [
    [where("ownerType", "==", "nurse"), where("ownerId", "==", uid)],
    [where("ownerType", "==", "doctor"), where("ownerId", "==", uid)],
    [where("ownerType", "==", "nurse"), where("prescribingDoctorIds", "array-contains", uid)],
    [where("ownerType", "==", "clinic"), where("prescribingDoctorIds", "array-contains", uid)],
    // Reviewer access: the rule requires the caller to hold the doctor role, so never
    // issue this query for nurse/clinic-only accounts (a denied query aborts hydrate).
    ...(shouldQueryReviewerPatients(claims.roles)
      ? [[where("openReviewerDoctorIds", "array-contains", uid)]]
      : []),
    ...clinicIds.map((cid) => [where("ownerType", "==", "clinic"), where("ownerId", "==", cid)]),
  ];
  const patientsById = new Map<string, Row>();
  for (const constraints of patientQueries) {
    for (const row of await runQuery("patients", ...constraints)) patientsById.set(row.id, row);
  }
  const patients = [...patientsById.values()];

  // Each patient's notes subcollection is independent — fetch them concurrently, each with the
  // provably-safe fallback (see notesRowsForPatient).
  const notesByPatient: Record<string, Row[]> = {};
  await Promise.all(
    patients.map(async (p) => {
      notesByPatient[p.id] = await notesRowsForPatient(
        `patients/${p.id}/notes`, uid,
        (path, filter) => (filter ? runQuery(path, where(filter.field, "==", filter.value)) : runQuery(path)),
      );
    }),
  );

  const formsByPatient: Record<string, Row[]> = {};
  await Promise.all(patients.map(async (p) => { formsByPatient[p.id] = await runQuery(`patients/${p.id}/forms`); }));

  // Authorisations + requests scoped to this user (nurse-owned or clinic-shared).
  const authConstraints: QueryConstraint[][] = [
    [where("nurseId", "==", uid)],
    ...clinicIds.map((cid) => [where("clinicId", "==", cid)]),
    [where("doctorId", "==", uid)],
  ];
  const authsById = new Map<string, Row>();
  const reqsById = new Map<string, Row>();
  const emergencyById = new Map<string, Row>();
  for (const constraints of authConstraints) {
    for (const row of await runQuery("authorisations", ...constraints)) authsById.set(row.id, row);
    for (const row of await runQuery("authRequests", ...constraints)) reqsById.set(row.id, row);
    // Emergency authorisations carry the same nurseId/doctorId/clinicId ownership fields.
    // Best-effort: its read rule ships in a separate backend deploy (see runQuerySafe).
    for (const row of await runQuerySafe("emergencyAuthorisations", ...constraints)) emergencyById.set(row.id, row);
  }

  // Appointments owned by the user or their clinics, plus auth slots they (or their clinic) booked
  // with a doctor — owned by the doctor but carrying the booker's scope in `bookedById`.
  // Scope hardness lives in appointmentRowsForScopes: own calendar loud, clinic calendar +
  // bookedById degrade on denial so a rules/web deploy skew can't lock a clinic account out.
  const appointments = await appointmentRowsForScopes(uid, clinicIds, (field, owner) =>
    runQuery("appointments", where(field, "==", owner)));

  // Invoices scoped to this user (rules: doctor, counterparty nurse, or clinic member);
  // scriptPricing is doctor-readable.
  const invoiceConstraints: QueryConstraint[][] = [
    [where("doctorId", "==", uid)],
    [where("counterpartyType", "==", "nurse"), where("counterpartyId", "==", uid)],
    ...clinicIds.map((cid) => [where("counterpartyType", "==", "clinic"), where("counterpartyId", "==", cid)]),
  ];
  const invoicesById = new Map<string, Row>();
  for (const constraints of invoiceConstraints) {
    for (const row of await runQuery("invoices", ...constraints)) invoicesById.set(row.id, row);
  }
  const scriptPricingRows = await runQuery("scriptPricing", where("doctorId", "==", uid));

  // Cooperation relationships this user is party to (doctor side or nurse/clinic counterparty),
  // for the request-picker gate. Best-effort until the rule deploys (runQuerySafe).
  const relConstraints: QueryConstraint[][] = [
    [where("counterpartyType", "==", "nurse"), where("counterpartyId", "==", uid)],
    ...clinicIds.map((cid) => [where("counterpartyType", "==", "clinic"), where("counterpartyId", "==", cid)]),
    [where("doctorId", "==", uid)],
  ];
  const coopById = new Map<string, Row>();
  for (const constraints of relConstraints) {
    for (const row of await runQuerySafe("cooperationRelationships", ...constraints)) coopById.set(row.id, row);
  }
  const profile = await readUserProfile(uid);

  return assembleState({
    patients,
    notesByPatient,
    authorisations: [...authsById.values()],
    emergencyAuthorisations: [...emergencyById.values()],
    cooperationRelationships: [...coopById.values()],
    requests: [...reqsById.values()],
    appointments,
    formsByPatient,
    invoices: [...invoicesById.values()],
    scriptPricing: scriptPricingRows,
    noteTemplates: await runQuery(`users/${uid}/noteTemplates`),
    followUpTasks: await runQuery(`users/${uid}/followUpTasks`),
    followUpSettings: profile.followUpSettings,
    appointmentReminderLead: profile.appointmentReminderLead,
    bookingToken: profile.bookingToken,
    doctorStatus: profile.doctorStatus,
    lastCalledDoctorId: profile.lastCalledDoctorId,
    profile: profile.profile,
    slotPublications: await runQuery("slotPublications", where("doctorId", "==", uid)),
    treatmentAvailability: await readAvailability([uid, ...clinicIds]),
    externalBusy: await readExternalBusy([uid, ...clinicIds]),
    products: await runQuerySafe("products"),
    businessEntities: await runQuerySafe("businessEntities"),
    currentUserID: uid,
  });
}

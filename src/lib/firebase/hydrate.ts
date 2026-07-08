"use client";

import {
  collection, query, where, getDocs, doc, getDoc, type QueryConstraint,
} from "firebase/firestore";
import { firestore } from "./client";
import { mapPatient, mapNote, mapAuthorisation, mapAuthRequest, mapAppointment, mapForm, mapInvoice, mapNoteTemplate, mapFollowUpTask, mapAvailabilityWindow, mapTreatmentAvailability, mapExternalBusy, mapAccount, mapEmergencyAuthorisation } from "./mappers";
import type { DemoState, UserProfile } from "@/lib/demo/types";
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
  followUpSettings: { enabled: boolean; intervalDays: number } | null;
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

  // addressByIdentity: per-identity address overrides have no Firestore schema yet (owner
  // feedback #2, live tracked separately) — hydrate empty so live falls back to the per-user
  // address in profileByUser.
  return { patients, notesByPatient, authorisations, requests, appointments, usages: [], formsByPatient, invoices, scriptPricing, noteTemplatesByOwner, followUpTasksByID, followUpSettingsByUser, bookingTokensByUser, availabilityWindows, treatmentAvailabilityByOwner, doctorStatusByID, externalBusyByOwner, lastCalledDoctorByUser, profileByUser, addressByIdentity: {}, accountsByID, emergencyAuthorisationsByID };
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
// online/always-accept-auth status (one read). intervalDays is clamped to the UI's valid
// range [1,90] so a corrupt/out-of-range stored value (0, negative, NaN) can't silently
// schedule everything as overdue or in the past.
async function readUserProfile(uid: string): Promise<{
  followUpSettings: { enabled: boolean; intervalDays: number } | null;
  bookingToken: string | null;
  doctorStatus: { online: boolean; alwaysAcceptAuth: boolean };
  lastCalledDoctorId: string | null;
  profile: UserProfile | null;
}> {
  const snap = await getDoc(doc(firestore(), "users", uid));
  if (!snap.exists()) return { followUpSettings: null, bookingToken: null, doctorStatus: { online: false, alwaysAcceptAuth: false }, lastCalledDoctorId: null, profile: null };
  const d = snap.data();
  const hasFU = d.followUpEnabled !== undefined || d.followUpIntervalDays !== undefined;
  const raw = d.followUpIntervalDays;
  const followUpSettings = hasFU
    ? { enabled: d.followUpEnabled === true, intervalDays: typeof raw === "number" && Number.isFinite(raw) ? Math.min(90, Math.max(1, Math.round(raw))) : 14 }
    : null;
  const bookingToken = typeof d.bookingToken === "string" ? d.bookingToken : null;
  // onlineStatus is a "online"|"offline" string on the backend doc (the setOnlineStatus
  // callable's own schema); the client model is a plain boolean, hence the coercion here.
  const doctorStatus = { online: d.onlineStatus === "online", alwaysAcceptAuth: d.alwaysAcceptAuth === true };
  const lastCalledDoctorId = typeof d.lastCalledDoctorId === "string" && d.lastCalledDoctorId ? d.lastCalledDoctorId : null;
  // Profile fields written by the createUser Function (abn/phone/ahpra) plus the
  // client-writable address/avatarFileId. ahpra is nullable on the wire (createUser
  // writes `ahpra: data.ahpra ?? null` for admins) — coerce non-strings to "".
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const profile: UserProfile = {
    ahpra: str(d.ahpra), abn: str(d.abn), phone: str(d.phone), address: str(d.address),
    ...(typeof d.avatarFileId === "string" && d.avatarFileId ? { avatarFileId: d.avatarFileId } : {}),
  };
  return { followUpSettings, bookingToken, doctorStatus, lastCalledDoctorId, profile };
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
      currentUserID: uid,
    });
  }

  // Patients: union the visibility-edge queries by id (rules are "not filters").
  const patientQueries: QueryConstraint[][] = [
    [where("ownerType", "==", "nurse"), where("ownerId", "==", uid)],
    [where("ownerType", "==", "doctor"), where("ownerId", "==", uid)],
    [where("ownerType", "==", "nurse"), where("prescribingDoctorIds", "array-contains", uid)],
    [where("ownerType", "==", "clinic"), where("prescribingDoctorIds", "array-contains", uid)],
    // Reviewer access: patients with an open request addressed to this doctor (spec
    // 2026-07-07 reviewer-file-access) — read-only until they approve. Any owner type.
    [where("openReviewerDoctorIds", "array-contains", uid)],
    ...clinicIds.map((cid) => [where("ownerType", "==", "clinic"), where("ownerId", "==", cid)]),
  ];
  const patientsById = new Map<string, Row>();
  for (const constraints of patientQueries) {
    for (const row of await runQuery("patients", ...constraints)) patientsById.set(row.id, row);
  }
  const patients = [...patientsById.values()];

  // Each patient's notes subcollection is independent — fetch them concurrently.
  const notesByPatient: Record<string, Row[]> = {};
  await Promise.all(
    patients.map(async (p) => { notesByPatient[p.id] = await runQuery(`patients/${p.id}/notes`); }),
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

  // Appointments owned by the user or their clinics.
  const apptOwners = [uid, ...clinicIds];
  const apptsById = new Map<string, Row>();
  for (const owner of apptOwners) {
    for (const row of await runQuery("appointments", where("ownerId", "==", owner))) apptsById.set(row.id, row);
  }

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
  const profile = await readUserProfile(uid);

  return assembleState({
    patients,
    notesByPatient,
    authorisations: [...authsById.values()],
    emergencyAuthorisations: [...emergencyById.values()],
    requests: [...reqsById.values()],
    appointments: [...apptsById.values()],
    formsByPatient,
    invoices: [...invoicesById.values()],
    scriptPricing: scriptPricingRows,
    noteTemplates: await runQuery(`users/${uid}/noteTemplates`),
    followUpTasks: await runQuery(`users/${uid}/followUpTasks`),
    followUpSettings: profile.followUpSettings,
    bookingToken: profile.bookingToken,
    doctorStatus: profile.doctorStatus,
    lastCalledDoctorId: profile.lastCalledDoctorId,
    profile: profile.profile,
    slotPublications: await runQuery("slotPublications", where("doctorId", "==", uid)),
    treatmentAvailability: await readAvailability([uid, ...clinicIds]),
    externalBusy: await readExternalBusy([uid, ...clinicIds]),
    currentUserID: uid,
  });
}

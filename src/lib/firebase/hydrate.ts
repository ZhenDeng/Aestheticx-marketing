"use client";

import {
  collection, query, where, getDocs, doc, getDoc, type QueryConstraint,
} from "firebase/firestore";
import { firestore } from "./client";
import { mapPatient, mapNote, mapAuthorisation, mapAuthRequest, mapAppointment, mapForm, mapInvoice, mapNoteTemplate, mapFollowUpTask, mapAvailabilityWindow, mapTreatmentAvailability } from "./mappers";
import type { DemoState } from "@/lib/demo/types";
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
  slotPublications?: Row[];
  treatmentAvailability?: Row[];
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

  // The caller's own published auth-slot windows (slotPublications where doctorId == uid).
  const availabilityWindows: DemoState["availabilityWindows"] = {};
  for (const r of rows.slotPublications ?? []) availabilityWindows[r.id] = mapAvailabilityWindow(r.id, r.data);

  const treatmentAvailabilityByOwner: DemoState["treatmentAvailabilityByOwner"] = {};
  for (const r of rows.treatmentAvailability ?? []) treatmentAvailabilityByOwner[r.id] = mapTreatmentAvailability(r.id, r.data);

  return { patients, notesByPatient, authorisations, requests, appointments, usages: [], formsByPatient, invoices, scriptPricing, noteTemplatesByOwner, followUpTasksByID, followUpSettingsByUser, bookingTokensByUser, availabilityWindows, treatmentAvailabilityByOwner };
}

async function runQuery(path: string, ...constraints: QueryConstraint[]): Promise<Row[]> {
  const snap = await getDocs(query(collection(firestore(), path), ...constraints));
  return snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }));
}

// The user's own profile doc carries follow-up settings + their booking token (one read).
// intervalDays is clamped to the UI's valid range [1,90] so a corrupt/out-of-range stored
// value (0, negative, NaN) can't silently schedule everything as overdue or in the past.
async function readUserProfile(uid: string): Promise<{
  followUpSettings: { enabled: boolean; intervalDays: number } | null;
  bookingToken: string | null;
}> {
  const snap = await getDoc(doc(firestore(), "users", uid));
  if (!snap.exists()) return { followUpSettings: null, bookingToken: null };
  const d = snap.data();
  const hasFU = d.followUpEnabled !== undefined || d.followUpIntervalDays !== undefined;
  const raw = d.followUpIntervalDays;
  const followUpSettings = hasFU
    ? { enabled: d.followUpEnabled === true, intervalDays: typeof raw === "number" && Number.isFinite(raw) ? Math.min(90, Math.max(1, Math.round(raw))) : 14 }
    : null;
  const bookingToken = typeof d.bookingToken === "string" ? d.bookingToken : null;
  return { followUpSettings, bookingToken };
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
      slotPublications: await runQuery("slotPublications", where("doctorId", "==", uid)),
      currentUserID: uid,
    });
  }

  // Patients: union the visibility-edge queries by id (rules are "not filters").
  const patientQueries: QueryConstraint[][] = [
    [where("ownerType", "==", "nurse"), where("ownerId", "==", uid)],
    [where("ownerType", "==", "doctor"), where("ownerId", "==", uid)],
    [where("ownerType", "==", "nurse"), where("prescribingDoctorIds", "array-contains", uid)],
    [where("ownerType", "==", "clinic"), where("prescribingDoctorIds", "array-contains", uid)],
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
  for (const constraints of authConstraints) {
    for (const row of await runQuery("authorisations", ...constraints)) authsById.set(row.id, row);
    for (const row of await runQuery("authRequests", ...constraints)) reqsById.set(row.id, row);
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
    requests: [...reqsById.values()],
    appointments: [...apptsById.values()],
    formsByPatient,
    invoices: [...invoicesById.values()],
    scriptPricing: scriptPricingRows,
    noteTemplates: await runQuery(`users/${uid}/noteTemplates`),
    followUpTasks: await runQuery(`users/${uid}/followUpTasks`),
    followUpSettings: profile.followUpSettings,
    bookingToken: profile.bookingToken,
    slotPublications: await runQuery("slotPublications", where("doctorId", "==", uid)),
    currentUserID: uid,
  });
}

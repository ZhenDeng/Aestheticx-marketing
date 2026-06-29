"use client";

import {
  collection, query, where, getDocs, type QueryConstraint,
} from "firebase/firestore";
import { firestore } from "./client";
import { mapPatient, mapNote, mapAuthorisation, mapAuthRequest, mapAppointment, mapForm, mapBillingEvent } from "./mappers";
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
  billingEvents: Row[];
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

  const ledger = rows.billingEvents.map((r) => mapBillingEvent(r.id, r.data));
  return { patients, notesByPatient, authorisations, requests, appointments, ledger, usages: [], formsByPatient, invoices: [], scriptPricing: {} };
}

async function runQuery(path: string, ...constraints: QueryConstraint[]): Promise<Row[]> {
  const snap = await getDocs(query(collection(firestore(), path), ...constraints));
  return snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }));
}

// Thin: run the same rules-safe queries as iOS LiveBackend.hydrate(), then assemble.
export async function hydrate(claims: DemoClaims): Promise<DemoState> {
  const uid = claims.uid;
  const clinicIds = Object.keys(claims.clinics);

  // Super admin reads everything (the rules allow unconstrained queries for that
  // role) — mirrors iOS LiveBackend.hydrateEverything().
  if (claims.roles.includes("superAdmin")) {
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
      billingEvents: await runQuery("billingEvents"),
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

  // Billing events scoped to this user (rules: doctor, counterparty nurse, or clinic member).
  const billingConstraints: QueryConstraint[][] = [
    [where("doctorId", "==", uid)],
    [where("counterpartyType", "==", "nurse"), where("counterpartyId", "==", uid)],
    ...clinicIds.map((cid) => [where("counterpartyType", "==", "clinic"), where("counterpartyId", "==", cid)]),
  ];
  const billingById = new Map<string, Row>();
  for (const constraints of billingConstraints) {
    for (const row of await runQuery("billingEvents", ...constraints)) billingById.set(row.id, row);
  }

  return assembleState({
    patients,
    notesByPatient,
    authorisations: [...authsById.values()],
    requests: [...reqsById.values()],
    appointments: [...apptsById.values()],
    formsByPatient,
    billingEvents: [...billingById.values()],
  });
}

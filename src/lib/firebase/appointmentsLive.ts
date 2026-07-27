"use client";

// Real-time appointments sync (16/07 feedback bug 3). Live mode hydrates appointments once
// per sign-in, so a cancel made on another client (or restored by a failed mirror's
// rehydrate) could leave the dashboard's "Upcoming authorisation calls" stale. This module
// keeps `state.appointments` current with one onSnapshot listener per readable scope,
// mirroring hydrate's queries exactly (rules are not filters, so each must be provable
// alone): appointments the user (or their clinic) OWNS, and auth slots they BOOKED with a
// doctor. The bookedById scope is best-effort like hydrate's runQuerySafe — its rule ships
// in a separate backend deploy, so a denial there degrades silently instead of alarming.
import { collection, query, where, onSnapshot, doc, getDoc, type QueryConstraint } from "firebase/firestore";
import { firestore } from "./client";
import { mapAppointment, mapPatient } from "./mappers";
import { callAccessCutoffISO } from "@/lib/demo/backend";
import type { Row } from "./hydrate";
import type { Appointment, Patient } from "@/lib/demo/types";

export interface AppointmentScope {
  key: string;
  /** null ⇒ unconstrained query (super admin only — hydrate loads the platform-wide set). */
  constraint: QueryConstraint | null;
  /** True for scopes whose read rule is optional (bookedById): errors stay silent. */
  optional?: boolean;
}

/** The listener scopes for a user, matching hydrate's appointments queries one-for-one. */
export function appointmentScopesFor(opts: { uid: string; clinicIds: string[]; superAdmin: boolean }): AppointmentScope[] {
  if (opts.superAdmin) return [{ key: "all", constraint: null }];
  return [opts.uid, ...opts.clinicIds].flatMap((owner): AppointmentScope[] => [
    { key: `owner:${owner}`, constraint: where("ownerId", "==", owner) },
    { key: `booker:${owner}`, constraint: where("bookedById", "==", owner), optional: true },
  ]);
}

/** Union the per-scope snapshot rows into an appointments map (later scopes win on shared
 * ids — the doc data is identical, the scopes just overlap). */
export function mergeAppointmentRows(rowsByScope: Record<string, Row[]>): Record<string, Appointment> {
  const merged: Record<string, Appointment> = {};
  for (const rows of Object.values(rowsByScope)) {
    for (const r of rows) merged[r.id] = mapAppointment(r.id, r.data);
  }
  return merged;
}

/** Patients the doctor on a booked consult call needs fetched: live calls (owner feedback
 * 28/07 — the booking grants read-only file access) on THEIR calendar whose patient doc isn't
 * loaded. Marked and stale calls grant nothing, so they're skipped; `cutoffISO` is the grant
 * window's oldest day, computed by the same rule the backend trigger uses. */
export function missingCallPatientIDs(
  appointments: Appointment[],
  uid: string,
  knownPatientIDs: Set<string>,
  cutoffISO: string,
): string[] {
  const live = appointments.filter(
    (a) => a.type === "authSlot" && a.ownerID === uid && a.dateISO >= cutoffISO
      && (a.status === "confirmed" || a.status === "awaitingConfirmation"),
  );
  return [...new Set(live.map((a) => a.patientID))]
    .filter((id): id is string => !!id && !knownPatientIDs.has(id));
}

export interface SubscribeAppointmentsHandlers {
  /** Full replacement for state.appointments — only called once every scope has delivered. */
  onAppointments: (appointments: Record<string, Appointment>) => void;
  /** A required scope's listener errored: its last-good rows are frozen until the next
   * rehydrate, so surface the possible staleness. Optional scopes never report. */
  onScopeError?: (scopeKey: string) => void;
  /** True when the patient doc is already in state (skips the consult-call fetch). */
  hasPatient?: (patientID: string) => boolean;
  /** A patient doc fetched for a listener-delivered consult call. */
  onPatient?: (patient: Patient) => void;
}

/** Subscribe to every appointments scope the user can read. Returns an unsubscribe fn.
 * onAppointments waits for ALL scopes to report once so a partial union never clobbers
 * the hydrated snapshot; an erroring scope reports too (keeping its last known rows) so
 * one broken scope can't silence the rest. */
export function subscribeAppointments(
  opts: { uid: string; clinicIds: string[]; superAdmin: boolean },
  handlers: SubscribeAppointmentsHandlers,
): () => void {
  const scopes = appointmentScopesFor(opts);
  const rowsByScope: Record<string, Row[]> = {};
  const fired = new Set<string>();
  const fetchedPatients = new Set<string>(); // succeeded (or doc-missing) — never retried
  const inFlightPatients = new Set<string>(); // pending getDocs — retried on failure
  let cancelled = false;

  const deliver = () => {
    if (cancelled || fired.size < scopes.length) return;
    const merged = mergeAppointmentRows(rowsByScope);
    handlers.onAppointments(merged);
    if (!handlers.onPatient) return;
    // Consult-call file access: hydrate's reviewer query ran before this booking existed, so
    // fetch the patient the call opens. Same contract as the requests listener's reviewer
    // fetch — the grant is written by the backend trigger and may lag the appointment doc, so
    // a failure leaves the id retryable on the next delivery.
    const known = new Set([...fetchedPatients, ...inFlightPatients]);
    const missing = missingCallPatientIDs(Object.values(merged), opts.uid, known, callAccessCutoffISO(Date.now()))
      .filter((id) => !handlers.hasPatient?.(id));
    for (const id of missing) {
      inFlightPatients.add(id);
      void getDoc(doc(firestore(), "patients", id))
        .then((snap) => {
          inFlightPatients.delete(id);
          fetchedPatients.add(id);
          if (!cancelled && snap.exists()) handlers.onPatient?.(mapPatient(snap.id, snap.data() as Record<string, unknown>));
        })
        .catch(() => { inFlightPatients.delete(id); });
    }
  };

  const unsubscribes = scopes.map(({ key, constraint, optional }) =>
    onSnapshot(
      constraint
        ? query(collection(firestore(), "appointments"), constraint)
        : query(collection(firestore(), "appointments")),
      (snap) => {
        rowsByScope[key] = snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }));
        fired.add(key);
        deliver();
      },
      () => {
        rowsByScope[key] ??= [];
        fired.add(key);
        if (!cancelled && !optional) handlers.onScopeError?.(key);
        deliver();
      },
    ),
  );
  return () => {
    cancelled = true;
    for (const u of unsubscribes) u();
  };
}

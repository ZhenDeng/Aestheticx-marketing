"use client";

// Real-time authRequests sync (owner bug 2, 2026-07-13). Live mode hydrates Firestore once
// per sign-in, so a doctor who was already signed in never saw a nurse's new request. This
// module keeps `state.requests` current with one onSnapshot listener per readable scope —
// the same scopes hydrate queries (rules are not filters, so each must be provable alone):
// the caller's own raised requests, requests addressed to them as doctor, and each clinic's.
import { collection, query, where, onSnapshot, doc, getDoc, type QueryConstraint } from "firebase/firestore";
import { firestore } from "./client";
import { mapAuthRequest, mapPatient } from "./mappers";
import type { Row } from "./hydrate";
import type { AuthorisationRequest, Patient } from "@/lib/demo/types";

/** Union the per-scope snapshot rows into a requests map (later scopes win on shared ids —
 * the doc data is identical, the scopes just overlap). */
export function mergeRequestRows(rowsByScope: Record<string, Row[]>): Record<string, AuthorisationRequest> {
  const merged: Record<string, AuthorisationRequest> = {};
  for (const rows of Object.values(rowsByScope)) {
    for (const r of rows) merged[r.id] = mapAuthRequest(r.id, r.data);
  }
  return merged;
}

/** Patients the reviewing doctor needs fetched: open (pending/needsEdit) requests addressed
 * to them whose patient doc isn't loaded. Closed requests are skipped — reviewer read access
 * lapses with the request (spec 2026-07-07 reviewer-file-access). */
export function missingReviewerPatientIDs(
  requests: AuthorisationRequest[],
  uid: string,
  knownPatientIDs: Set<string>,
): string[] {
  const open = requests.filter(
    (r) => r.doctorID === uid && (r.status === "pending" || r.status === "needsEdit"),
  );
  return [...new Set(open.map((r) => r.patientID))].filter((id) => id && !knownPatientIDs.has(id));
}

export interface SubscribeAuthRequestsHandlers {
  /** Full replacement for state.requests — only called once every scope has delivered. */
  onRequests: (requests: Record<string, AuthorisationRequest>) => void;
  /** True when the patient doc is already in state (skips the reviewer fetch). */
  hasPatient: (patientID: string) => boolean;
  /** A reviewer-visible patient doc fetched for a listener-delivered request. */
  onPatient: (patient: Patient) => void;
}

/** Subscribe to every authRequests scope the user can read. Returns an unsubscribe fn.
 * onRequests waits for ALL scopes to fire once so a partial union never clobbers the
 * hydrated snapshot; snapshot errors are swallowed (hydrate remains the fallback). */
export function subscribeAuthRequests(
  opts: { uid: string; clinicIds: string[] },
  handlers: SubscribeAuthRequestsHandlers,
): () => void {
  const scopes: [string, QueryConstraint][] = [
    ["nurse", where("nurseId", "==", opts.uid)],
    ["doctor", where("doctorId", "==", opts.uid)],
    ...opts.clinicIds.map((cid): [string, QueryConstraint] => [`clinic:${cid}`, where("clinicId", "==", cid)]),
  ];
  const rowsByScope: Record<string, Row[]> = {};
  const fired = new Set<string>();
  const fetchedPatients = new Set<string>();

  const deliver = () => {
    if (fired.size < scopes.length) return;
    const merged = mergeRequestRows(rowsByScope);
    handlers.onRequests(merged);
    const missing = missingReviewerPatientIDs(Object.values(merged), opts.uid, fetchedPatients)
      .filter((id) => !handlers.hasPatient(id));
    for (const id of missing) {
      fetchedPatients.add(id);
      void getDoc(doc(firestore(), "patients", id))
        .then((snap) => {
          if (snap.exists()) handlers.onPatient(mapPatient(snap.id, snap.data() as Record<string, unknown>));
        })
        // Reviewer access is granted by the onAuthRequestWritten trigger and may lag the
        // request doc; a denied read just leaves the card on its embedded patientSummary.
        .catch(() => {});
    }
  };

  const unsubscribes = scopes.map(([key, constraint]) =>
    onSnapshot(
      query(collection(firestore(), "authRequests"), constraint),
      (snap) => {
        rowsByScope[key] = snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }));
        fired.add(key);
        deliver();
      },
      () => {}, // a broken listener degrades to the hydrate snapshot, never a crash
    ),
  );
  return () => { for (const u of unsubscribes) u(); };
}

"use client";

// Real-time authRequests sync (owner bug 2, 2026-07-13). Live mode hydrates Firestore once
// per sign-in, so a doctor who was already signed in never saw a nurse's new request. This
// module keeps `state.requests` current with one onSnapshot listener per readable scope,
// mirroring hydrate's queries exactly (rules are not filters, so each must be provable
// alone): the caller's own raised requests, requests addressed to them as doctor, and each
// ADMIN clinic's (the clinic-scope rule is isClinicAdmin) — or, for a super admin, ONE
// unconstrained listener, because hydrate loads the
// platform-wide set and scoped queries would silently replace it with near-nothing.
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

export interface RequestScope {
  key: string;
  /** null ⇒ unconstrained query (super admin only — rules allow the collection-wide read). */
  constraint: QueryConstraint | null;
}

/** The listener scopes for a user, matching hydrate's authRequests queries one-for-one.
 * `clinics` is the membership map from claims (clinicId -> "admin" | "employee" |
 * "contractor"): the authRequests clinic-scope rule is `isClinicAdmin`, so only ADMIN
 * memberships subscribe a clinic scope. A non-admin membership's listener would never
 * deliver — it errors on attach ("rules are not filters") and raised a misleading
 * staleness banner for every doctor linked to a clinic (19/07 platform-admin bug). */
export function requestScopesFor(opts: { uid: string; clinics: Record<string, string>; superAdmin: boolean }): RequestScope[] {
  if (opts.superAdmin) return [{ key: "all", constraint: null }];
  return [
    { key: "nurse", constraint: where("nurseId", "==", opts.uid) },
    { key: "doctor", constraint: where("doctorId", "==", opts.uid) },
    ...Object.entries(opts.clinics)
      .filter(([, kind]) => kind === "admin")
      .map(([cid]): RequestScope => ({ key: `clinic:${cid}`, constraint: where("clinicId", "==", cid) })),
  ];
}

export interface SubscribeAuthRequestsHandlers {
  /** Full replacement for state.requests — only called once every scope has delivered. */
  onRequests: (requests: Record<string, AuthorisationRequest>) => void;
  /** True when the patient doc is already in state (skips the reviewer fetch). */
  hasPatient: (patientID: string) => boolean;
  /** A reviewer-visible patient doc fetched for a listener-delivered request. */
  onPatient: (patient: Patient) => void;
  /** A scope's listener errored (Firestore doesn't auto-retry): its last-good rows are
   * frozen until the next rehydrate, so surface the possible staleness to the user. */
  onScopeError?: (scopeKey: string) => void;
}

/** Subscribe to every authRequests scope the user can read. Returns an unsubscribe fn that
 * also cancels handler delivery, so a resolved in-flight getDoc can never leak a previous
 * identity's patient into the next session's state. onRequests waits for ALL scopes to
 * report once so a partial union never clobbers the hydrated snapshot; an erroring scope
 * reports too (keeping its last known rows) so one broken scope can't silence the rest. */
export function subscribeAuthRequests(
  opts: { uid: string; clinics: Record<string, string>; superAdmin: boolean },
  handlers: SubscribeAuthRequestsHandlers,
): () => void {
  const scopes = requestScopesFor(opts);
  const rowsByScope: Record<string, Row[]> = {};
  const fired = new Set<string>();
  const fetchedPatients = new Set<string>(); // succeeded (or doc-missing) — never retried
  const inFlightPatients = new Set<string>(); // pending getDocs — retried on failure
  let cancelled = false;

  const deliver = () => {
    if (cancelled || fired.size < scopes.length) return;
    const merged = mergeRequestRows(rowsByScope);
    handlers.onRequests(merged);
    const known = new Set([...fetchedPatients, ...inFlightPatients]);
    const missing = missingReviewerPatientIDs(Object.values(merged), opts.uid, known)
      .filter((id) => !handlers.hasPatient(id));
    for (const id of missing) {
      inFlightPatients.add(id);
      void getDoc(doc(firestore(), "patients", id))
        .then((snap) => {
          inFlightPatients.delete(id);
          fetchedPatients.add(id);
          if (!cancelled && snap.exists()) handlers.onPatient(mapPatient(snap.id, snap.data() as Record<string, unknown>));
        })
        // Reviewer access is granted by the onAuthRequestWritten trigger and may lag the
        // request doc: leave the id retryable, so the next snapshot delivery attempts it
        // again; until then the card stays on its embedded patientSummary.
        .catch(() => { inFlightPatients.delete(id); });
    }
  };

  const unsubscribes = scopes.map(({ key, constraint }) =>
    onSnapshot(
      constraint
        ? query(collection(firestore(), "authRequests"), constraint)
        : query(collection(firestore(), "authRequests")),
      (snap) => {
        rowsByScope[key] = snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }));
        fired.add(key);
        deliver();
      },
      () => {
        // Count the scope as reported (keeping its last good rows, if any) so the other
        // scopes still deliver. An allowed→denied flip AFTER hydrate freezes this scope's
        // rows until the next rehydrate — tell the caller so the staleness isn't silent.
        rowsByScope[key] ??= [];
        fired.add(key);
        if (!cancelled) handlers.onScopeError?.(key);
        deliver();
      },
    ),
  );
  return () => {
    cancelled = true;
    for (const u of unsubscribes) u();
  };
}

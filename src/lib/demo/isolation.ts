// Client-data isolation (spec: client-data-isolation, change: multi-tenant-billing-matrix).
//
// One pure guard decides COMMERCIAL access to a client — who may manage, top up, check
// out, and invoice — keyed strictly off the client's owning silo (PatientOwner):
//
//   "owner"        the owning silo itself: the independent doctor/nurse who owns the
//                  client, or any user whose ACTIVE identity context is the owning
//                  clinic (clinic admin + clinic staff).
//   "collaborator" a doctor holding an ACTIVE cooperation relationship with the owning
//                  clinic: may view and operate (run a checkout) on the clinic's
//                  clients, but the clinic stays the client-facing commercial party.
//   "none"         everyone else.
//
// Deliberately separate from patientPermissions (the CLINICAL access matrix): a
// prescribing/reviewing doctor reads the file for the authorisation flow but gains no
// commercial rights from it, and the platform admin's audit oversight lives in the
// admin shell, never in billing. Per-identity, not per-user: the same nurse acting
// under her clinic identity has no access to her independent book (and vice versa).
import type { DemoState, Identity, Patient } from "./types";
import { relationshipFor } from "./cooperation";

export type PatientAccessLevel = "none" | "collaborator" | "owner";

export function patientAccessLevel(state: DemoState, identity: Identity, patient: Patient): PatientAccessLevel {
  const userID = identity.user.id;
  switch (patient.owner.kind) {
    case "doctor":
      return identity.role === "doctor" && identity.context.kind === "independent" && userID === patient.owner.id
        ? "owner"
        : "none";
    case "nurse":
      return identity.role === "nurse" && identity.context.kind === "independent" && userID === patient.owner.id
        ? "owner"
        : "none";
    case "clinic": {
      if (identity.context.kind === "clinic" && identity.context.clinic.id === patient.owner.id) return "owner";
      if (identity.role === "doctor") {
        const rel = relationshipFor(state.cooperationRelationshipsByID, userID, "clinic", patient.owner.id);
        if (rel?.status === "active") return "collaborator";
      }
      return "none";
    }
  }
}

/** Full view gate for a patient file: clinical view (patientPermissions.canView — passed
 *  in by the caller to avoid a backend↔isolation import cycle) OR any commercial access.
 *  Callers with a Permissions object in hand should prefer
 *  `perms.canView || patientAccessLevel(...) !== "none"`; this helper wraps the pair for
 *  list/detail surfaces that only need the boolean. */
export function canViewPatient(state: DemoState, identity: Identity, patient: Patient, clinicalCanView?: boolean): boolean {
  return (clinicalCanView ?? false) || patientAccessLevel(state, identity, patient) !== "none";
}

/** True when the identity may run a checkout for the client (owner silo or collaborating practitioner). */
export function canCheckout(state: DemoState, identity: Identity, patient: Patient): boolean {
  return patientAccessLevel(state, identity, patient) !== "none";
}

/** True when the identity may top up the client's wallet — the owning silo only (spec:
 *  "Only the owning silo SHALL manage (edit, top up, …)"; collaborators operate, not manage). */
export function canTopUp(state: DemoState, identity: Identity, patient: Patient): boolean {
  return patientAccessLevel(state, identity, patient) === "owner";
}

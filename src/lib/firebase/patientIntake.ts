"use client";

// Live mode for the new-patient form link (change: patient-form-link-generation, round 2).
// The backend shipped with the iOS port (03/08): createPatientIntakeLink onCall mints a
// single-use token, the person fills the hosted public page at /i/{token} on ANY device,
// and the submission lands in the `patientIntakes` collection stamped with the generating
// silo (ownerType/ownerId). Here the web app mints links, hydrates its pending cards from
// that collection, and deletes the doc on approve/decline (rules: owner-scoped delete).
import { collection, deleteDoc, doc, getDocs, query, where, type QueryConstraint } from "firebase/firestore";
import { FirebaseError } from "firebase/app";
import { httpsCallable } from "firebase/functions";
import { firestore, functions } from "./client";
import type { PatientFormSubmission } from "@/lib/demo/patientFormLinks";
import { emptyDraft, type PatientDraft } from "@/lib/demo/types";

export interface CreatedPatientIntakeLink {
  token: string;
  url: string;
}

// Mints a single-use intake link for the caller's silo via the createPatientIntakeLink
// onCall Function. Returns the public URL (pointing at the deployed intake.html).
export async function createPatientIntakeLink(ownerType: string, ownerId: string): Promise<CreatedPatientIntakeLink> {
  const res = await httpsCallable(functions(), "createPatientIntakeLink")({ ownerType, ownerId });
  const data = res.data as { token?: string; url?: string };
  if (!data?.url) throw new Error("createPatientIntakeLink returned no url");
  return { token: data.token ?? "", url: data.url };
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// `patientIntakes` docs carry the DOB as the patient-doc wire string "yyyy-MM-dd".
function dobFromWire(v: unknown): PatientDraft["dateOfBirth"] {
  const parts = str(v).split("-").map((x) => parseInt(x, 10));
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  return { year: parts[0], month: parts[1], day: parts[2] };
}

/**
 * Wire → the store's submission shape. `accountKey` carries the SILO key
 * `${ownerType}:${ownerId}` — live scoping is by data silo (matching iOS and the rules),
 * unlike the demo's per-identity localStorage key. Junk degrades to blanks, which the
 * review form's normal validation then reports rather than crashing a page.
 */
export function mapPatientIntake(id: string, data: Record<string, unknown>): PatientFormSubmission {
  const contact = (data.emergencyContact ?? {}) as Record<string, unknown>;
  const draft: PatientDraft = {
    ...emptyDraft(),
    givenName: str(data.givenName),
    lastName: str(data.lastName),
    preferredName: str(data.preferredName),
    dateOfBirth: dobFromWire(data.dateOfBirth),
    gender: str(data.gender),
    address: str(data.address),
    phone: str(data.phone),
    email: str(data.email),
    allergies: str(data.allergies),
    currentMedications: str(data.currentMedications),
    emergencyContactName: str(contact.name),
    emergencyContactPhone: str(contact.phone),
    emergencyContactRelationship: str(contact.relationship),
  };
  return {
    id,
    token: str(data.token),
    accountKey: `${str(data.ownerType)}:${str(data.ownerId)}`,
    draft,
    submittedAt: typeof data.submittedAtMillis === "number" ? data.submittedAtMillis : 0,
  };
}

const isPermissionDenied = (e: unknown): boolean =>
  e instanceof FirebaseError && e.code === "permission-denied";

/**
 * The caller's pending intake submissions across every silo edge (own nurse/doctor uid +
 * each clinic), unioned by id. EVERY query degrades on permission-denied — unlike the
 * patients queries, this collection's rule is brand new, so a lagging rules deploy (or a
 * stale-claims skew) must shrink the pending list to empty, never break the caller.
 */
export async function fetchPatientIntakes(uid: string, clinicIds: string[]): Promise<PatientFormSubmission[]> {
  const db = firestore();
  const edges: QueryConstraint[][] = [
    [where("ownerType", "==", "nurse"), where("ownerId", "==", uid)],
    [where("ownerType", "==", "doctor"), where("ownerId", "==", uid)],
    ...clinicIds.map((cid) => [where("ownerType", "==", "clinic"), where("ownerId", "==", cid)]),
  ];
  const byId = new Map<string, PatientFormSubmission>();
  for (const constraints of edges) {
    try {
      const snap = await getDocs(query(collection(db, "patientIntakes"), ...constraints));
      for (const row of snap.docs) byId.set(row.id, mapPatientIntake(row.id, row.data()));
    } catch (e) {
      if (!isPermissionDenied(e)) throw e;
    }
  }
  return [...byId.values()];
}

// Approve consumed the submission, or decline discarded it — the rules let the owning
// silo delete its own docs.
export async function deletePatientIntake(id: string): Promise<void> {
  await deleteDoc(doc(firestore(), "patientIntakes", id));
}

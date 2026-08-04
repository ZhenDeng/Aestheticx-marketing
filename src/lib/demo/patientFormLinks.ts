// New-patient form links: an account generates a tokenised link to the public
// /intake/{token} page; a visitor fills in the standard new-patient fields and submits, and
// the submission surfaces as a "Pending review" card in the patient list of ONLY the account
// that generated the link — which can approve (the normal createPatient path, after edits if
// needed) or decline. Links and submissions live in browser localStorage: the link works on
// this device/browser (hand the device to the patient, or open it in another tab). Delivering
// a link to the patient's own device needs server-persisted links + submissions — a backend
// follow-up; this module keeps the same shapes so only the storage layer would change.
// Storage is injected (unit-testable) and every access is wrapped, mirroring identityPrefs.ts.
import { identityKey } from "./identityPrefs";
import { emptyDraft, type Identity, type PatientDraft } from "./types";

export const PATIENT_FORM_LINKS_KEY = "ax.patientFormLinks";
export const PATIENT_FORM_SUBMISSIONS_KEY = "ax.patientFormSubmissions";

/** The account scope a DEMO link belongs to: user id + practising identity (role/clinic
 *  context). Only this exact account sees the resulting pending-review cards — the same
 *  user practising under a different role or clinic does not. */
export function formLinkAccountKey(identity: Identity): string {
  return `${identity.user.id}|${identityKey(identity)}`;
}

/** The identity's data silo as `${ownerType}:${ownerId}` — the ownerFor rule patients
 *  use: clinic context → the clinic, independent doctor → the doctor, else the nurse. */
export function siloOwnerParts(identity: Identity): { type: "doctor" | "nurse" | "clinic"; id: string } {
  if (identity.context.kind === "clinic") return { type: "clinic", id: identity.context.clinic.id };
  if (identity.role === "doctor") return { type: "doctor", id: identity.user.id };
  return { type: "nurse", id: identity.user.id };
}

/** LIVE scope key (round 2): server-backed submissions are stamped with the generating
 *  silo, so live cards are shared silo-wide (clinic members see clinic cards — matching
 *  iOS and the Firestore rules), unlike the demo's per-identity key. */
export function siloAccountKey(identity: Identity): string {
  const owner = siloOwnerParts(identity);
  return `${owner.type}:${owner.id}`;
}

export interface PatientFormLink {
  token: string;
  /** formLinkAccountKey of the generating account. */
  accountKey: string;
  /** Display name shown to the visitor ("Dr … will review your details"). */
  accountName: string;
  createdAt: number;
}

export interface PatientFormSubmission {
  id: string;
  token: string;
  /** Copied from the link at submit time — the visibility scope of the pending card. */
  accountKey: string;
  draft: PatientDraft;
  submittedAt: number;
}

export function patientFormUrl(origin: string, token: string): string {
  return `${origin}/intake/${token}`;
}

// --- defensive parsing (records round-trip through localStorage) ---

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function sanitizeDob(v: unknown): PatientDraft["dateOfBirth"] {
  if (!v || typeof v !== "object") return null;
  const d = v as Record<string, unknown>;
  if (typeof d.year !== "number" || typeof d.month !== "number" || typeof d.day !== "number") return null;
  return { year: d.year, month: d.month, day: d.day };
}

/** Coerces an unknown value into a well-formed PatientDraft — every field a string (or a
 *  valid DOB), unknown keys dropped. Garbage degrades to blanks, which the existing
 *  missingFields validation then reports rather than crashing a page. */
export function sanitizeDraft(raw: unknown): PatientDraft {
  const base = emptyDraft();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const out: PatientDraft = { ...base, dateOfBirth: sanitizeDob(r.dateOfBirth) };
  for (const key of Object.keys(base) as (keyof PatientDraft)[]) {
    if (key === "dateOfBirth") continue;
    const v = str(r[key]);
    if (v) out[key] = v;
  }
  return out;
}

function sanitizeLink(raw: unknown): PatientFormLink | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!str(r.token) || !str(r.accountKey)) return null;
  return { token: str(r.token), accountKey: str(r.accountKey), accountName: str(r.accountName), createdAt: num(r.createdAt) };
}

function sanitizeSubmission(raw: unknown): PatientFormSubmission | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!str(r.id) || !str(r.accountKey)) return null;
  return {
    id: str(r.id), token: str(r.token), accountKey: str(r.accountKey),
    draft: sanitizeDraft(r.draft), submittedAt: num(r.submittedAt),
  };
}

function loadMap<T>(storage: Storage, key: string, sanitize: (raw: unknown) => T | null): Record<string, T> {
  try {
    const raw = storage.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, T> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const clean = sanitize(v);
      if (clean) out[k] = clean;
    }
    return out;
  } catch {
    return {};
  }
}

// --- links ---

export function loadPatientFormLinks(storage: Storage): Record<string, PatientFormLink> {
  return loadMap(storage, PATIENT_FORM_LINKS_KEY, sanitizeLink);
}

/** Persists a freshly-minted link. Returns false when storage is unavailable, so the
 *  generating page can show an error instead of handing out a dead link. */
export function savePatientFormLink(storage: Storage, link: PatientFormLink): boolean {
  try {
    const links = loadPatientFormLinks(storage);
    storage.setItem(PATIENT_FORM_LINKS_KEY, JSON.stringify({ ...links, [link.token]: link }));
    return true;
  } catch {
    return false;
  }
}

export function findPatientFormLink(storage: Storage, token: string): PatientFormLink | null {
  return loadPatientFormLinks(storage)[token] ?? null;
}

/** Removes a link — a submit consumes it (single-use, like remote consent links). */
export function removePatientFormLink(storage: Storage, token: string): void {
  try {
    const links = loadPatientFormLinks(storage);
    if (!(token in links)) return;
    const rest = { ...links };
    delete rest[token];
    storage.setItem(PATIENT_FORM_LINKS_KEY, JSON.stringify(rest));
  } catch {
    // Best-effort: a stale link record is harmless.
  }
}

// --- submissions ---

export function loadPatientFormSubmissions(storage: Storage): Record<string, PatientFormSubmission> {
  return loadMap(storage, PATIENT_FORM_SUBMISSIONS_KEY, sanitizeSubmission);
}

/** Persists a visitor's submission. Returns false when storage is unavailable, so the
 *  intake page can tell the visitor instead of silently losing their details. */
export function savePatientFormSubmission(storage: Storage, submission: PatientFormSubmission): boolean {
  try {
    const subs = loadPatientFormSubmissions(storage);
    storage.setItem(PATIENT_FORM_SUBMISSIONS_KEY, JSON.stringify({ ...subs, [submission.id]: submission }));
    return true;
  } catch {
    return false;
  }
}

export function removePatientFormSubmission(storage: Storage, id: string): void {
  try {
    const subs = loadPatientFormSubmissions(storage);
    if (!(id in subs)) return;
    const rest = { ...subs };
    delete rest[id];
    storage.setItem(PATIENT_FORM_SUBMISSIONS_KEY, JSON.stringify(rest));
  } catch {
    // Best-effort: the store also drops it from its in-memory copy.
  }
}

/** The pending cards this identity may see in DEMO: exact account-key match, newest first. */
export function submissionsForAccount(
  submissions: Record<string, PatientFormSubmission>, identity: Identity,
): PatientFormSubmission[] {
  return submissionsForKey(submissions, formLinkAccountKey(identity));
}

/** The pending cards this identity may see in LIVE: silo-key match, newest first. */
export function submissionsForSilo(
  submissions: Record<string, PatientFormSubmission>, identity: Identity,
): PatientFormSubmission[] {
  return submissionsForKey(submissions, siloAccountKey(identity));
}

function submissionsForKey(
  submissions: Record<string, PatientFormSubmission>, key: string,
): PatientFormSubmission[] {
  return Object.values(submissions)
    .filter((s) => s.accountKey === key)
    .sort((a, b) => b.submittedAt - a.submittedAt);
}

// NSW Clause 68C "direction" (treatment-authorisations). Pure — no React/Firebase.
// Field names and labels mirror the backend's direction.ts (the wire truth) exactly;
// the capture/builder split mirrors AXDomain/Direction.swift. Like iOS, a direction
// is assembled on demand from the patient/authorisation and clinician-captured
// fields — it is never persisted. Wording pending practitioner/legal sign-off.
import { DEMO_ACCOUNTS, LUMIERE } from "./accounts";
import { categoryDisplayName, unitSuffix } from "./catalog";
import type { DateOfBirth, EmergencyAuthorisation, EmergencyKind, MedicationItem } from "./types";

export interface DirectionAdministration {
  substanceAndForm: string;
  category: string;
  bodySite: string;
  route: string;
  quantity: string;
}

/** A reference to an auto-generated emergency standing authorisation on the direction. */
export interface DirectionEmergencyRef {
  label: string;  // e.g. "Adrenaline — anaphylaxis"
  detail: string; // e.g. "standing order · expires 8 Jul 2027"
}

export interface DirectionContent {
  directionId: string;
  patientName: string;
  patientDateOfBirth: string; // "12/3/1991" (derived from the patient)
  patientAllergies: string;   // "Penicillin" | "None recorded" (derived from the patient)
  patientAddress: string;
  prescriberName: string;
  prescriberPhone: string;
  prescriberPrincipalPlace: string;
  premisesOfAdministration: string;
  responsibleProvider: string;
  authorisationStatus: string;  // "Approved 17 Jun 2026" (an Authorisation exists ⇒ approved)
  authorisationExpires: string; // the real Authorisation.expiresAt, formatted
  patientReviewedISO: string;
  directionPeriod: string;
  administrationCountAndIntervals: string;
  administrations: DirectionAdministration[];
  prescriberAttestation: string;               // "Electronically authorised by Dr …"
  emergencyAuthorisations: DirectionEmergencyRef[]; // [] when the prescriber has none on file
}

/** Canonical Clause 68C field labels, in document order (backend CLAUSE_68C_FIELDS). */
export const CLAUSE_68C_FIELDS = [
  "Patient name",
  "Patient address",
  "Prescriber name",
  "Prescriber phone",
  "Principal place of practice",
  "Premises of administration",
  "Responsible provider",
  "Date patient reviewed",
  "Period direction has effect",
  "Number and intervals of administration",
  "Substance name and form",
  "Body site",
  "Route",
  "Quantity",
] as const;

const blank = (v: unknown): boolean => typeof v !== "string" || v.trim() === "";

/** Required Clause 68C fields that are still empty — export is gated until this is empty. */
export function missingDirectionFields(content: DirectionContent): string[] {
  const missing: string[] = [];
  if (blank(content.patientName)) missing.push("Patient name");
  if (blank(content.patientAddress)) missing.push("Patient address");
  if (blank(content.prescriberName)) missing.push("Prescriber name");
  if (blank(content.prescriberPhone)) missing.push("Prescriber phone");
  if (blank(content.prescriberPrincipalPlace)) missing.push("Principal place of practice");
  if (blank(content.premisesOfAdministration)) missing.push("Premises of administration");
  if (blank(content.responsibleProvider)) missing.push("Responsible provider");
  if (blank(content.patientReviewedISO)) missing.push("Date patient reviewed");
  if (blank(content.directionPeriod)) missing.push("Period direction has effect");
  if (blank(content.administrationCountAndIntervals) || content.administrations.length === 0) {
    missing.push("Number and intervals of administration");
  }
  for (const a of content.administrations) {
    if (blank(a.substanceAndForm)) missing.push("Substance name and form");
    if (blank(a.bodySite)) missing.push("Body site");
    if (blank(a.route)) missing.push("Route");
    if (blank(a.quantity)) missing.push("Quantity");
  }
  return missing;
}

/**
 * The Clause 68C fields a clinician captures at export that can't be derived from
 * the patient/authorisation (iOS CapturedDirectionFields). `route` applies to every
 * administration; substance/site/quantity come from the authorisation's medication.
 */
export interface CapturedDirectionFields {
  prescriberPhone: string;
  prescriberPrincipalPlace: string;
  premisesOfAdministration: string;
  patientReviewedISO: string;
  directionPeriod: string;
  administrationCountAndIntervals: string;
  route: string;
}

/** iOS DirectionCaptureView's initial state: sensible defaults, the rest captured. */
export const DEFAULT_CAPTURED_FIELDS: CapturedDirectionFields = {
  prescriberPhone: "",
  prescriberPrincipalPlace: "",
  premisesOfAdministration: "",
  patientReviewedISO: "",
  directionPeriod: "6 months",
  administrationCountAndIntervals: "Up to 5, ≥ 4 weeks apart",
  route: "IM",
};

/** "16" + units → "16 U" — the quantity wording on the direction's administration rows. */
function medicationQuantity(medication: MedicationItem): string {
  return `${medication.dosage} ${unitSuffix(medication.unit)}`.trim();
}

const DOC_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** Patient DOB as d/m/yyyy, no zero-padding — the app's display convention (PatientRow). */
export function formatDob(dob: DateOfBirth): string {
  return `${dob.day}/${dob.month}/${dob.year}`;
}

/**
 * A document date as "17 Jun 2026" in UTC with fixed month names. The direction is a
 * document, so its dates must be deterministic regardless of the exporter's locale or
 * timezone — unlike the live patient-panel which is free to use toLocaleDateString.
 */
export function formatDocDate(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getUTCDate()} ${DOC_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Emergency-kind display label — the single source shared with the patient-file panel. */
export function emergencyKindLabel(kind: EmergencyKind): string {
  return kind === "adrenaline" ? "Adrenaline — anaphylaxis" : "Hyaluronidase / Hylase";
}

/**
 * Assembles a Clause 68C direction from the derivable patient/prescriber data plus
 * the clinician-captured fields (port of iOS DirectionBuilder.draft). The resulting
 * missingDirectionFields gates export, so the clinician is prompted for blanks.
 */
export function buildDirectionDraft(input: {
  directionId: string;
  patientName: string;
  patientAddress: string;
  patientDob: DateOfBirth;
  allergies: string;
  prescriberName: string;
  responsibleProvider: string;
  medications: MedicationItem[];
  expiresAt: number; // Authorisation.expiresAt — the real expiry
  approvedAt: number; // Authorisation.createdAt — when the doctor approved
  emergencies: EmergencyAuthorisation[]; // caller filters to this direction's prescriber
  captured: CapturedDirectionFields;
}): DirectionContent {
  const { captured } = input;
  return {
    directionId: input.directionId,
    patientName: input.patientName,
    patientDateOfBirth: formatDob(input.patientDob),
    patientAllergies: input.allergies.trim() === "" ? "None recorded" : input.allergies.trim(),
    patientAddress: input.patientAddress,
    prescriberName: input.prescriberName,
    prescriberPhone: captured.prescriberPhone,
    prescriberPrincipalPlace: captured.prescriberPrincipalPlace,
    premisesOfAdministration: captured.premisesOfAdministration,
    responsibleProvider: input.responsibleProvider,
    authorisationStatus: `Approved ${formatDocDate(input.approvedAt)}`,
    authorisationExpires: formatDocDate(input.expiresAt),
    patientReviewedISO: captured.patientReviewedISO,
    directionPeriod: captured.directionPeriod,
    administrationCountAndIntervals: captured.administrationCountAndIntervals,
    administrations: input.medications.map((m) => ({
      substanceAndForm: m.name,
      category: categoryDisplayName(m.category),
      bodySite: m.areas.join(", "),
      route: captured.route,
      quantity: medicationQuantity(m),
    })),
    prescriberAttestation: `Electronically authorised by ${input.prescriberName}`,
    emergencyAuthorisations: input.emergencies.map((e) => ({
      label: emergencyKindLabel(e.kind),
      detail: `standing order · expires ${formatDocDate(e.expiresAt)}`,
    })),
  };
}

/** Doctor display name for the direction's prescriber line (iOS AuthorisationCard.doctorName). */
export function directionPrescriberName(doctorID: string): string {
  const identity = DEMO_ACCOUNTS.flatMap((a) => a.identities).find((i) => i.user.id === doctorID);
  return identity?.user.name ?? doctorID;
}

/** The requesting nurse (with clinic badge) — the responsible provider (iOS requesterBadge). */
export function directionResponsibleProvider(nurseID: string, clinicID: string | null): string {
  const identity = DEMO_ACCOUNTS.flatMap((a) => a.identities).find((i) => i.user.id === nurseID);
  if (!identity) return nurseID;
  return clinicID === LUMIERE.id ? `${identity.user.name} @ ${LUMIERE.name}` : identity.user.name;
}

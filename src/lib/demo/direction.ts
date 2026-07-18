// NSW Clause 68C "direction" (treatment-authorisations). Pure — no React/Firebase.
// Field names and labels mirror the backend's direction.ts (the wire truth) exactly;
// the capture/builder split mirrors AXDomain/Direction.swift. Like iOS, a direction
// is assembled on demand from the patient/authorisation and clinician-captured
// fields — it is never persisted. Wording pending practitioner/legal sign-off.
import { DEMO_ACCOUNTS, LUMIERE } from "./accounts";
import { categoryDisplayName, unitSuffix } from "./catalog";
import { routeLabel } from "./types";
import type { AuthorisationRequest, ClinicRef, DateOfBirth, EmergencyAuthorisation, EmergencyKind, MedicationItem, Premise } from "./types";

/** "Name, Address" for a stamped premise — mirrors the backend's premiseDisplayLine. */
export function premiseDisplayLine(premise: Premise | null | undefined): string | null {
  if (!premise || premise.address.trim() === "") return null;
  const name = premise.name.trim();
  return name ? `${name}, ${premise.address.trim()}` : premise.address.trim();
}

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
 * the patient/authorisation (iOS CapturedDirectionFields). Round 6: the reviewed
 * date is DERIVED (always the approval day — never captured), and `route` is only
 * a legacy fallback for authorisations whose medication predates per-item routes.
 */
export interface CapturedDirectionFields {
  prescriberPhone: string;
  prescriberPrincipalPlace: string;
  premisesOfAdministration: string;
  directionPeriod: string;
  administrationCountAndIntervals: string;
  route: string;
}

/** iOS DirectionCaptureView's initial state. Route is NEVER defaulted (round 6 —
 *  the owner: route must be an active choice; legacy exports capture it here). */
export const DEFAULT_CAPTURED_FIELDS: CapturedDirectionFields = {
  prescriberPhone: "",
  prescriberPrincipalPlace: "",
  premisesOfAdministration: "",
  directionPeriod: "6 months",
  // PRN, never an invented count and interval. The previous default asserted "Up to 5, ≥ 4
  // weeks apart" — a clinical schedule nobody entered, pre-filled onto a legal document.
  administrationCountAndIntervals: "PRN",
  route: "",
};

/**
 * Premises of administration for the capture dialog. Precedence deliberately mirrors
 * buildApprovalDocumentModel (approvalPdf.ts) so the capture dialog and the approval document
 * can never disagree about where administration happened:
 *
 *   clinic context → the clinic's address; else the STAMPED premise; else (independent only)
 *   the acting user's current premise.
 *
 * A clinic-context request stamps `premise: null` DELIBERATELY — that is a signal meaning "use
 * the clinic's address" (backend submitRequest), NOT "unknown". So when `clinicID` is set the
 * acting user's own premises are never consulted, even if the clinic cannot be resolved: Sarah
 * Chen holds both an independent and a Lumière identity, and substituting her private Bondi
 * practice for the clinic she actually treated at would put the wrong address on a legal
 * document. Blank prompts the clinician instead.
 *
 * The independent fallback is the ACTING user, not the prescriber — live hydrates only the
 * caller's own users doc, so a prescriber-based fallback would be blank exactly when needed
 * (the same gap that blocks prescriber phone / principal place).
 *
 * `actingPremise` is resolved by the caller (via backend's `activePremise`) rather than looked
 * up here, so this module keeps its no-Firebase, no-backend purity and adds no import cycle.
 */
export function premiseForCapture(input: {
  stamped: Premise | null | undefined;
  clinicID: string | null;
  clinic: ClinicRef | null;
  actingPremise: Premise | null;
}): string {
  if (input.clinicID) {
    const asPremise = input.clinic
      ? { id: "", name: input.clinic.name ?? "", address: input.clinic.address ?? "" }
      : null;
    return premiseDisplayLine(asPremise) ?? premiseDisplayLine(input.stamped) ?? "";
  }
  return premiseDisplayLine(input.stamped) ?? premiseDisplayLine(input.actingPremise) ?? "";
}

const norm = (v: string) => v.trim().toLowerCase();

/**
 * Route for the capture dialog, recovered from the originating request — the route WAS chosen
 * per line item at submission, so the clinician should not retype it.
 *
 * Matched on name + dosage, and used ONLY when exactly one such item carries a route. Two
 * deliberate refusals: an ambiguous match yields "" rather than a guess, and the item is never
 * derived from the authorisation id (demo mints `${requestId}-${index}`, but live ids come from
 * a Cloud Function whose scheme this repo does not control — indexing would pass in demo and
 * silently state the wrong route in live). missingDirectionFields then prompts for it, which is
 * far better than a direction naming the wrong route of administration.
 */
export function routeForCapture(
  medication: MedicationItem,
  originatingRequest: AuthorisationRequest | null | undefined,
): string {
  if (!originatingRequest) return "";
  const matches = originatingRequest.items.filter(
    (i) => norm(i.name) === norm(medication.name) && norm(i.dosage) === norm(medication.dosage),
  );
  if (matches.length !== 1) return ""; // no match, or ambiguous — never guess
  return matches[0].route?.trim() ?? "";
}

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
 * A document date as "17 Jun 2026" with fixed month names, read in the jurisdiction's
 * timezone (NSW / Australia/Sydney). The inputs are real wall-clock instants
 * (Authorisation.createdAt/expiresAt, emergency expiry), and Sydney is always ahead of
 * UTC — so reading UTC components would mis-date ~10–11h of every day to the previous
 * calendar day (e.g. an 08:00 Sydney approval → 22:00 UTC the day before). Using a FIXED
 * timezone keeps the document deterministic across exporters AND jurisdiction-correct.
 */
export function formatDocDate(epochMs: number): string {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney", day: "numeric", month: "numeric", year: "numeric",
  }).formatToParts(new Date(epochMs));
  const part = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return `${part("day")} ${DOC_MONTHS[part("month") - 1]} ${part("year")}`;
}

/**
 * The Clause 68C "date patient reviewed" as yyyy-mm-dd, read in Australia/Sydney like
 * formatDocDate. Round 6: this is ALWAYS the day the doctor approved — derived from the
 * authorisation, never captured by the exporter.
 */
export function formatReviewedISO(epochMs: number): string {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney", day: "2-digit", month: "2-digit", year: "numeric",
  }).formatToParts(new Date(epochMs));
  const part = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
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
    // Round 6: reviewed date = approval date, always derived (never captured).
    patientReviewedISO: formatReviewedISO(input.approvedAt),
    directionPeriod: captured.directionPeriod,
    administrationCountAndIntervals: captured.administrationCountAndIntervals,
    administrations: input.medications.map((m) => ({
      substanceAndForm: m.name,
      category: categoryDisplayName(m.category),
      bodySite: m.areas.join(", "),
      // Round 6: the item's stored route (labelled); captured route only covers
      // legacy authorisations that predate per-item routes.
      route: routeLabel(m.route) ?? captured.route,
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

// Combined Treatment Authorisation document at approval (round 6, spec
// auth-pdf-feedback-round-6 §5.3/5.4). Every approval produces ONE document covering
// ALL items of the request, saved as a treatment note with the PDF attached. In LIVE
// mode the deployed approveRequest Cloud Function renders/uploads the real artifact
// server-side (backend authorisationPdf.ts is the layout truth); this module is the
// DEMO-mode parity: the same pure document model, drawn with the hand-rolled
// single-font writer shared with directionPdf.ts. Pure — no React/Firebase.
import type { AuthorisationRequest, EmergencyKind, MedicationItem, Note, Premise } from "./types";
import { routeLabel } from "./types";
import { categoryDisplayName, unitSuffix } from "./catalog";
import { emergencyKindLabel, formatDocDate, premiseDisplayLine } from "./direction";
import { DirectionWriter, GOLD, INK, SOFT, buildPdfFile, field } from "./directionPdf";

/** Placeholder for a value that is absent — em dash, never fabricated data. */
export const MISSING_VALUE = "—";

const REPEATS_PER_AUTHORISATION = 5; // mirrors backend domain.ts

/** Default timing wording — mirrors iOS `AuthorisationDocument.defaultTiming`. */
export const DEFAULT_TIMING = "PRN monthly, max 6 treatments yearly (6 months in NSW)";

const text = (v: string | undefined | null): string =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : MISSING_VALUE;

/** "48 U" / "2 mls" — mirrors backend dosageWithUnit (no double suffix). */
export function dosageWithUnit(item: MedicationItem): string {
  const suffix = unitSuffix(item.unit);
  const trimmed = item.dosage.trim();
  if (!suffix) return trimmed || MISSING_VALUE;
  if (trimmed.toLowerCase().endsWith(suffix.toLowerCase())) return trimmed;
  return trimmed ? `${trimmed} ${suffix}` : suffix;
}

/** dd/MM/yyyy in Australia/Sydney — the date style the in-app renderer prints. */
export function formatDay(millis: number): string {
  const parts = new Intl.DateTimeFormat("en-AU", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Australia/Sydney",
  }).formatToParts(new Date(millis));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")}`;
}

export interface ApprovalRow {
  /** Brand + name on one line, e.g. "Juvederm Voluma". */
  product: string;
  /** Category subline under the product ("HA Filler"); null for legacy `other` items. */
  category: string | null;
  areas: string;
  /** Dosage + unit label, "mls" for millilitres. */
  volume: string;
  timing: string;
  /** Route display label (Intradermal … Supra-periosteal) or an em dash. */
  route: string;
}

export interface ApprovalDocumentModel {
  authorisationNumber: string;
  /** Clinic name (clinic context) or the doctor's name for the header. */
  headerName: string;
  responsibleProvider: string;
  reviewedOnText: string;
  effectiveOnText: string;
  expiresOnText: string;
  patientName: string;
  patientAddress: string;
  patientDOB: string;
  allergies: string;
  rows: ApprovalRow[];
  // Clause 68C direction block
  prescriberName: string;
  prescriberPhone: string;
  prescriberPrincipalPlace: string;
  prescriberNumber: string;
  premisesOfAdministration: string;
  periodOfEffect: string;
  administrations: string;
  emergencyReferences: { label: string; expiresText: string }[];
}

/** One table row per medication (mirrors backend approvalRows). */
export function approvalRows(items: MedicationItem[]): ApprovalRow[] {
  return items.map((item) => {
    const brand = (item.brand ?? "").trim();
    const name = item.name.trim();
    return {
      product: brand ? `${brand} ${name}` : name || MISSING_VALUE,
      category: item.category !== "other" ? categoryDisplayName(item.category) : null,
      areas: item.areas.filter((a) => a.trim() !== "").join(", ") || MISSING_VALUE,
      volume: dosageWithUnit(item),
      timing: (item.timing ?? "").trim() || DEFAULT_TIMING,
      route: routeLabel(item.route) ?? MISSING_VALUE,
    };
  });
}

export interface ApprovalModelInput {
  requestId: string;
  request: Pick<AuthorisationRequest, "items" | "premise"> & { nurseName: string; clinicId: string | null };
  approvedAtMillis: number;
  expiresAtMillis: number;
  prescriber: { name: string; phone?: string; principalPlace?: string; prescriberNumber?: string };
  /** Clinic contact when the request has a clinic context. */
  clinic: { name?: string; address?: string } | null;
  patient: { name?: string; address?: string; dobText?: string; allergies?: string };
  emergencyRefs: { kind: EmergencyKind; expiresAtMillis: number }[];
}

/**
 * Pure assembly of the render-ready model (mirrors backend buildApprovalDocumentModel).
 * Premises of administration: the clinic's address whenever the request has a clinic
 * context (clinic requests always use the clinic address), otherwise the premise
 * stamped on the request; em dash for legacy requests with neither.
 */
export function buildApprovalDocumentModel(input: ApprovalModelInput): ApprovalDocumentModel {
  const clinicPremise: Premise | null = input.clinic
    ? { id: "", name: input.clinic.name ?? "", address: input.clinic.address ?? "" }
    : null;
  const premises = (input.request.clinicId ? premiseDisplayLine(clinicPremise) : null)
    ?? premiseDisplayLine(input.request.premise)
    ?? MISSING_VALUE;

  return {
    authorisationNumber: input.requestId.toUpperCase(),
    headerName: input.request.clinicId ? text(input.clinic?.name) : text(input.prescriber.name),
    responsibleProvider: text(input.request.nurseName),
    reviewedOnText: formatDay(input.approvedAtMillis),
    effectiveOnText: formatDay(input.approvedAtMillis),
    expiresOnText: formatDay(input.expiresAtMillis),
    patientName: text(input.patient.name),
    patientAddress: text(input.patient.address),
    patientDOB: text(input.patient.dobText),
    allergies: (input.patient.allergies ?? "").trim() || "None",
    rows: approvalRows(input.request.items),
    prescriberName: text(input.prescriber.name),
    prescriberPhone: text(input.prescriber.phone),
    prescriberPrincipalPlace: text(input.prescriber.principalPlace),
    prescriberNumber: (input.prescriber.prescriberNumber ?? "").trim(),
    premisesOfAdministration: premises,
    periodOfEffect: "6 months",
    administrations: `Up to ${REPEATS_PER_AUTHORISATION} per item, intervals as directed`,
    emergencyReferences: input.emergencyRefs.map((ref) => ({
      label: emergencyKindLabel(ref.kind),
      expiresText: formatDay(ref.expiresAtMillis),
    })),
  };
}

/** Draw the combined Treatment Authorisation (text layout of the backend's pdfkit render). */
export function renderApprovalPdf(model: ApprovalDocumentModel): Uint8Array {
  const writer = new DirectionWriter();

  writer.text(`TREATMENT AUTHORISATION · ${model.authorisationNumber}`, 8, GOLD, { charSpace: 1.5 });
  writer.moveDown(0.4);
  writer.text(model.headerName, 23, INK);
  writer.moveDown(1);

  field(writer, "Responsible provider", model.responsibleProvider);
  field(writer, "Date of review by authorising doctor", model.reviewedOnText);
  field(writer, "Treatment authority effective date", model.effectiveOnText);
  field(writer, "Expiry date", model.expiresOnText);
  field(writer, "Approval status", "Approved");

  writer.moveDown(0.4);
  field(writer, "Patient", model.patientName);
  field(writer, "Address", model.patientAddress);
  field(writer, "Born", model.patientDOB);
  field(writer, "Allergies", model.allergies);

  writer.moveDown(0.6);
  writer.text("AUTHORISATION TO TREAT", 9, GOLD, { charSpace: 1 });
  writer.moveDown(0.3);
  for (const row of model.rows) {
    // Wrapping text lines, not columns: areas/timing are unbounded and the writer
    // wraps rather than clips — no silent data loss on a compliance document.
    writer.text(row.category ? `${row.product} — ${row.category}` : row.product, 10.5, INK);
    writer.text(`${row.areas} · ${row.volume} · ${row.route}`, 9.5, SOFT);
    writer.text(`Timing: ${row.timing}`, 9, SOFT);
    writer.moveDown(0.3);
  }

  writer.moveDown(0.6);
  writer.text("DIRECTION UNDER CLAUSE 68C — NSW POISONS AND THERAPEUTIC GOODS REGULATION 2008", 8.5, GOLD, { charSpace: 0.8 });
  writer.moveDown(0.3);
  field(writer, "Prescriber", `${model.prescriberName} · ${model.prescriberPhone}`);
  field(writer, "Principal place of practice", model.prescriberPrincipalPlace);
  field(writer, "Premises of administration", model.premisesOfAdministration);
  field(writer, "Period direction has effect", model.periodOfEffect);
  field(writer, "Administrations", model.administrations);

  if (model.emergencyReferences.length > 0) {
    writer.moveDown(0.3);
    writer.text("STANDING EMERGENCY AUTHORISATIONS", 9, GOLD, { charSpace: 1 });
    writer.moveDown(0.3);
    for (const ref of model.emergencyReferences) {
      writer.text(`${ref.label} · expires ${ref.expiresText}`, 9.5, SOFT);
    }
  }

  writer.moveDown(0.8);
  writer.text("PER ADMINISTRATION — TO RECORD", 9, GOLD, { charSpace: 1 });
  writer.moveDown(0.3);
  writer.text(
    "For each administration the nurse must record: name, date administered, batch number, " +
      "substance, site, route, and quantity.",
    8.5, SOFT, { width: 483 },
  );

  writer.moveDown(0.8);
  writer.text(model.prescriberName, 11.5, INK);
  writer.text(`Electronically authorised on ${model.reviewedOnText}`, 9, SOFT);
  if (model.prescriberNumber) writer.text(`Prescriber Number ${model.prescriberNumber}`, 9, SOFT);
  if (model.prescriberPhone !== MISSING_VALUE) writer.text(`p: ${model.prescriberPhone}`, 9, SOFT);
  if (model.prescriberPrincipalPlace !== MISSING_VALUE) writer.text(`a: ${model.prescriberPrincipalPlace}`, 9, SOFT);

  return buildPdfFile(writer.pages.map((ops) => ops.join("\n")));
}

// ---- Storage path + note (pure factories, wire parity with backend) ----------------

/** Storage key for the combined approval PDF — same path the Cloud Function uploads to. */
export function approvalPdfPath(patientId: string, requestId: string): string {
  return `patients/${patientId}/authorisations/${requestId}.pdf`;
}

/** Deterministic note id so a regenerate overwrites rather than duplicating. */
export function approvalNoteId(requestId: string): string {
  return `authpdf-${requestId}`;
}

/** Uint8Array → base64 without Buffer/btoa so it runs in browser and node alike. */
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    out += B64[a >> 2] + B64[((a & 3) << 4) | ((b ?? 0) >> 4)];
    out += b === undefined ? "=" : B64[((b & 15) << 2) | ((c ?? 0) >> 6)];
    out += c === undefined ? "=" : B64[c & 63];
  }
  return out;
}

/**
 * The system treatment note carrying the approval PDF (mirrors the Cloud Function's
 * approvalNoteDoc: kind/title/attachment shape, empty consumed ids — the audit note
 * never consumes repeats; the approving doctor is the author, plain-name badge).
 * The demo attachment carries the PDF bytes as a data URL (no Storage in demo).
 */
export function approvalNote(args: {
  patientId: string;
  requestId: string;
  doctorId: string;
  doctorName: string;
  approvedAtMillis: number;
  pdf: Uint8Array;
}): Note {
  const dateText = formatDocDate(args.approvedAtMillis);
  return {
    id: approvalNoteId(args.requestId),
    patientID: args.patientId,
    kind: "treatment",
    title: `Treatment authorisation — ${dateText}`,
    body: "",
    createdAt: args.approvedAtMillis,
    authorID: args.doctorId,
    authorBadge: args.doctorName,
    consumedAuthorisationIDs: [],
    medications: [],
    attachments: [{
      fileID: approvalPdfPath(args.patientId, args.requestId),
      displayName: `Treatment authorisation — ${dateText}.pdf`,
      mimeType: "application/pdf",
      dataUrl: `data:application/pdf;base64,${bytesToBase64(args.pdf)}`,
    }],
  };
}

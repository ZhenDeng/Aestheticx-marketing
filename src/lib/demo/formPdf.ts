// Pure helpers for the consent PDF download. No Firebase/React imports (unit-tested).
import type { SignedFormRecord } from "./types";

// Demo mode has no Cloud Function, so no server PDF exists. In live mode the PDF is
// rendered asynchronously after the form is created, so a just-signed record may not
// carry pdfFileId yet ("pending") until the finalizeSignedForm Function writes it.
export function pdfAvailability(
  record: Pick<SignedFormRecord, "pdfFileId">,
  isLive: boolean,
): "ready" | "pending" | "unavailable" {
  if (!isLive) return "unavailable";
  return record.pdfFileId && record.pdfFileId.length > 0 ? "ready" : "pending";
}

// A human, filesystem-safe download name, e.g. "Antiwrinkle Consent — Claire D — 2026-06-29.pdf".
export function pdfFilename(displayName: string, patientName: string, signedAtMillis: number): string {
  const d = new Date(signedAtMillis);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const clean = (s: string) => s.replace(/[/\\:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
  const parts = [clean(displayName), clean(patientName), date].filter(Boolean);
  return `${parts.join(" — ")}.pdf`;
}

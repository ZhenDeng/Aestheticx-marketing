// Clause 68C direction PDF — client-side render of the backend's
// renderDirectionPDF layout (backend/functions/src/direction.ts is the truth).
// Mirrors the backend's own PDF assertions plus content checks the
// uncompressed stream makes possible.
import { describe, expect, it } from "vitest";
import { directionPdfFilename, renderDirectionPdf } from "@/lib/demo/directionPdf";
import type { DirectionContent } from "@/lib/demo/direction";

const complete: DirectionContent = {
  directionId: "AUTH-7G2K-09",
  patientName: "Amara Boyd",
  patientDateOfBirth: "12/3/1991",
  patientAllergies: "None recorded",
  patientAddress: "14 Marra St, Bondi NSW 2026",
  prescriberName: "Dr Adrian Voss",
  prescriberPhone: "02 9388 4410",
  prescriberPrincipalPlace: "A. Voss Medical, 88 Oxford St, Paddington NSW 2021",
  premisesOfAdministration: "Lumière Aesthetics, 12 Hall St, Bondi Beach NSW 2026",
  responsibleProvider: "RN Sarah Chen",
  authorisationStatus: "Approved 17 Jun 2026",
  authorisationExpires: "17 Dec 2026",
  patientReviewedISO: "2026-06-17",
  directionPeriod: "6 months",
  administrationCountAndIntervals: "Up to 5, at intervals of at least 4 weeks",
  administrations: [
    { substanceAndForm: "Botulinum toxin type A, injection", category: "Neurotoxin", bodySite: "Glabella", route: "IM", quantity: "20 units" },
  ],
  prescriberAttestation: "Electronically authorised by Dr Adrian Voss",
  emergencyAuthorisations: [
    { label: "Adrenaline — anaphylaxis", detail: "standing order · expires 8 Jul 2027" },
  ],
};

function ascii(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += String.fromCharCode(b);
  return out;
}

describe("direction PDF", () => {
  it("renders an A4 direction PDF", () => {
    const bytes = renderDirectionPdf(complete);
    expect(ascii(bytes.subarray(0, 5))).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(900);
    expect(ascii(bytes)).toContain("595.28 841.89"); // A4 media box
  });

  it("carries the document header, title, and authorisation id", () => {
    const text = ascii(renderDirectionPdf(complete));
    expect(text).toContain("DIRECTION TO ADMINISTER");
    expect(text).toContain("AUTH-7G2K-09");
    expect(text).toContain("Treatment direction");
  });

  it("prints every Clause 68C field value and the per-administration row", () => {
    const text = ascii(renderDirectionPdf(complete));
    for (const value of [
      "Amara Boyd", "14 Marra St, Bondi NSW 2026", "Dr Adrian Voss", "02 9388 4410",
      "RN Sarah Chen", "2026-06-17", "6 months",
      "Up to 5, at intervals of at least 4 weeks",
      "Botulinum toxin type A, injection", "Glabella",
    ]) {
      expect(text).toContain(value);
    }
    expect(text).toContain("PER ADMINISTRATION");
    expect(text).toContain("For each administration the nurse must record");
  });

  it("prints the patient DOB, allergies, treatment category, and authorisation status/expiry", () => {
    const text = ascii(renderDirectionPdf(complete));
    for (const value of ["12/3/1991", "None recorded", "Neurotoxin", "Approved 17 Jun 2026", "17 Dec 2026"]) {
      expect(text).toContain(value);
    }
  });

  it("prints the prescriber authorisation attestation", () => {
    const text = ascii(renderDirectionPdf(complete));
    expect(text).toContain("PRESCRIBER AUTHORISATION");
    expect(text).toContain("Electronically authorised by Dr Adrian Voss");
  });

  it("lists emergency standing authorisations, and 'None on file.' when there are none", () => {
    const withEmergencies = ascii(renderDirectionPdf(complete));
    expect(withEmergencies).toContain("EMERGENCY STANDING AUTHORISATIONS");
    expect(withEmergencies).toContain("Adrenaline"); // em-dash label prefix (dash is WinAnsi-encoded)
    expect(withEmergencies).toContain("expires 8 Jul 2027");

    const none = ascii(renderDirectionPdf({ ...complete, emergencyAuthorisations: [] }));
    expect(none).toContain("None on file.");
  });

  it("draws an em-dash placeholder for a blank value instead of failing", () => {
    const bytes = renderDirectionPdf({ ...complete, premisesOfAdministration: "" });
    expect(ascii(bytes.subarray(0, 5))).toBe("%PDF-");
  });

  it("survives characters outside Latin-1 (transliterated, never thrown)", () => {
    const bytes = renderDirectionPdf({
      ...complete,
      administrationCountAndIntervals: "Up to 5, ≥ 4 weeks apart",
    });
    expect(ascii(bytes)).toContain(">= 4 weeks apart");
  });

  it("escapes newlines in values per the PDF spec (no raw line break inside a literal string)", () => {
    const text = ascii(renderDirectionPdf({
      ...complete,
      patientAddress: "Unit 2\n14 Marra St, Bondi NSW 2026",
    }));
    // The content stream must carry the two-character sequence \n, not a control byte.
    expect(text).toContain("(Unit 2\\n14 Marra St, Bondi NSW 2026)");
    expect(text).not.toContain("Unit 2\n14 Marra St");
  });

  it("names the download after the authorisation", () => {
    expect(directionPdfFilename("AUTH-7G2K-09")).toBe("AestheticX-Direction-AUTH-7G2K-09.pdf");
  });
});

// NSW Clause 68C direction — validation vectors ported from the backend's
// direction.test.ts (wire truth) and AXDomainTests/SchedulingAndComplianceTests.swift.
import { describe, expect, it } from "vitest";
import {
  CLAUSE_68C_FIELDS,
  DEFAULT_CAPTURED_FIELDS,
  buildDirectionDraft,
  directionPrescriberName,
  directionResponsibleProvider,
  emergencyKindLabel,
  formatDob,
  formatDocDate,
  missingDirectionFields,
  type DirectionContent,
} from "@/lib/demo/direction";
import { LUMIERE } from "@/lib/demo/accounts";
import type { EmergencyAuthorisation, MedicationItem } from "@/lib/demo/types";

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

const letybo: MedicationItem = {
  name: "Letybo",
  dosage: "16",
  category: "neurotoxin",
  unit: "units",
  areas: ["Forehead", "Glabella"],
};

const adrenalineRec: EmergencyAuthorisation = {
  id: "p1_u-voss_adrenaline",
  patientID: "p1",
  doctorID: "u-voss",
  doctorName: "Dr Elena Voss",
  kind: "adrenaline",
  createdAt: Date.UTC(2026, 6, 8),
  refreshedAt: Date.UTC(2026, 6, 8),
  expiresAt: Date.UTC(2027, 6, 8), // 8 Jul 2027
  sourceAuthorisationIDs: ["auth-1"],
};

describe("Clause 68C required fields", () => {
  it("lists every field the regulation requires in the direction", () => {
    expect(CLAUSE_68C_FIELDS).toEqual(
      expect.arrayContaining([
        "Patient name", "Patient address",
        "Prescriber name", "Prescriber phone", "Principal place of practice",
        "Premises of administration", "Responsible provider",
        "Date patient reviewed", "Period direction has effect",
        "Number and intervals of administration",
        "Substance name and form", "Body site", "Route", "Quantity",
      ]),
    );
  });

  it("reports no missing fields for a complete direction", () => {
    expect(missingDirectionFields(complete)).toEqual([]);
  });

  it("flags a missing premises of administration", () => {
    const incomplete = { ...complete, premisesOfAdministration: "" };
    expect(missingDirectionFields(incomplete)).toContain("Premises of administration");
  });

  it("treats whitespace-only values as missing", () => {
    const incomplete = { ...complete, prescriberPhone: "   " };
    expect(missingDirectionFields(incomplete)).toContain("Prescriber phone");
  });

  it("flags an administration missing its body site", () => {
    const incomplete: DirectionContent = {
      ...complete,
      administrations: [{ substanceAndForm: "Botox, inj", category: "Neurotoxin", bodySite: "", route: "IM", quantity: "20 U" }],
    };
    expect(missingDirectionFields(incomplete)).toContain("Body site");
  });

  it("flags an administration missing its quantity", () => {
    const incomplete: DirectionContent = {
      ...complete,
      administrations: [{ substanceAndForm: "Botox, inj", category: "Neurotoxin", bodySite: "Glabella", route: "IM", quantity: "" }],
    };
    expect(missingDirectionFields(incomplete)).toContain("Quantity");
  });

  it("flags a direction with no administrations", () => {
    expect(missingDirectionFields({ ...complete, administrations: [] }))
      .toContain("Number and intervals of administration");
  });

  it("does not gate export on the derived fields (empty allergies / no emergencies are valid)", () => {
    const derived: DirectionContent = { ...complete, patientAllergies: "None recorded", emergencyAuthorisations: [] };
    expect(missingDirectionFields(derived)).toEqual([]);
  });
});

describe("direction document formatting helpers", () => {
  it("formats DOB as d/m/yyyy without zero-padding (app convention)", () => {
    expect(formatDob({ year: 1991, month: 3, day: 12 })).toBe("12/3/1991");
    expect(formatDob({ year: 2004, month: 11, day: 5 })).toBe("5/11/2004");
  });

  it("formats a document date with fixed month names, read in Australia/Sydney", () => {
    expect(formatDocDate(Date.UTC(2026, 5, 17))).toBe("17 Jun 2026");
    expect(formatDocDate(Date.UTC(2027, 6, 8))).toBe("8 Jul 2027");
    expect(formatDocDate(Date.UTC(2026, 11, 17))).toBe("17 Dec 2026");
  });

  it("uses the jurisdiction (Australia/Sydney) calendar date, not UTC", () => {
    // 22:00 UTC on 17 Jun is already 08:00 on 18 Jun in Sydney (UTC+10) — a real approval time.
    expect(formatDocDate(Date.UTC(2026, 5, 17, 22, 0))).toBe("18 Jun 2026");
    // 13:00 UTC on 31 Dec is 00:00 on 1 Jan in Sydney (UTC+11, AEDT) — year rolls over too.
    expect(formatDocDate(Date.UTC(2026, 11, 31, 13, 0))).toBe("1 Jan 2027");
  });

  it("labels emergency kinds to match the patient-file panel", () => {
    expect(emergencyKindLabel("adrenaline")).toBe("Adrenaline — anaphylaxis");
    expect(emergencyKindLabel("hyaluronidase")).toBe("Hyaluronidase / Hylase");
  });
});

describe("direction builder (§3.2 capture → complete direction)", () => {
  function draft(overrides: Partial<Parameters<typeof buildDirectionDraft>[0]> = {}) {
    return buildDirectionDraft({
      directionId: "auth-1",
      patientName: "Amara Boyd",
      patientAddress: "14 Marra St",
      patientDob: { year: 1991, month: 3, day: 12 },
      allergies: "Penicillin",
      prescriberName: "Dr Voss",
      responsibleProvider: "RN Chen",
      medications: [letybo],
      expiresAt: Date.UTC(2026, 11, 17), // 17 Dec 2026
      approvedAt: Date.UTC(2026, 5, 17), // 17 Jun 2026
      emergencies: [adrenalineRec],
      captured: {
        prescriberPhone: "02 9388 4410",
        prescriberPrincipalPlace: "88 Oxford St",
        premisesOfAdministration: "12 Hall St",
        directionPeriod: "6 months",
        administrationCountAndIntervals: "Up to 5, ≥4 wks",
        route: "IM",
      },
      ...overrides,
    });
  }

  it("assembles a complete direction from patient data plus captured fields", () => {
    const direction = draft();
    expect(missingDirectionFields(direction)).toEqual([]);
    expect(direction.administrations).toHaveLength(1);
    expect(direction.administrations[0].substanceAndForm).toBe("Letybo");
    expect(direction.administrations[0].bodySite).toBe("Forehead, Glabella");
    // letybo carries no per-item route (legacy) → the captured fallback applies.
    expect(direction.administrations[0].route).toBe("IM");
    expect(direction.administrations[0].quantity).toBe("16 U");
  });

  it("labels the item's stored route, ignoring the captured fallback (round 6)", () => {
    const direction = draft({ medications: [{ ...letybo, route: "supraPeriosteal" }] });
    expect(direction.administrations[0].route).toBe("Supra-periosteal");
  });

  it("derives the reviewed date from the approval instant in Sydney time (round 6)", () => {
    expect(draft().patientReviewedISO).toBe("2026-06-17");
    // 22:00 UTC on 17 Jun is already 18 Jun in Sydney — the document must not drift.
    expect(draft({ approvedAt: Date.UTC(2026, 5, 17, 22, 0) }).patientReviewedISO).toBe("2026-06-18");
  });

  it("derives the patient DOB, allergies, category, expiry, approval and attestation", () => {
    const direction = draft();
    expect(direction.patientDateOfBirth).toBe("12/3/1991");
    expect(direction.patientAllergies).toBe("Penicillin");
    expect(direction.administrations[0].category).toBe("Neurotoxin");
    expect(direction.authorisationExpires).toBe("17 Dec 2026");
    expect(direction.authorisationStatus).toBe("Approved 17 Jun 2026");
    expect(direction.prescriberAttestation).toBe("Electronically authorised by Dr Voss");
  });

  it("renders blank allergies as 'None recorded'", () => {
    expect(draft({ allergies: "   " }).patientAllergies).toBe("None recorded");
  });

  it("maps the prescriber's active emergency standing authorisations", () => {
    expect(draft().emergencyAuthorisations).toEqual([
      { label: "Adrenaline — anaphylaxis", detail: "standing order · expires 8 Jul 2027" },
    ]);
  });

  it("carries no emergency refs when the prescriber has none", () => {
    expect(draft({ emergencies: [] }).emergencyAuthorisations).toEqual([]);
  });

  it("surfaces a missing captured field through missingDirectionFields", () => {
    const direction = draft({ captured: { ...DEFAULT_CAPTURED_FIELDS, prescriberPhone: "" } });
    expect(missingDirectionFields(direction)).toContain("Prescriber phone");
  });

  it("captures the prefilled defaults (period, intervals) — route never defaults (round 6)", () => {
    expect(DEFAULT_CAPTURED_FIELDS.directionPeriod).toBe("6 months");
    // PRN, not an invented count-and-interval schedule. The old default asserted "Up to 5,
    // >= 4 weeks apart" — a clinical claim nobody entered, on a legal document.
    expect(DEFAULT_CAPTURED_FIELDS.administrationCountAndIntervals).toBe("PRN");
    expect(DEFAULT_CAPTURED_FIELDS.route).toBe("");
    expect(DEFAULT_CAPTURED_FIELDS.prescriberPhone).toBe("");
  });
});

describe("direction party resolution (port of AuthorisationCard doctorName/requesterBadge)", () => {
  it("resolves the prescriber display name from the demo accounts", () => {
    expect(directionPrescriberName("u-voss")).toBe("Dr Elena Voss");
  });

  it("falls back to the raw doctor id when unknown", () => {
    expect(directionPrescriberName("u-nobody")).toBe("u-nobody");
  });

  it("badges a clinic nurse with the clinic name", () => {
    expect(directionResponsibleProvider("u-sarah", LUMIERE.id)).toBe(`Sarah Chen @ ${LUMIERE.name}`);
  });

  it("uses the bare nurse name outside the clinic", () => {
    expect(directionResponsibleProvider("u-sarah", null)).toBe("Sarah Chen");
  });

  it("falls back to the raw nurse id when unknown", () => {
    expect(directionResponsibleProvider("u-ghost", null)).toBe("u-ghost");
  });
});

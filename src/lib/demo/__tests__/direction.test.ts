// NSW Clause 68C direction — validation vectors ported from the backend's
// direction.test.ts (wire truth) and AXDomainTests/SchedulingAndComplianceTests.swift.
import { describe, expect, it } from "vitest";
import {
  CLAUSE_68C_FIELDS,
  DEFAULT_CAPTURED_FIELDS,
  buildDirectionDraft,
  directionPrescriberName,
  directionResponsibleProvider,
  missingDirectionFields,
  type DirectionContent,
} from "@/lib/demo/direction";
import { LUMIERE } from "@/lib/demo/accounts";
import type { MedicationItem } from "@/lib/demo/types";

const complete: DirectionContent = {
  directionId: "AUTH-7G2K-09",
  patientName: "Amara Boyd",
  patientAddress: "14 Marra St, Bondi NSW 2026",
  prescriberName: "Dr Adrian Voss",
  prescriberPhone: "02 9388 4410",
  prescriberPrincipalPlace: "A. Voss Medical, 88 Oxford St, Paddington NSW 2021",
  premisesOfAdministration: "Lumière Aesthetics, 12 Hall St, Bondi Beach NSW 2026",
  responsibleProvider: "RN Sarah Chen",
  patientReviewedISO: "2026-06-17",
  directionPeriod: "6 months",
  administrationCountAndIntervals: "Up to 5, at intervals of at least 4 weeks",
  administrations: [
    { substanceAndForm: "Botulinum toxin type A, injection", bodySite: "Glabella", route: "IM", quantity: "20 units" },
  ],
};

const letybo: MedicationItem = {
  name: "Letybo",
  dosage: "16",
  category: "neurotoxin",
  unit: "units",
  areas: ["Forehead", "Glabella"],
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
      administrations: [{ substanceAndForm: "Botox, inj", bodySite: "", route: "IM", quantity: "20 U" }],
    };
    expect(missingDirectionFields(incomplete)).toContain("Body site");
  });

  it("flags an administration missing its quantity", () => {
    const incomplete: DirectionContent = {
      ...complete,
      administrations: [{ substanceAndForm: "Botox, inj", bodySite: "Glabella", route: "IM", quantity: "" }],
    };
    expect(missingDirectionFields(incomplete)).toContain("Quantity");
  });

  it("flags a direction with no administrations", () => {
    expect(missingDirectionFields({ ...complete, administrations: [] }))
      .toContain("Number and intervals of administration");
  });
});

describe("direction builder (§3.2 capture → complete direction)", () => {
  it("assembles a complete direction from patient data plus captured fields", () => {
    const direction = buildDirectionDraft({
      directionId: "auth-1",
      patientName: "Amara Boyd",
      patientAddress: "14 Marra St",
      prescriberName: "Dr Voss",
      responsibleProvider: "RN Chen",
      medications: [letybo],
      captured: {
        prescriberPhone: "02 9388 4410",
        prescriberPrincipalPlace: "88 Oxford St",
        premisesOfAdministration: "12 Hall St",
        patientReviewedISO: "2026-06-17",
        directionPeriod: "6 months",
        administrationCountAndIntervals: "Up to 5, ≥4 wks",
        route: "IM",
      },
    });
    expect(missingDirectionFields(direction)).toEqual([]);
    expect(direction.administrations).toHaveLength(1);
    expect(direction.administrations[0].substanceAndForm).toBe("Letybo");
    expect(direction.administrations[0].bodySite).toBe("Forehead, Glabella");
    expect(direction.administrations[0].route).toBe("IM");
    expect(direction.administrations[0].quantity).toBe("16 U");
  });

  it("surfaces a missing captured field through missingDirectionFields", () => {
    const direction = buildDirectionDraft({
      directionId: "auth-1",
      patientName: "A",
      patientAddress: "B",
      prescriberName: "C",
      responsibleProvider: "D",
      medications: [letybo],
      captured: { ...DEFAULT_CAPTURED_FIELDS, prescriberPhone: "" },
    });
    expect(missingDirectionFields(direction)).toContain("Prescriber phone");
  });

  it("captures iOS's prefilled defaults (period, intervals, route)", () => {
    expect(DEFAULT_CAPTURED_FIELDS.directionPeriod).toBe("6 months");
    expect(DEFAULT_CAPTURED_FIELDS.administrationCountAndIntervals).toBe("Up to 5, ≥ 4 weeks apart");
    expect(DEFAULT_CAPTURED_FIELDS.route).toBe("IM");
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

import { describe, expect, it } from "vitest";
import { premiseForCapture, routeForCapture } from "@/lib/demo/direction";
import type { AuthorisationRequest, MedicationItem, Premise } from "@/lib/demo/types";

// The Clause 68C capture dialog left fields blank that the app already held, so a clinician
// retyped them onto a legal document. These are the two fallback rules that close that gap —
// and, just as importantly, the cases where they must REFUSE to fill rather than guess.

const BONDI: Premise = { id: "p-bondi", name: "Sarah Chen Aesthetics", address: "12 Hall St, Bondi Beach NSW 2026" };
const SURRY: Premise = { id: "p-surry", name: "The Skin Room", address: "3/21 Crown St, Surry Hills NSW 2010" };
const STAMPED: Premise = { id: "p-stamped", name: "Stamped Clinic", address: "1 Stamp Rd, Sydney NSW 2000" };

function med(over: Partial<MedicationItem> = {}): MedicationItem {
  return { name: "Botox", dosage: "20", category: "neurotoxin", unit: "units", areas: [], ...over };
}

function request(items: MedicationItem[]): AuthorisationRequest {
  return {
    id: "req-1",
    patientID: "p-1",
    nurse: { id: "u-sarah", name: "Sarah Chen" },
    doctorID: "u-voss",
    context: { kind: "independent" },
    items,
    status: "approved",
    createdAt: 0,
  };
}

const LUMIERE_REF = { id: "clinic-lumiere", name: "Lumière Clinic", address: "2 Notts Ave, Bondi Beach NSW 2026" };

describe("premiseForCapture — independent context", () => {
  it("prefers the premise stamped on the authorisation", () => {
    // The stamp records where administration was actually authorised — it must win over
    // whatever the acting user happens to have selected today.
    const line = premiseForCapture({ stamped: STAMPED, clinicID: null, clinic: null, actingPremise: BONDI });
    expect(line).toBe("Stamped Clinic, 1 Stamp Rd, Sydney NSW 2000");
  });

  it("falls back to the acting user's premise when nothing is stamped", () => {
    const line = premiseForCapture({ stamped: null, clinicID: null, clinic: null, actingPremise: SURRY });
    expect(line).toBe("The Skin Room, 3/21 Crown St, Surry Hills NSW 2010");
  });

  it("is blank when there is nothing to fall back to", () => {
    expect(premiseForCapture({ stamped: null, clinicID: null, clinic: null, actingPremise: null })).toBe("");
    expect(premiseForCapture({ stamped: undefined, clinicID: null, clinic: null, actingPremise: null })).toBe("");
  });

  it("is blank when the stamped premise has no address and there is no fallback", () => {
    const empty: Premise = { id: "p-x", name: "Nameless", address: "   " };
    expect(premiseForCapture({ stamped: empty, clinicID: null, clinic: null, actingPremise: null })).toBe("");
  });
});

// A clinic-context request stamps premise: null DELIBERATELY — it is a signal meaning "use the
// clinic's address" (backend.ts submitRequest), not "unknown". Treating it as unknown and
// substituting the acting nurse's own premises puts the WRONG address on a legal document:
// Sarah Chen holds both an independent and a Lumière identity, so her private Bondi practice
// would be printed in place of the clinic she actually treated at. Precedence here mirrors
// buildApprovalDocumentModel (approvalPdf.ts) so the capture dialog and the approval document
// cannot disagree about where administration happened.
describe("premiseForCapture — clinic context", () => {
  it("uses the clinic's address, never the acting nurse's own premises", () => {
    const line = premiseForCapture({ stamped: null, clinicID: LUMIERE_REF.id, clinic: LUMIERE_REF, actingPremise: BONDI });
    expect(line).toBe("Lumière Clinic, 2 Notts Ave, Bondi Beach NSW 2026");
    expect(line).not.toContain("Sarah Chen Aesthetics");
  });

  it("uses the clinic's address even over a stamped premise, as the approval document does", () => {
    const line = premiseForCapture({ stamped: STAMPED, clinicID: LUMIERE_REF.id, clinic: LUMIERE_REF, actingPremise: BONDI });
    expect(line).toBe("Lumière Clinic, 2 Notts Ave, Bondi Beach NSW 2026");
  });

  it("refuses the acting nurse's premises when the clinic cannot be resolved", () => {
    // The originating request isn't loaded, so we cannot name the clinic. Blank prompts the
    // clinician; falling through to their private practice would silently misattribute it.
    const line = premiseForCapture({ stamped: null, clinicID: LUMIERE_REF.id, clinic: null, actingPremise: BONDI });
    expect(line).toBe("");
  });
});

describe("routeForCapture", () => {
  it("recovers the route from the single matching request item", () => {
    const r = request([med({ route: "Intradermal" })]);
    expect(routeForCapture(med(), r)).toBe("Intradermal");
  });

  it("matches on name and dosage, ignoring case and surrounding space", () => {
    const r = request([med({ name: "  botox ", dosage: " 20 ", route: "Subcutaneous" })]);
    expect(routeForCapture(med({ name: "Botox", dosage: "20" }), r)).toBe("Subcutaneous");
  });

  it("picks the right line when a request has several distinct items", () => {
    const r = request([
      med({ name: "Botox", dosage: "20", route: "Intramuscular" }),
      med({ name: "Juvederm", dosage: "1", route: "Subcutaneous" }),
    ]);
    expect(routeForCapture(med({ name: "Juvederm", dosage: "1" }), r)).toBe("Subcutaneous");
  });

  it("refuses to guess when more than one item matches", () => {
    // Two identical name+dosage lines differing only by body site. Filling either could state
    // the wrong route of administration on a legal document — leave it to the clinician.
    const r = request([
      med({ name: "Botox", dosage: "20", route: "Intramuscular" }),
      med({ name: "Botox", dosage: "20", route: "Intradermal" }),
    ]);
    expect(routeForCapture(med(), r)).toBe("");
  });

  it("is blank when the matching item carries no route", () => {
    expect(routeForCapture(med(), request([med()]))).toBe("");
    expect(routeForCapture(med(), request([med({ route: "   " })]))).toBe("");
  });

  it("is blank when no item matches", () => {
    expect(routeForCapture(med({ name: "Dysport" }), request([med({ route: "Intradermal" })]))).toBe("");
  });

  it("is blank when the originating request is unavailable", () => {
    // Live may not have the request loaded; the dialog must degrade, not throw.
    expect(routeForCapture(med(), undefined)).toBe("");
    expect(routeForCapture(med(), null)).toBe("");
  });
});

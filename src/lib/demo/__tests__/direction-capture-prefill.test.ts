import { describe, expect, it } from "vitest";
import { premiseForCapture, routeForCapture } from "@/lib/demo/direction";
import { ROUTES_OF_ADMINISTRATION } from "@/lib/demo/types";
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

const LUMIERE_PREMISE: Premise = { id: "clinic-lumiere", name: "Lumière Clinic", address: "2 Notts Ave, Bondi Beach NSW 2026" };

describe("premiseForCapture — independent context", () => {
  it("prefers the premise stamped on the authorisation", () => {
    // The stamp records where administration was actually authorised — it must win over
    // whatever the acting user happens to have selected today.
    const line = premiseForCapture({ stamped: STAMPED, clinicID: null, clinicPremise: null, actingPremise: BONDI });
    expect(line).toBe("Stamped Clinic, 1 Stamp Rd, Sydney NSW 2000");
  });

  it("falls back to the acting user's premise when nothing is stamped", () => {
    const line = premiseForCapture({ stamped: null, clinicID: null, clinicPremise: null, actingPremise: SURRY });
    expect(line).toBe("The Skin Room, 3/21 Crown St, Surry Hills NSW 2010");
  });

  it("is blank when there is nothing to fall back to", () => {
    expect(premiseForCapture({ stamped: null, clinicID: null, clinicPremise: null, actingPremise: null })).toBe("");
    expect(premiseForCapture({ stamped: undefined, clinicID: null, clinicPremise: null, actingPremise: null })).toBe("");
  });

  it("is blank when the stamped premise has no address and there is no fallback", () => {
    const empty: Premise = { id: "p-x", name: "Nameless", address: "   " };
    expect(premiseForCapture({ stamped: empty, clinicID: null, clinicPremise: null, actingPremise: null })).toBe("");
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
    const line = premiseForCapture({ stamped: null, clinicID: LUMIERE_PREMISE.id, clinicPremise: LUMIERE_PREMISE, actingPremise: BONDI });
    expect(line).toBe("Lumière Clinic, 2 Notts Ave, Bondi Beach NSW 2026");
    expect(line).not.toContain("Sarah Chen Aesthetics");
  });

  it("uses the clinic's address even over a stamped premise, as the approval document does", () => {
    const line = premiseForCapture({ stamped: STAMPED, clinicID: LUMIERE_PREMISE.id, clinicPremise: LUMIERE_PREMISE, actingPremise: BONDI });
    expect(line).toBe("Lumière Clinic, 2 Notts Ave, Bondi Beach NSW 2026");
  });

  it("falls through to a stamped premise when the clinic premises are not stamped", () => {
    // Unreachable via submitRequest today (a clinic request always stamps null), but it is a
    // real branch and mirrors buildApprovalDocumentModel's own fall-through. Pinned so the two
    // cannot drift apart if clinic requests ever start stamping a premise.
    const line = premiseForCapture({ stamped: STAMPED, clinicID: LUMIERE_PREMISE.id, clinicPremise: null, actingPremise: BONDI });
    expect(line).toBe("Stamped Clinic, 1 Stamp Rd, Sydney NSW 2000");
    expect(line).not.toContain("Sarah Chen Aesthetics");
  });

  it("yields blank for a clinic authorisation approved before the stamp existed", () => {
    // No backfill: authorisations approved before approveRequest stamped clinicPremise carry
    // none. They must keep prompting rather than reaching for the acting nurse's private
    // practice — the misattribution this precedence exists to prevent.
    expect(premiseForCapture({
      stamped: null, clinicID: "clinic-lumiere", clinicPremise: undefined, actingPremise: BONDI,
    })).toBe("");
  });

  it("uses a stamped clinic premises that carries no name, address-only", () => {
    // clinicPremiseStamp deliberately allows a blank name: an address alone locates the
    // premises, and the fail-closed rule governs party lines, not the location.
    expect(premiseForCapture({
      stamped: null,
      clinicID: "clinic-lumiere",
      clinicPremise: { id: "clinic-lumiere", name: "", address: "2 Notts Ave, Bondi Beach NSW 2026" },
      actingPremise: BONDI,
    })).toBe("2 Notts Ave, Bondi Beach NSW 2026");
  });

  it("refuses the acting nurse's premises when the clinic premises are not stamped", () => {
    // The originating request isn't loaded, so we cannot name the clinic. Blank prompts the
    // clinician; falling through to their private practice would silently misattribute it.
    const line = premiseForCapture({ stamped: null, clinicID: LUMIERE_PREMISE.id, clinicPremise: null, actingPremise: BONDI });
    expect(line).toBe("");
  });
});

describe("routeForCapture", () => {
  it("recovers the route from the single matching request item", () => {
    const r = request([med({ route: "intradermal" })]);
    expect(routeForCapture(med(), r)).toBe("intradermal");
  });

  it("matches on name and dosage, ignoring case and surrounding space", () => {
    const r = request([med({ name: "  botox ", dosage: " 20 ", route: "subcutaneous" })]);
    expect(routeForCapture(med({ name: "Botox", dosage: "20" }), r)).toBe("subcutaneous");
  });

  it("picks the right line when a request has several distinct items", () => {
    const r = request([
      med({ name: "Botox", dosage: "20", route: "intramuscular" }),
      med({ name: "Juvederm", dosage: "1", route: "subcutaneous" }),
    ]);
    expect(routeForCapture(med({ name: "Juvederm", dosage: "1" }), r)).toBe("subcutaneous");
  });

  it("refuses to guess when more than one item matches", () => {
    // Two identical name+dosage lines differing only by body site. Filling either could state
    // the wrong route of administration on a legal document — leave it to the clinician.
    const r = request([
      med({ name: "Botox", dosage: "20", route: "intramuscular" }),
      med({ name: "Botox", dosage: "20", route: "intradermal" }),
    ]);
    expect(routeForCapture(med(), r)).toBe("");
  });

  it("is blank when the matching item carries no route", () => {
    expect(routeForCapture(med(), request([med()]))).toBe("");
    expect(routeForCapture(med(), request([med({ route: "   " })]))).toBe("");
  });

  it("is blank when no item matches", () => {
    expect(routeForCapture(med({ name: "Dysport" }), request([med({ route: "intradermal" })]))).toBe("");
  });

  it("is blank when the originating request is unavailable", () => {
    // Live may not have the request loaded; the dialog must degrade, not throw.
    expect(routeForCapture(med(), undefined)).toBe("");
    expect(routeForCapture(med(), null)).toBe("");
  });

  // MedicationItem.route is a loose `string` and live values come from a Cloud Function whose
  // scheme this repo does not control, so a stored route need not be one of the five. Recovering
  // one unvalidated is worse than recovering nothing: the capture dialog's five-option selector
  // cannot represent it, and an HTML select handed an unmatched value silently selects its first
  // enabled option — so "Intramuscular" would DISPLAY as "Intradermal" while the export still
  // said Intramuscular. Refusing the value routes it through the same prompt as any other
  // unresolved field, which is the whole fail-closed doctrine.
  it("refuses a route that is not one of the five canonical values", () => {
    for (const bogus of ["Intramuscular", "IM", "intra-dermal", "IntraDermal", "topical"]) {
      expect(routeForCapture(med(), request([med({ route: bogus })]))).toBe("");
    }
  });

  it("accepts every canonical value", () => {
    for (const route of ROUTES_OF_ADMINISTRATION) {
      expect(routeForCapture(med(), request([med({ route })]))).toBe(route);
    }
  });
});

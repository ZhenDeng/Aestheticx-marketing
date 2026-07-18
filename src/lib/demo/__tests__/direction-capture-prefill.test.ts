import { describe, expect, it } from "vitest";
import { premiseForCapture, routeForCapture } from "@/lib/demo/direction";
import type { AuthorisationRequest, MedicationItem, Premise, UserProfile } from "@/lib/demo/types";

// The Clause 68C capture dialog left fields blank that the app already held, so a clinician
// retyped them onto a legal document. These are the two fallback rules that close that gap —
// and, just as importantly, the cases where they must REFUSE to fill rather than guess.

const BONDI: Premise = { id: "p-bondi", name: "Sarah Chen Aesthetics", address: "12 Hall St, Bondi Beach NSW 2026" };
const SURRY: Premise = { id: "p-surry", name: "The Skin Room", address: "3/21 Crown St, Surry Hills NSW 2010" };
const STAMPED: Premise = { id: "p-stamped", name: "Stamped Clinic", address: "1 Stamp Rd, Sydney NSW 2000" };

function profile(over: Partial<UserProfile> = {}): UserProfile {
  return { ahpra: "", abn: "", phone: "", address: "", principalPlace: "", premises: [], ...over };
}

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

describe("premiseForCapture", () => {
  it("prefers the premise stamped on the authorisation", () => {
    // The stamp records where administration was actually authorised — it must win over
    // whatever the acting user happens to have selected today.
    const line = premiseForCapture(STAMPED, profile({ premises: [BONDI], selectedPremiseId: BONDI.id }));
    expect(line).toBe("Stamped Clinic, 1 Stamp Rd, Sydney NSW 2000");
  });

  it("falls back to the acting user's selected premise when nothing is stamped", () => {
    const line = premiseForCapture(null, profile({ premises: [BONDI, SURRY], selectedPremiseId: SURRY.id }));
    expect(line).toBe("The Skin Room, 3/21 Crown St, Surry Hills NSW 2010");
  });

  it("falls back through default to first", () => {
    expect(premiseForCapture(null, profile({ premises: [BONDI, SURRY], defaultPremiseId: SURRY.id })))
      .toBe("The Skin Room, 3/21 Crown St, Surry Hills NSW 2010");
    expect(premiseForCapture(null, profile({ premises: [BONDI, SURRY] })))
      .toBe("Sarah Chen Aesthetics, 12 Hall St, Bondi Beach NSW 2026");
  });

  it("survives a dangling selection rather than erroring", () => {
    // The selected premise was deleted since — fall back, don't blow up the dialog.
    const line = premiseForCapture(null, profile({ premises: [BONDI], selectedPremiseId: "p-gone" }));
    expect(line).toBe("Sarah Chen Aesthetics, 12 Hall St, Bondi Beach NSW 2026");
  });

  it("is blank when there is nothing to fall back to", () => {
    expect(premiseForCapture(null, profile())).toBe("");
    expect(premiseForCapture(undefined, profile())).toBe("");
  });

  it("is blank when the stamped premise has no address and there is no fallback", () => {
    const empty: Premise = { id: "p-x", name: "Nameless", address: "   " };
    expect(premiseForCapture(empty, profile())).toBe("");
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

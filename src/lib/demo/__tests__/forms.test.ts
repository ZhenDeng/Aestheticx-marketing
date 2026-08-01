import { describe, it, expect } from "vitest";
import {
  FORM_TEMPLATE_KINDS, templateDisplayName, formTemplate, OFF_LABEL_CLAUSE,
} from "@/lib/demo/forms";

describe("form templates", () => {
  it("has all eight templates", () => {
    expect(FORM_TEMPLATE_KINDS).toHaveLength(8);
    expect(FORM_TEMPLATE_KINDS).toContain("antiwrinkleConsent");
    expect(FORM_TEMPLATE_KINDS).toContain("photoVideoConsent");
  });
  it("every treatment consent includes the off-label clause; non-treatment forms do not", () => {
    const nonTreatment = ["aestheticHistory", "photoVideoConsent"];
    for (const kind of FORM_TEMPLATE_KINDS) {
      const t = formTemplate(kind);
      if (nonTreatment.includes(kind)) {
        expect(t.clauses).not.toContain(OFF_LABEL_CLAUSE);
      } else {
        expect(t.clauses).toContain(OFF_LABEL_CLAUSE);
      }
    }
  });
  it("fullText starts with the intro", () => {
    const t = formTemplate("antiwrinkleConsent");
    expect(t.fullText[0]).toBe(t.intro);
    expect(t.fullText.length).toBe(1 + t.clauses.length);
  });
  it("the aesthetic history form has its screening questions", () => {
    const t = formTemplate("aestheticHistory");
    const ids = t.questions.map((q) => q.id);
    expect(ids).toContain("pregnant");
    // Diverges from the iOS FormLibrary.swift source (9 questions): the blanket
    // photo-marketing question moved to the Photo & Video Consent form (01/08).
    expect(ids).toContain("photo-clinical");
    expect(ids).not.toContain("photo-marketing");
    expect(t.questions.length).toBeGreaterThanOrEqual(8);
  });
  it("the photo & video consent asks about every use scenario, each separately consentable", () => {
    const t = formTemplate("photoVideoConsent");
    expect(templateDisplayName("photoVideoConsent")).toBe("Photo & Video Consent");
    expect(t.requiresSignature).toBe(true);
    expect(t.questions.map((q) => q.id)).toEqual([
      "use-clinical-record",
      "use-education-training",
      "use-conference-publication",
      "use-advertising",
      "use-social-media",
      "use-consultation-examples",
      "prefer-deidentified",
    ]);
    // Every scenario is an independent yes/no — no free text, no forced detail.
    for (const q of t.questions) {
      expect(q.kind).toEqual({ type: "yesNo", detailPrompt: null });
    }
    expect(t.fullText[0]).toBe(t.intro);
  });
  it("consent forms carry only the changed-history confirm question", () => {
    const t = formTemplate("haFillerConsent");
    expect(t.questions.map((q) => q.id)).toEqual(["changed-history"]);
  });
  it("displayName maps", () => {
    expect(templateDisplayName("haFillerDissolvingConsent")).toBe("Hyalase Consent");
  });
});

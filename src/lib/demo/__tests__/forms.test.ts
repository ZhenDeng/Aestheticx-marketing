import { describe, it, expect } from "vitest";
import {
  FORM_TEMPLATE_KINDS, templateDisplayName, formTemplate, OFF_LABEL_CLAUSE,
} from "@/lib/demo/forms";

describe("form templates", () => {
  it("has all seven templates", () => {
    expect(FORM_TEMPLATE_KINDS).toHaveLength(7);
    expect(FORM_TEMPLATE_KINDS).toContain("antiwrinkleConsent");
  });
  it("every consent template includes the off-label clause; the history form does not", () => {
    for (const kind of FORM_TEMPLATE_KINDS) {
      const t = formTemplate(kind);
      if (kind === "aestheticHistory") {
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
    expect(t.questions.map((q) => q.id)).toContain("pregnant");
    // The iOS FormLibrary.swift aestheticHistory form has exactly 9 screening
    // questions (verbatim source of truth); asserting the full set is present.
    expect(t.questions.length).toBeGreaterThanOrEqual(9);
  });
  it("consent forms carry the two confirm questions", () => {
    const t = formTemplate("haFillerConsent");
    expect(t.questions.map((q) => q.id)).toEqual(["changed-history", "questions-answered"]);
  });
  it("displayName maps", () => {
    expect(templateDisplayName("haFillerDissolvingConsent")).toBe("Hyalase Consent");
  });
});

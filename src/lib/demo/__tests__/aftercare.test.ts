import { describe, it, expect } from "vitest";
import {
  AFTERCARE_CATEGORIES, aftercareDisplayName, aftercareTemplate, assembleAftercare,
  aftercareBody, aftercareEmail, AFTERCARE_CLOSING, AFTERCARE_DEFAULT_BODY,
} from "@/lib/demo/aftercare";

describe("aftercare domain", () => {
  it("exposes the five iOS categories", () => {
    expect(AFTERCARE_CATEGORIES).toEqual([
      "antiwrinkle", "skinbooster", "haFiller", "fatDissolve", "fillerDissolve",
    ]);
  });

  it("uses the iOS display names", () => {
    expect(aftercareDisplayName("haFiller")).toBe("HA filler");
    expect(aftercareDisplayName("fatDissolve")).toBe("Fat dissolve");
  });

  it("carries the verbatim antiwrinkle template", () => {
    expect(aftercareTemplate("antiwrinkle")).toBe(
      "Avoid touching or massaging the treated area for 4 hours. Stay upright for 4 hours and skip strenuous exercise, saunas, and alcohol for 24 hours. Small injection bumps settle within an hour; results appear over 3–14 days. Contact us about any drooping, double vision, or difficulty swallowing."
    );
  });

  it("assembles ticked categories headed by uppercased name, in selection order", () => {
    const out = assembleAftercare(["skinbooster", "antiwrinkle"]);
    expect(out).toBe(
      `— SKINBOOSTER —\n${aftercareTemplate("skinbooster")}\n\n— ANTIWRINKLE —\n${aftercareTemplate("antiwrinkle")}`
    );
  });

  it("assembles empty selection to empty string", () => {
    expect(assembleAftercare([])).toBe("");
  });
});

// 19/07 owner feedback: aftercare now leaves through the practitioner's own mail client
// (same as consent-to-sign), so the body closes by directing questions to them. Deliberately
// NOT "automated / do not reply" — the message comes from the practitioner's own address, a
// reply reaches them, and several templates end with urgent-symptom instructions.
describe("aftercare email body", () => {
  const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

  it("closes with the practitioner-contact line for a single category", () => {
    const body = aftercareBody(["antiwrinkle"]);
    expect(body).toContain(aftercareTemplate("antiwrinkle"));
    expect(body.endsWith(AFTERCARE_CLOSING)).toBe(true);
  });

  it("includes the closing exactly once no matter how many categories are ticked", () => {
    expect(occurrences(aftercareBody(["antiwrinkle"]), AFTERCARE_CLOSING)).toBe(1);
    expect(occurrences(aftercareBody(AFTERCARE_CATEGORIES.slice()), AFTERCARE_CLOSING)).toBe(1);
  });

  it("falls back to the default text, still closed, when nothing is ticked", () => {
    const body = aftercareBody([]);
    expect(body).toContain(AFTERCARE_DEFAULT_BODY);
    expect(occurrences(body, AFTERCARE_CLOSING)).toBe(1);
  });

  it("does not claim the message is automated or discourage replying", () => {
    const body = aftercareBody(["haFiller"]);
    expect(body).not.toMatch(/automated/i);
    expect(body).not.toMatch(/do not reply/i);
    // …and the template's urgent-symptom instruction survives intact.
    expect(body).toContain("URGENT");
  });
});

describe("aftercareEmail", () => {
  it("greets the patient by name and carries the composed body", () => {
    const email = aftercareEmail("Amara Boyd", "BODY");
    expect(email.subject).toBe("Your aftercare instructions");
    expect(email.body).toBe("Hi Amara Boyd,\n\nBODY");
  });

  it("falls back to a bare greeting when no name is on file", () => {
    expect(aftercareEmail("", "BODY").body).toBe("Hi,\n\nBODY");
    expect(aftercareEmail("   ", "BODY").body).toBe("Hi,\n\nBODY");
  });
});

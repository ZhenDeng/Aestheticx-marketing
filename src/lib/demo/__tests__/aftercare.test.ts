import { describe, it, expect } from "vitest";
import {
  AFTERCARE_CATEGORIES, aftercareDisplayName, aftercareTemplate, assembleAftercare,
  aftercareBody, aftercareEmail, aftercareSubject, AFTERCARE_CLOSING, AFTERCARE_DEFAULT_BODY,
} from "@/lib/demo/aftercare";

// 19/07 owner feedback round 2: template texts come from the owner's "aftercare template
// all treatment" document — eight treatments, per-treatment subject lines, "Dear {name},"
// greeting. The document's "automated system email / do not reply" sentence is deliberately
// NOT carried over (see the closing tests below).

describe("aftercare domain", () => {
  it("exposes the eight categories in the owner document's order", () => {
    expect(AFTERCARE_CATEGORIES).toEqual([
      "antiwrinkle", "skinbooster", "haFiller", "biostimulatorFiller",
      "biostimulatorRejuvenation", "fatDissolve", "fillerDissolve", "prpPrf",
    ]);
  });

  it("uses the owner document's treatment names", () => {
    expect(aftercareDisplayName("antiwrinkle")).toBe("Anti-wrinkle");
    expect(aftercareDisplayName("haFiller")).toBe("HA filler");
    expect(aftercareDisplayName("biostimulatorFiller")).toBe("Biostimulator filler");
    expect(aftercareDisplayName("biostimulatorRejuvenation")).toBe("Biostimulator rejuvenation");
    expect(aftercareDisplayName("fillerDissolve")).toBe("Filler dissolve (Hylase)");
    expect(aftercareDisplayName("prpPrf")).toBe("PRP / PRF");
  });

  // One intro + one distinctive instruction per category, verbatim from the document.
  it("carries the owner's template texts", () => {
    const t = aftercareTemplate;
    expect(t("antiwrinkle")).toContain("Thank you for choosing us for your anti-wrinkle treatment today.");
    expect(t("antiwrinkle")).toContain("Keep Upright: Please remain upright for at least 4 hours post-injection.");
    expect(t("antiwrinkle")).toContain("If this is your first session, we highly recommend booking a complimentary 2-week review.");
    expect(t("skinbooster")).toContain("Tiny Papules / Bumps: It is completely normal to see small, raised bumps (papules)");
    expect(t("skinbooster")).toContain("ensure you apply a broad-spectrum SPF 50+ daily.");
    expect(t("haFiller")).toContain("Try to sleep flat on your back for the next 3–5 nights");
    expect(t("haFiller")).toContain("Avoid anti-inflammatory medications (such as Ibuprofen/Nurofen or Aspirin)");
    expect(t("biostimulatorFiller")).toContain("NO Aggressive Manipulation: These structural materials are strategically placed");
    expect(t("biostimulatorRejuvenation")).toContain("Crucial Massage Instructions (The 5-5-5 Rule):");
    expect(t("biostimulatorRejuvenation")).toContain("Massage the treated areas for 5 minutes, 5 times a day, for 5 consecutive days.");
    expect(t("fatDissolve")).toContain("CRITICAL - No Anti-Inflammatories: Do NOT take Nurofen, Ibuprofen, Voltaren");
    expect(t("fillerDissolve")).toContain("Do not attempt any new dermal filler treatments in this exact area for at least 2 full weeks");
    expect(t("prpPrf")).toContain("leave the remaining plasma matrix on your skin for at least 6 to 12 hours before washing");
  });

  // 19/07 owner feedback round 3: the document's bold-labelled points render as a bulleted
  // list. The prefill is plain text (textarea → mailto), so "•"/"◦" characters stand in for
  // the document's <ul>, and the bold labels remain as "Label:" text prefixes.
  it("renders each bold-labelled point as a • bullet line", () => {
    const pointCounts = {
      antiwrinkle: 5, skinbooster: 6, haFiller: 5, biostimulatorFiller: 5,
      biostimulatorRejuvenation: 5, fatDissolve: 6, fillerDissolve: 5, prpPrf: 6,
    } as const;
    for (const c of AFTERCARE_CATEGORIES) {
      const lines = aftercareTemplate(c).split("\n");
      expect(lines.filter((l) => l.startsWith("• ")).length).toBe(pointCounts[c]);
    }
  });

  it("indents the 5-5-5 rule's product-specific sub-points under their heading", () => {
    const lines = aftercareTemplate("biostimulatorRejuvenation").split("\n");
    const head = lines.indexOf("• Crucial Massage Instructions (The 5-5-5 Rule):");
    expect(head).toBeGreaterThan(-1);
    expect(lines[head + 1]).toMatch(/^ {3}◦ If you received Sculptra or Lenisna/);
    expect(lines[head + 2]).toMatch(/^ {3}◦ If you received Gouri/);
  });

  // The document's intro sentence and the anti-wrinkle review invitation are paragraphs,
  // not list items — they stay flush left.
  it("keeps intro and trailing paragraphs unbulleted", () => {
    for (const c of AFTERCARE_CATEGORIES) {
      expect(aftercareTemplate(c).split("\n")[0].startsWith("•")).toBe(false);
    }
    expect(aftercareTemplate("antiwrinkle").split("\n").at(-1)).toBe(
      "If this is your first session, we highly recommend booking a complimentary 2-week review."
    );
  });

  // The closing is appended once by aftercareBody, so no template may carry its own.
  it("keeps the per-template closing out of the templates", () => {
    for (const c of AFTERCARE_CATEGORIES) {
      expect(aftercareTemplate(c)).not.toContain(AFTERCARE_CLOSING);
      expect(aftercareTemplate(c)).not.toMatch(/automated/i);
    }
  });

  it("assembles ticked categories headed by uppercased name, in selection order", () => {
    const out = assembleAftercare(["skinbooster", "antiwrinkle"]);
    expect(out).toBe(
      `— SKINBOOSTER —\n${aftercareTemplate("skinbooster")}\n\n— ANTI-WRINKLE —\n${aftercareTemplate("antiwrinkle")}`
    );
  });

  it("assembles empty selection to empty string", () => {
    expect(assembleAftercare([])).toBe("");
  });
});

// 19/07 owner feedback: aftercare leaves through the practitioner's own mail client
// (same as consent-to-sign), so the body closes by directing questions to them. Deliberately
// NOT the document's "automated system email / do not reply" sentence — the message comes from
// the practitioner's own address and a reply reaches them.
describe("aftercare email body", () => {
  const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

  it("closes with the owner's practitioner-contact line for a single category", () => {
    const body = aftercareBody(["antiwrinkle"]);
    expect(body).toContain(aftercareTemplate("antiwrinkle"));
    expect(AFTERCARE_CLOSING).toBe(
      "If you have any questions regarding your care, please contact your designated practitioner directly."
    );
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
    for (const c of AFTERCARE_CATEGORIES) {
      const body = aftercareBody([c]);
      expect(body).not.toMatch(/automated/i);
      expect(body).not.toMatch(/do not reply/i);
    }
  });
});

describe("aftercareSubject", () => {
  it("uses the owner's per-treatment subject when exactly one category is selected", () => {
    expect(aftercareSubject(["antiwrinkle"])).toBe("Your Aftercare Guide for Anti-wrinkle Treatment");
    expect(aftercareSubject(["skinbooster"])).toBe("Your Aftercare Guide for Skinbooster Treatment");
    expect(aftercareSubject(["haFiller"])).toBe("Your Aftercare Guide for HA Dermal Filler Treatment");
    expect(aftercareSubject(["biostimulatorFiller"]))
      .toBe("Your Aftercare Guide for Biostimulator Filler Treatment (Ellansé / HArmonyCa / Radiesse)");
    expect(aftercareSubject(["biostimulatorRejuvenation"]))
      .toBe("Your Aftercare Guide for Biostimulator Treatment (Sculptra / Lenisna / Gouri / Hyperdiluted Radiesse)");
    expect(aftercareSubject(["fatDissolve"])).toBe("Your Aftercare Guide for Fat Dissolving Treatment");
    expect(aftercareSubject(["fillerDissolve"])).toBe("Your Aftercare Guide for Hylase (Filler Dissolving) Treatment");
    expect(aftercareSubject(["prpPrf"])).toBe("Your Aftercare Guide for PRP / PRF Treatment");
  });

  it("falls back to the generic subject for zero or several categories", () => {
    expect(aftercareSubject([])).toBe("Your Aftercare Guide");
    expect(aftercareSubject(["antiwrinkle", "skinbooster"])).toBe("Your Aftercare Guide");
  });
});

describe("aftercareEmail", () => {
  it("greets the patient by name, carries the composed body, and subjects by selection", () => {
    const email = aftercareEmail("Amara Boyd", "BODY", ["antiwrinkle"]);
    expect(email.subject).toBe("Your Aftercare Guide for Anti-wrinkle Treatment");
    expect(email.body).toBe("Dear Amara Boyd,\n\nBODY");
  });

  it("falls back to a generic greeting and subject when nothing is on file", () => {
    expect(aftercareEmail("", "BODY", []).body).toBe("Dear patient,\n\nBODY");
    expect(aftercareEmail("   ", "BODY", []).body).toBe("Dear patient,\n\nBODY");
    expect(aftercareEmail("", "BODY", []).subject).toBe("Your Aftercare Guide");
  });
});

import { describe, it, expect } from "vitest";
import {
  AFTERCARE_CATEGORIES, aftercareDisplayName, aftercareTemplate, assembleAftercare,
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

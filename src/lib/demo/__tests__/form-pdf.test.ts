import { describe, it, expect } from "vitest";
import { pdfAvailability, pdfFilename } from "@/lib/demo/formPdf";

describe("pdfAvailability", () => {
  it("is unavailable in demo mode regardless of pdfFileId", () => {
    expect(pdfAvailability({ pdfFileId: "patients/p/forms/f.pdf" }, false)).toBe("unavailable");
  });
  it("is ready in live mode when a pdfFileId is present", () => {
    expect(pdfAvailability({ pdfFileId: "patients/p/forms/f.pdf" }, true)).toBe("ready");
  });
  it("is pending in live mode when pdfFileId is missing or empty", () => {
    expect(pdfAvailability({ pdfFileId: undefined }, true)).toBe("pending");
    expect(pdfAvailability({ pdfFileId: "" }, true)).toBe("pending");
  });
});

describe("pdfFilename", () => {
  it("formats display name, patient, and signing date", () => {
    const millis = new Date(2026, 5, 29, 10, 30).getTime();
    expect(pdfFilename("Antiwrinkle Consent", "Claire D", millis)).toBe("Antiwrinkle Consent — Claire D — 2026-06-29.pdf");
  });
  it("strips illegal filename characters and collapses whitespace", () => {
    const millis = new Date(2026, 0, 2).getTime();
    expect(pdfFilename('HA/Filler:  Consent', 'A"B', millis)).toBe("HAFiller Consent — AB — 2026-01-02.pdf");
  });
  it("omits an empty patient name", () => {
    const millis = new Date(2026, 0, 2).getTime();
    expect(pdfFilename("Consent", "", millis)).toBe("Consent — 2026-01-02.pdf");
  });
});

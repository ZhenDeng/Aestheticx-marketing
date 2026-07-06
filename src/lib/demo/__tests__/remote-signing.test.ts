import { describe, it, expect } from "vitest";
import {
  remoteSigningTemplateKinds, formSigningUrl, consentEmail, mailtoHref, FORM_LINK_BASE_URL,
} from "@/lib/demo/remoteSigning";

describe("remoteSigningTemplateKinds", () => {
  it("offers every template, including the aesthetic history intake (owner feedback #3)", () => {
    // The live sign.html now renders each template's served question set, so the intake is no
    // longer held back in live mode.
    expect(remoteSigningTemplateKinds()).toContain("aestheticHistory");
    expect(remoteSigningTemplateKinds()).toHaveLength(7);
  });
  it("offers the consent templates", () => {
    expect(remoteSigningTemplateKinds()).toContain("antiwrinkleConsent");
  });
});

describe("formSigningUrl", () => {
  it("builds the public /s/{token} url", () => {
    expect(formSigningUrl("abc123")).toBe(`${FORM_LINK_BASE_URL}/s/abc123`);
  });
});

describe("consentEmail", () => {
  it("greets the patient by name and includes the link and single-use note", () => {
    const { subject, body } = consentEmail("Claire", "https://x/s/t");
    expect(subject.length).toBeGreaterThan(0);
    expect(body).toContain("Claire");
    expect(body).toContain("https://x/s/t");
    expect(body).toContain("once");
  });
  it("falls back to a generic greeting when no name", () => {
    expect(consentEmail("", "https://x/s/t").body.split("\n")[0]).toBe("Hi,");
  });
});

describe("mailtoHref", () => {
  it("encodes subject and body and targets the address", () => {
    const href = mailtoHref("p@example.com", "Sign & return", "line1\nline2");
    expect(href.startsWith("mailto:p@example.com?")).toBe(true);
    expect(href).toContain("subject=Sign%20%26%20return");
    expect(href).toContain("body=line1%0Aline2");
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const privacy = readFileSync(join(process.cwd(), "src/app/privacy/page.tsx"), "utf8");
const terms = readFileSync(join(process.cwd(), "src/app/terms/page.tsx"), "utf8");

function expectGoogleAddressDisclosure(source: string) {
  source = source.replace(/\s+/g, " ");
  expect(source).toMatch(/Google (?:Places|Maps)/);
  expect(source).toMatch(/partial address text/i);
  expect(source).toMatch(/Google session token/i);
  expect(source).toMatch(/Australian (?:address )?suggestions/i);
  expect(source).toMatch(/processed? outside Australia|processing may occur outside Australia/i);
  expect(source).toMatch(/selected address[\s\S]*stored only[\s\S]*(?:patient|profile)[\s\S]*transaction/i);
  expect(source).toMatch(/(?:Google|Places|Maps) content[\s\S]*(?:not|never) cached/i);
  expect(source).toMatch(/not used[\s\S]*advertising or tracking[\s\S]*AestheticX|AestheticX[\s\S]*(?:does not|do not)[\s\S]*(?:advertising|tracking)/i);
  expect(source).toContain("https://policies.google.com/privacy");
  expect(source).toContain("https://cloud.google.com/maps-platform/terms");
}

describe("Google Places legal disclosures", () => {
  it("covers the signed-in address flow on the privacy page", () => {
    expectGoogleAddressDisclosure(privacy);
  });

  it("covers the signed-in address flow and Google terms on the terms page", () => {
    expectGoogleAddressDisclosure(terms);
  });
});

function boundedParagraph(source: string, marker: string) {
  const paragraphs = source.match(/<(?:p|li)>[\s\S]*?<\/(?:p|li)>/g) ?? [];
  const paragraph = paragraphs.find((candidate) => candidate.includes(marker));
  expect(paragraph, marker + " disclosure must exist").toBeDefined();
  return paragraph!.replace(/\s+/g, " ");
}

function expectBoundedGoogleDisclosure(source: string) {
  const google = boundedParagraph(source, "Live signed-in PatientForm.");
  expect(google).toMatch(/Google Places \/ Google Maps/);
  expect(google).toMatch(/partial address text/i);
  expect(google).toMatch(/Google session token/i);
  expect(google).toMatch(/Australian (?:address )?suggestions/i);
  expect(google).toMatch(/processing may occur outside Australia/i);
  expect(google).toMatch(/selected address.*stored only.*(?:patient|profile).*transaction/i);
  expect(google).toMatch(/Google content is not cached/i);
  expect(google).toContain("Google Places / Google Maps is not used for advertising or tracking by AestheticX.");
  expect(google).toMatch(/<a\s+href="https:\/\/policies\.google\.com\/privacy"[^>]*>[\s\S]*?<\/a>/);
  expect(google).toMatch(/<a\s+href="https:\/\/cloud\.google\.com\/maps-platform\/terms"[^>]*>[\s\S]*?<\/a>/);
  expect(google).not.toMatch(/Google (?:Places|Maps|processing)[^.]*\b(?:hosted|runs|occurs|located|pinned)\b[^.]*australia-southeast1/i);
}

function expectLegacyPhotonDisclosure(source: string) {
  const photon = boundedParagraph(source, "Legacy address fields.");
  expect(photon).toMatch(/profile, administration, and public-intake/i);
  expect(photon).toMatch(/directly from (?:your|the) browser/i);
  expect(photon).toMatch(/partial address text/i);
  expect(photon).toMatch(/derived bias coordinates/i);
  expect(photon).toMatch(/photon\.komoot\.io/i);
}

describe("address providers are disclosed by surface", () => {
  it.each([
    ["privacy", privacy],
    ["terms", terms],
  ])("bounds Google and legacy Photon processing on the %s page", (_name, source) => {
    expectBoundedGoogleDisclosure(source);
    expectLegacyPhotonDisclosure(source);
  });
});

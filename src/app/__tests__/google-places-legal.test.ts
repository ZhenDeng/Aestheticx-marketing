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
  expect(source).not.toMatch(/Photon|Komoot|OpenStreetMap/i);
}

describe("Google Places legal disclosures", () => {
  it("covers the signed-in address flow on the privacy page", () => {
    expectGoogleAddressDisclosure(privacy);
  });

  it("covers the signed-in address flow and Google terms on the terms page", () => {
    expectGoogleAddressDisclosure(terms);
  });
});

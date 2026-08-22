import { test, expect } from "@playwright/test";
import { DEMO, loginAsDemo } from "./helpers";

// E12 — the 22/07 feedback comboboxes, driven in a real browser: the medication field on a
// doctor's treatment note suggests catalog products, while the retained premises editor uses
// Photon. New-patient Google autocomplete is live-authenticated only; demo mode deliberately
// remains free text and is exercised here without making a provider request. The authenticated
// Google interaction contract is covered by the component suite with injected callable adapters.

const PHOTON_STUB = {
  features: [
    {
      properties: {
        housenumber: "12", street: "Smith Street", suburb: "Richmond",
        state: "Victoria", postcode: "3121", countrycode: "AU",
      },
    },
    {
      properties: {
        housenumber: "12", street: "Smith Street", suburb: "Fitzroy",
        state: "Victoria", postcode: "3065", countrycode: "AU",
      },
    },
  ],
};

test("E12a — a doctor picks a medication from the catalog on a treatment note", async ({ page }) => {
  await loginAsDemo(page, DEMO.doctor);

  await page.getByRole("navigation").getByRole("link", { name: "Patients", exact: true }).click();
  await page.waitForURL(/\/app\/patients$/);
  // The first real patient FILE — excluding the list links that share the href prefix.
  await page
    .locator('a[href^="/app/patients/"]:not([href="/app/patients/new"]):not([href="/app/patients/other"]):not([href="/app/patients/form-link"])')
    .first().click();
  await expect(page).toHaveURL(/\/app\/patients\/[^/]+$/);

  // Notes is a collapsed accordion by default — expand it to reach the Treatment note button.
  await page.getByRole("button", { name: /notes \(/i }).click();
  await page.getByRole("button", { name: /treatment note/i }).first().click();
  await page.getByRole("button", { name: /add medication/i }).click();

  const medication = page.getByRole("combobox", { name: /medication/i });
  await medication.fill("volux");

  const option = page.getByRole("option", { name: /Juvederm · Volux/ });
  await expect(option).toBeVisible();
  await option.click();

  await expect(medication).toHaveValue("Juvederm · Volux");
  // The list closes on selection and does not re-open over the filled value. Scoped to the
  // suggestion listbox — a native <select> on the same form also exposes role=option.
  await expect(page.getByRole("listbox", { name: /medication suggestions/i })).toHaveCount(0);
});

async function openPremiseAddress(page: import("@playwright/test").Page) {
  await page.getByRole("navigation").getByRole("link", { name: "Profile", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/profile$/);
  await page.getByRole("button", { name: /Sarah Chen Aesthetics/ }).click();
  await page.getByRole("button", { name: "Add premise" }).click();
  return page.getByRole("combobox", { name: /address/i });
}

test("E12b — demo patient addresses remain free text without provider requests", async ({ page }) => {
  const providerRequests: string[] = [];
  page.on("request", (request) => {
    if (/photon\.komoot\.io|autocompleteAddress|resolveAddress/.test(request.url())) {
      providerRequests.push(request.url());
    }
  });

  await loginAsDemo(page, DEMO.nurse);
  await page.getByRole("navigation").getByRole("link", { name: "Patients", exact: true }).click();
  await page.getByRole("link", { name: "New patient" }).click();
  await expect(page.getByRole("heading", { name: "New patient" })).toBeVisible();

  const address = page.getByRole("textbox", { name: /address/i });
  await expect(address).toHaveAttribute("autocomplete", "street-address");
  await address.fill("Lot 7 Bushmans Road, Dungog NSW 2420");
  await expect(address).toHaveValue("Lot 7 Bushmans Road, Dungog NSW 2420");
  await expect(page.getByRole("listbox", { name: /address suggestions/i })).toHaveCount(0);
  expect(providerRequests).toEqual([]);
});

test("E12c — the retained premises address fills from a Photon suggestion", async ({ page }) => {
  await page.route("**/photon.komoot.io/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(PHOTON_STUB) }));

  await loginAsDemo(page, DEMO.nurse);
  const address = await openPremiseAddress(page);
  await address.fill("12 Smith");

  await expect(page.getByRole("option", { name: /Richmond VIC 3121/ })).toBeVisible();
  await page.getByRole("option", { name: /Fitzroy VIC 3065/ }).click();
  await expect(address).toHaveValue("12 Smith Street, Fitzroy VIC 3065");
});

test("E12d — a mismatched premises geocoder hit is never offered", async ({ page }) => {
  // The 22/07 regression: Photon answered "15 Gympie Road" with "Everson Road, Gympie QLD",
  // which the dropdown presented as a real address. An empty list is the correct answer.
  await page.route("**/photon.komoot.io/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ features: [
      { properties: { type: "house", housenumber: "15", street: "Everson Road", city: "Gympie", state: "Queensland", postcode: "4570", countrycode: "AU" } },
      { properties: { type: "locality", housenumber: "15", street: "Gympie Road", city: "Brisbane", state: "Queensland", countrycode: "AU" } },
    ] }),
  }));

  await loginAsDemo(page, DEMO.nurse);
  const address = await openPremiseAddress(page);
  await address.fill("15 Gympie Road");

  await expect(page.getByRole("listbox", { name: /address suggestions/i })).toHaveCount(0);
  await expect(address).toHaveValue("15 Gympie Road");
});

test("E12e — a typed premises address survives a geocoder outage", async ({ page }) => {
  await page.route("**/photon.komoot.io/**", (route) => route.abort());

  await loginAsDemo(page, DEMO.nurse);
  const address = await openPremiseAddress(page);
  await address.fill("Lot 7 Bushmans Road, Dungog NSW 2420");

  // Scoped to the suggestion listbox — the Gender <select> also exposes role=option.
  await expect(page.getByRole("listbox", { name: /address suggestions/i })).toHaveCount(0);
  await expect(address).toHaveValue("Lot 7 Bushmans Road, Dungog NSW 2420");
});

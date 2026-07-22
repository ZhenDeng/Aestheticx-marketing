import { test, expect } from "@playwright/test";
import { DEMO, loginAsDemo } from "./helpers";

// E12 — the 22/07 feedback comboboxes, driven in a real browser: the medication field on a
// doctor's treatment note suggests catalog products, and the patient address field suggests
// geocoded addresses. The geocoder is stubbed at the network boundary so this spec stays
// offline like the rest of the suite; the shape of the stub matches the live Photon response.

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
    .locator('a[href^="/app/patients/"]:not([href="/app/patients/new"]):not([href="/app/patients/other"])')
    .first().click();
  await expect(page).toHaveURL(/\/app\/patients\/[^/]+$/);

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

test("E12b — the patient address field fills from a suggestion", async ({ page }) => {
  await page.route("**/photon.komoot.io/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(PHOTON_STUB) }));

  await loginAsDemo(page, DEMO.nurse);
  await page.getByRole("navigation").getByRole("link", { name: "Patients", exact: true }).click();
  await page.getByRole("link", { name: "New patient" }).click();
  await expect(page.getByRole("heading", { name: "New patient" })).toBeVisible();

  const address = page.getByRole("combobox", { name: /address/i });
  await address.fill("12 Smith");

  await expect(page.getByRole("option", { name: /Richmond VIC 3121/ })).toBeVisible();
  await page.getByRole("option", { name: /Fitzroy VIC 3065/ }).click();

  await expect(address).toHaveValue("12 Smith Street, Fitzroy VIC 3065");
});

test("E12d — a geocoder hit that is not the typed address is never offered", async ({ page }) => {
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
  await page.getByRole("navigation").getByRole("link", { name: "Patients", exact: true }).click();
  await page.getByRole("link", { name: "New patient" }).click();

  const address = page.getByRole("combobox", { name: /address/i });
  await address.fill("15 Gympie Road");

  await expect(page.getByRole("listbox", { name: /address suggestions/i })).toHaveCount(0);
  await expect(address).toHaveValue("15 Gympie Road");
});

test("E12c — a typed address survives a geocoder outage", async ({ page }) => {
  await page.route("**/photon.komoot.io/**", (route) => route.abort());

  await loginAsDemo(page, DEMO.nurse);
  await page.getByRole("navigation").getByRole("link", { name: "Patients", exact: true }).click();
  await page.getByRole("link", { name: "New patient" }).click();

  const address = page.getByRole("combobox", { name: /address/i });
  await address.fill("Lot 7 Bushmans Road, Dungog NSW 2420");

  // Scoped to the suggestion listbox — the Gender <select> also exposes role=option.
  await expect(page.getByRole("listbox", { name: /address suggestions/i })).toHaveCount(0);
  await expect(address).toHaveValue("Lot 7 Bushmans Road, Dungog NSW 2420");
});

import { test, expect } from "@playwright/test";
import { DEMO, loginAsDemo } from "./helpers";

// E8 — the NSW Clause 68C direction's "Premises of administration" for a CLINIC authorisation.
// A clinic request stamps premise: null deliberately (meaning "use the clinic's address"), so
// the clinic's own premises ride onto the authorisation at approval as clinicPremise. Before
// that stamp existed this field came out blank in live and the clinician retyped the clinic's
// address onto a legal document every time.
//
// Mara Boyd is the seeded clinic patient — her request is submitted by sarahClinic and approved
// by Voss, so her authorisation carries Lumière's premises.
test("E8 — a clinic authorisation prefills Premises of administration from the clinic stamp", async ({ page }) => {
  await loginAsDemo(page, DEMO.nurse2); // Ruby Walsh @ Lumière Clinic

  await page.getByRole("navigation").getByRole("link", { name: /patients/i }).first().click();
  await page.waitForURL(/\/app\/patients/);
  await page.locator('a[href^="/app/patients/"]').filter({ hasText: /Boyd/i }).first().click();
  await expect(page).toHaveURL(/\/app\/patients\/[^/]+$/);

  // Labelled for the document, not the clause: "68C" alone read as jargon (18/07 feedback).
  // The citation stays in the accessible name and on hover.
  const open = page.getByRole("button", { name: "Clause 68C direction" }).first();
  await expect(open).toHaveText("Direction");
  await expect(open).toHaveAttribute("title", "Clause 68C direction");
  await open.click();

  // The clinic's premises, not the acting nurse's own — and not a raw clinic id as the name.
  const premises = page.getByLabel(/premises of administration/i);
  await expect(premises).toBeVisible();
  await expect(premises).toHaveValue("Lumière Clinic, 2 Notts Ave, Bondi Beach NSW 2026");

  // The export gate no longer reports it as missing.
  await expect(page.getByText(/premises of administration/i).filter({ hasText: /still needed/i }))
    .toHaveCount(0);
});

// A field the app cannot resolve is CORRECTLY blank — a direction is a legal document, so
// blank-and-prompt beats guessing. What the 18/07 report exposed is that the prompt was
// illegible: one red line at the foot of the form, nothing at the field itself. Demo seeds every
// field, so this drives the unresolved state by clearing one.
test("E8b — an unresolved field is marked at the field, and gates the export until filled", async ({ page }) => {
  await loginAsDemo(page, DEMO.nurse2);

  await page.getByRole("navigation").getByRole("link", { name: /patients/i }).first().click();
  await page.waitForURL(/\/app\/patients/);
  await page.locator('a[href^="/app/patients/"]').filter({ hasText: /Boyd/i }).first().click();
  await page.getByRole("button", { name: "Clause 68C direction" }).first().click();

  const premises = page.getByLabel(/premises of administration/i);
  await expect(page.getByRole("button", { name: /preview direction/i })).toBeVisible();
  await expect(premises).toHaveAttribute("aria-invalid", "false");

  await premises.fill("");

  // Marked on the control, named on its own label, and explained once — not colour alone.
  await expect(premises).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByTestId("direction-missing-explanation")).toContainText(/couldn't be filled in/i);
  await expect(premises).toHaveAttribute("aria-describedby", "direction-missing-explanation");
  await expect(page.getByText(/still needed/i)).toContainText(/premises of administration/i);

  // Export is gated while it is unresolved.
  await expect(page.getByRole("button", { name: /preview direction/i })).toHaveCount(0);

  await premises.fill("Lumière Clinic, 2 Notts Ave, Bondi Beach NSW 2026");

  await expect(premises).toHaveAttribute("aria-invalid", "false");
  await expect(page.getByTestId("direction-missing-explanation")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /preview direction/i })).toBeVisible();
});

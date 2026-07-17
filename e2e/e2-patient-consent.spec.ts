import { test, expect } from "@playwright/test";
import { DEMO, loginAsDemo, fillNewPatient, drawSignature } from "./helpers";

// E2 — the core clinical intake loop: a nurse creates a patient file, then records a signed
// consent on it. Runs as a single in-app session (the demo store lives in the /app layout and
// resets on any full reload), so every step navigates by clicking, never page.goto.

const GIVEN = "Testina";
const LAST = "Journeyson";

test("E2 — nurse creates a patient and records a signed consent", async ({ page }) => {
  await loginAsDemo(page, DEMO.nurse);

  // Go to Patients and start a new file.
  await page.getByRole("navigation").getByRole("link", { name: "Patients", exact: true }).click();
  await page.getByRole("link", { name: "New patient" }).click();
  await expect(page.getByRole("heading", { name: "New patient" })).toBeVisible();

  await fillNewPatient(page, GIVEN, LAST);
  await page.getByRole("button", { name: "Create patient" }).click();

  // Lands on the new patient's file.
  await expect(page).toHaveURL(/\/app\/patients\/[^/]+$/);
  await expect(page.getByRole("heading", { name: new RegExp(`${GIVEN}\\s+${LAST}`) })).toBeVisible();

  // Sign a consent straight from the file.
  await page.getByRole("link", { name: "Sign a consent" }).click();
  await expect(page.getByRole("heading", { name: "Sign a consent" })).toBeVisible();

  // Answer every screening question "No" (no detail required) and sign.
  const noButtons = page.getByRole("button", { name: "No", exact: true });
  const count = await noButtons.count();
  for (let i = 0; i < count; i++) await noButtons.nth(i).click();

  const submit = page.getByRole("button", { name: "Record signed consent" });
  await expect(submit).toBeDisabled(); // gated on a signature
  await drawSignature(page);
  await expect(submit).toBeEnabled();
  await submit.click();

  // Back on the file, the signed consent is now listed.
  await expect(page).toHaveURL(/\/app\/patients\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "Consent forms" })).toBeVisible();
  await expect(page.getByText(/Antiwrinkle/i).first()).toBeVisible();

  // And the new patient appears in the clinical list.
  await page.getByRole("navigation").getByRole("link", { name: "Patients", exact: true }).click();
  await page.waitForURL(/\/app\/patients$/);
  await expect(page.getByText(new RegExp(`${GIVEN}\\s+${LAST}`))).toBeVisible();
});

import { test, expect } from "@playwright/test";
import { DEMO, loginAsDemo } from "./helpers";

// E6 — compliance: a platform admin's access to a patient file is audit-logged (constitution
// §16/§21). Admin looks a patient up, opens their file (which records the access), then the audit
// trail shows the event. Runs in one demo session (the audit log is in-session in demo mode).

test("E6 — admin patient access is written to the audit trail", async ({ page }) => {
  await loginAsDemo(page, DEMO.platformAdmin);
  await expect(page).toHaveURL(/\/app\/admin/);

  // Look up a seeded patient by surname.
  await page.getByRole("navigation").getByRole("link", { name: "Patient lookup", exact: true }).click();
  await page.waitForURL(/\/app\/admin\/patients/);
  await page.getByPlaceholder(/search by name/i).fill("Boyd");

  const result = page.locator('a[href^="/app/patients/"]').first();
  await expect(result).toBeVisible();
  await result.click();

  // The file opens with the admin-access notice (this is the logged access).
  await expect(page).toHaveURL(/\/app\/patients\/[^/]+$/);
  await expect(page.getByText(/viewing this file as Platform Admin/i)).toBeVisible();

  // The audit trail now shows the patient-file access event.
  await page.getByRole("navigation").getByRole("link", { name: "Audit", exact: true }).click();
  await page.waitForURL(/\/app\/admin\/audit/);
  await expect(page.getByText(/Patient file access/i).first()).toBeVisible();
});

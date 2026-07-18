import { test, expect } from "@playwright/test";
import { DEMO, loginAsDemo } from "./helpers";

// E7 — emergency authorisations (safety-critical, core-architecture Tier 1). Approving a filler
// authorisation auto-grants the standing Hyaluronidase emergency authorisation (Rule 5 / §15).
// The seed approves Mara Boyd's Voluma (haFiller) request, so her file must surface an active
// emergency authorisation. The emergency section isn't role-gated, so we reach her file via the
// admin patient lookup (a reliable, viewer-agnostic route to any file).

test("E7 — an approved filler shows a standing emergency authorisation on the patient file", async ({ page }) => {
  await loginAsDemo(page, DEMO.platformAdmin);

  await page.getByRole("navigation").getByRole("link", { name: "Patient lookup", exact: true }).click();
  await page.waitForURL(/\/app\/admin\/patients/);
  await page.getByPlaceholder(/search by name/i).fill("Boyd");

  await page.locator('a[href^="/app/patients/"]').first().click();
  await expect(page).toHaveURL(/\/app\/patients\/[^/]+$/);

  // Her file carries the standing emergency authorisation.
  await expect(page.getByText("Emergency authorisations")).toBeVisible();
  await expect(page.getByText(/Hyaluronidase/i)).toBeVisible();
});

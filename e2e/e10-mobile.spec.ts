import { test, expect, devices } from "@playwright/test";
import { DEMO, loginAsDemo, fillNewPatient } from "./helpers";

// E10 — responsive smoke. Re-run the core intake path and the revenue path at a phone viewport to
// catch layout breaks (off-screen controls, body horizontal scroll) the desktop runs miss.
test.use({ ...devices["Pixel 5"] });

test("E10 — nurse can start a patient file on a phone viewport", async ({ page }) => {
  await loginAsDemo(page, DEMO.nurse);
  await expect(page).toHaveURL(/\/app\/dashboard/);

  await page.getByRole("navigation").getByRole("link", { name: "Patients", exact: true }).click();
  await page.waitForURL(/\/app\/patients$/);
  await page.getByRole("link", { name: "New patient" }).click();

  await fillNewPatient(page, "Mobile", "Tester");
  const create = page.getByRole("button", { name: "Create patient" });
  await expect(create).toBeVisible();
  await create.click();
  await expect(page).toHaveURL(/\/app\/patients\/[^/]+$/);

  // The page must not scroll horizontally on a phone.
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflow, "page overflows horizontally on mobile").toBeFalsy();
});

test("E10 — doctor billing renders on a phone viewport", async ({ page }) => {
  await loginAsDemo(page, DEMO.doctor);
  await page.getByRole("navigation").getByRole("link", { name: "Invoice", exact: true }).click();
  await page.waitForURL(/\/app\/billing/);
  await expect(page.getByRole("heading", { name: "Invoice", exact: true })).toBeVisible();

  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflow, "billing page overflows horizontally on mobile").toBeFalsy();
});

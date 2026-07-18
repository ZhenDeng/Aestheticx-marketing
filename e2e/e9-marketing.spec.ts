import { test, expect } from "@playwright/test";

// E9 — public marketing surface. These are static/SSR pages (no auth, no demo store), so a full
// page load is fine here. Smoke only: each page responds, shows its headline, and offers a route
// into the app via the /login link in the site nav.

const PAGES = ["/", "/for-clinics", "/for-doctors", "/for-nurses"];

for (const path of PAGES) {
  test(`E9 — ${path} loads and links to login`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.ok()).toBeTruthy();
    await expect(page.getByRole("heading").first()).toBeVisible();
    await expect(page.locator('a[href="/login"]').first()).toBeVisible();
  });
}

test("E9 — the site-nav login link routes to the demo sign-in", async ({ page }) => {
  await page.goto("/");
  await page.locator('a[href="/login"]').first().click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText("Choose a role to explore AestheticX")).toBeVisible();
});

test("E9 — legal pages render", async ({ page }) => {
  for (const path of ["/privacy", "/terms"]) {
    const res = await page.goto(path);
    expect(res?.ok()).toBeTruthy();
    await expect(page.getByRole("heading").first()).toBeVisible();
  }
});

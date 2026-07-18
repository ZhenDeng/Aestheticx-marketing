import { test, expect } from "@playwright/test";

// E11 — the demo and the real login are separate front doors. Before this split they shared
// /login and were selected by a deployment-wide env flag, so only one could ever exist at a
// time. These tests pin the contract: each route serves its own form and never the other's.
//
// The E2E run has no Firebase env, so /login renders its "sign-in unavailable" state. The
// assertions below are about which FORM appears, which holds either way.

const PICKER = "Choose a role to explore AestheticX";

test.describe("E11 — /demo and /login are separate", () => {
  test("/demo serves the role picker and no email/password form", async ({ page }) => {
    const res = await page.goto("/demo");
    expect(res?.ok()).toBeTruthy();
    await expect(page.getByText(PICKER)).toBeVisible();
    await expect(page.getByRole("button", { name: "Enter the demo" })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
  });

  test("/login never serves the role picker", async ({ page }) => {
    const res = await page.goto("/login");
    expect(res?.ok()).toBeTruthy();
    await expect(page.getByText(PICKER)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Enter the demo" })).toHaveCount(0);
  });

  test("/login offers a route to the demo when sign-in is unavailable", async ({ page }) => {
    await page.goto("/login");
    const toDemo = page.locator('a[href="/demo"]');
    await expect(toDemo.first()).toBeVisible();
    await toDemo.first().click();
    await expect(page).toHaveURL(/\/demo/);
    // Heading, not getByText: after a client-side nav Next's route announcer echoes the h1
    // text into an aria-live region, so a plain text match resolves to two elements.
    await expect(page.getByRole("heading", { name: PICKER })).toBeVisible();
  });

  // Every other spec reaches /demo with page.goto, i.e. a hard navigation. A visitor arriving
  // from the marketing site gets a client-side (soft) navigation instead, where no document
  // script runs and the App Router only re-renders. Demo mode is derived from usePathname
  // during render precisely so both paths resolve identically — this pins that.
  test("arriving at /demo by soft navigation still enters the sandbox", async ({ page }) => {
    await page.goto("/login");
    await page.locator('a[href="/demo"]').first().click(); // client-side nav, no page load
    await expect(page).toHaveURL(/\/demo/);
    await expect(page.getByRole("heading", { name: PICKER })).toBeVisible();

    // The sandbox is genuinely on: signing in with a preset lands in the app on seed data.
    await page.getByText("Sarah Chen — Nurse", { exact: true }).click();
    await page.getByRole("button", { name: "Enter the demo" }).click();
    await expect(page).toHaveURL(/\/app\/dashboard/);
    await expect(page.getByText(/Welcome, Sarah Chen/)).toBeVisible();
  });

  test("/demo offers a route back to the real login", async ({ page }) => {
    await page.goto("/demo");
    await page.locator('a[href="/login"]').first().click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(PICKER)).toHaveCount(0);
  });
});

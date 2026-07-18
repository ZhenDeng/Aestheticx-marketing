import { test, expect } from "@playwright/test";
import { DEMO, loginAsDemo } from "./helpers";

// E1 — auth is the gate for everything. A role must land on its correct home with role-correct
// navigation, and the admin/clinical route separation (constitution §16/Rule 7) must hold.

test.describe("E1 — login and role-correct navigation", () => {
  test("nurse lands on the dashboard with clinical nav and no Invoice", async ({ page }) => {
    await loginAsDemo(page, DEMO.nurse);
    await expect(page).toHaveURL(/\/app\/dashboard/);

    const nav = page.getByRole("navigation");
    for (const item of ["Dashboard", "Patients", "Authorisations", "Calendar"]) {
      await expect(nav.getByRole("link", { name: item, exact: true })).toBeVisible();
    }
    // Invoice is doctor-only (15/07 feedback) — a nurse must not see it.
    await expect(nav.getByRole("link", { name: "Invoice", exact: true })).toHaveCount(0);
  });

  test("doctor sees the Invoice section", async ({ page }) => {
    await loginAsDemo(page, DEMO.doctor);
    await expect(page).toHaveURL(/\/app\/dashboard/);
    await expect(page.getByRole("navigation").getByRole("link", { name: "Invoice", exact: true })).toBeVisible();
  });

  test("platform admin lands on the admin shell, not the clinical dashboard", async ({ page }) => {
    await loginAsDemo(page, DEMO.platformAdmin);
    await expect(page).toHaveURL(/\/app\/admin/);
    // Admin nav, not clinical.
    await expect(page.getByRole("navigation").getByRole("link", { name: "Audit", exact: true })).toBeVisible();
  });

  test("a signed-out visitor to a guarded route is redirected to login (E8)", async ({ page }) => {
    await page.goto("/app/calendar");
    await expect(page).toHaveURL(/\/demo/);
    await expect(page.getByText("Choose a role to explore AestheticX")).toBeVisible();
  });

  // NOTE: the in-session role bounce (authenticated nurse hitting /app/admin -> /app/dashboard)
  // is NOT E2E-testable in demo mode: a full navigation resets the in-memory session, so a nurse
  // who navigates to /app/admin is treated as signed-out and lands on /demo. That role-based
  // redirect is covered by unit tests (authRedirect.ts, AuthGuard-role-redirect.test.tsx).
});

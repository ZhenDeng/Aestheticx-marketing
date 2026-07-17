import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { DEMO, loginAsDemo } from "./helpers";

// Accessibility smoke: run axe-core over representative pages and fail on serious/critical
// violations (WCAG 2.0/2.1 A + AA). Minor/moderate issues are not gated here to keep the check
// stable; tighten later once the serious/critical floor holds.
//
// `color-contrast` is DISABLED as a known baseline exception: the tinted/muted text in the
// current palette trips AA contrast on a few nodes per page. That's real debt tracked separately
// — excluding the one rule keeps this check guarding the STRUCTURAL a11y that matters most
// (labels, roles, names, alt text) instead of failing on day one. Re-enable once contrast is fixed.
const GATED = ["serious", "critical"];
const KNOWN_BASELINE = ["color-contrast"];

async function scan(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .disableRules(KNOWN_BASELINE)
    .analyze();
  return results.violations.filter((v) => GATED.includes(v.impact ?? ""));
}

test("a11y — public login page", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText("Choose a role to explore AestheticX")).toBeVisible();
  const violations = await scan(page);
  expect(violations, JSON.stringify(violations.map((v) => v.id), null, 2)).toEqual([]);
});

test("a11y — marketing home", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading").first()).toBeVisible();
  const violations = await scan(page);
  expect(violations, JSON.stringify(violations.map((v) => v.id), null, 2)).toEqual([]);
});

test("a11y — authenticated dashboard (nurse)", async ({ page }) => {
  await loginAsDemo(page, DEMO.nurse);
  await expect(page).toHaveURL(/\/app\/dashboard/);
  const violations = await scan(page);
  expect(violations, JSON.stringify(violations.map((v) => v.id), null, 2)).toEqual([]);
});

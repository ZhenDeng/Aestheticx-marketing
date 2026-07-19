import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { DEMO, loginAsDemo } from "./helpers";

// Accessibility smoke: run axe-core over representative pages and fail on serious/critical
// violations (WCAG 2.0/2.1 A + AA). Minor/moderate issues are not gated here to keep the check
// stable; tighten later once the serious/critical floor holds.
//
// `color-contrast` is ENABLED: the "Porcelain & Ink" text tokens (--color-ink-soft/-faint,
// --color-gold-deep, and the role tints) were tuned in globals.css to clear AA (>=4.5:1) on
// paper/card and on their tinted-soft chip backgrounds, so the rule now passes on every gated
// page. KNOWN_BASELINE is the escape hatch for a rule we can't yet satisfy — list an axe rule id
// here (with a linked follow-up) to keep this check green while the underlying fix is pending.
const GATED = ["serious", "critical"];
const KNOWN_BASELINE: string[] = [];

async function scan(page: import("@playwright/test").Page) {
  // Force the ".reveal" entrance (opacity 0 -> 1 over 0.6s, driven by an IntersectionObserver) to
  // its settled state before axe runs. Otherwise axe can sample an element mid-fade and report a
  // spurious color-contrast failure against the reduced-opacity foreground.
  await page.addStyleTag({
    content: ".reveal{opacity:1 !important;transform:none !important;transition:none !important}",
  });
  let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
  if (KNOWN_BASELINE.length > 0) builder = builder.disableRules(KNOWN_BASELINE);
  const results = await builder.analyze();
  return results.violations.filter((v) => GATED.includes(v.impact ?? ""));
}

test("a11y — public demo sign-in", async ({ page }) => {
  await page.goto("/demo");
  await expect(page.getByText("Choose a role to explore AestheticX")).toBeVisible();
  const violations = await scan(page);
  expect(violations, JSON.stringify(violations.map((v) => v.id), null, 2)).toEqual([]);
});

test("a11y — public login page", async ({ page }) => {
  // No Firebase env in the E2E run, so this renders the "sign-in unavailable" state.
  await page.goto("/login");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
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

// The Clause 68C capture dialog, scanned in its UNRESOLVED state — the one that carries the
// aria-invalid / aria-describedby marking and the danger-tinted explanation. Scanning it filled
// would miss exactly the markup this check exists for.
test("a11y — direction capture dialog with an unresolved field", async ({ page }) => {
  await loginAsDemo(page, DEMO.nurse2);

  await page.getByRole("navigation").getByRole("link", { name: /patients/i }).first().click();
  await page.waitForURL(/\/app\/patients/);
  await page.locator('a[href^="/app/patients/"]').filter({ hasText: /Boyd/i }).first().click();
  await page.getByRole("button", { name: "Clause 68C direction" }).first().click();

  const premises = page.getByLabel(/premises of administration/i);
  await premises.fill("");
  await expect(premises).toHaveAttribute("aria-invalid", "true");

  const violations = await scan(page);
  expect(violations, JSON.stringify(violations.map((v) => v.id), null, 2)).toEqual([]);
});

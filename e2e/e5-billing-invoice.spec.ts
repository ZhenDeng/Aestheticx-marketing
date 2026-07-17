import { test, expect } from "@playwright/test";
import { DEMO, loginAsDemo } from "./helpers";

// E5 — the revenue path. A doctor invoices the authorisations they granted, generates a tax
// invoice, and downloads the PDF. This exercises the billing → tax-invoice flow end-to-end
// (PR #101's tax-invoice layout); PDF *content* correctness stays in the unit tests
// (invoice-pdf.test.ts). The demo seed grants Dr Voss billable authorisations.

test("E5 — doctor generates a tax invoice and downloads the PDF", async ({ page }) => {
  await loginAsDemo(page, DEMO.doctor);

  await page.getByRole("navigation").getByRole("link", { name: "Invoice", exact: true }).click();
  await page.waitForURL(/\/app\/billing/);
  await expect(page.getByRole("heading", { name: "Invoice", exact: true })).toBeVisible();

  // Open the generate panel for the first billable party, then generate.
  const openPanel = page.getByRole("button", { name: "Generate invoice" }).first();
  await expect(openPanel).toBeVisible();
  await openPanel.click();

  // The panel adds a second "Generate invoice" action button; the last one is the action.
  const generate = page.getByRole("button", { name: "Generate invoice" }).last();
  await generate.click();

  // The new invoice appears with a downloadable tax-invoice PDF.
  const download = page.getByRole("button", { name: "Download PDF" }).first();
  await expect(download).toBeVisible();

  const [dl] = await Promise.all([
    page.waitForEvent("download"),
    download.click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/\.pdf$/i);
});

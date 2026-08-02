import { test, expect } from "@playwright/test";
import { DEMO, loginAsDemo, drawSignature } from "./helpers";

// E13 — the doctor's electronic signature (02/08): drawn once on the dashboard, saved to
// the profile, and printed in the signature block of every approval PDF. This drives the
// real canvas → white-backed JPEG → profile pipeline in a browser (unit tests cover the
// PDF embedding; jsdom has no canvas so the capture itself can only run here).

test("E13 — a doctor draws and saves their signature on the dashboard", async ({ page }) => {
  await loginAsDemo(page, DEMO.doctor);
  // Client-side nav (no reload — a reload would reset the demo store).
  await page.getByRole("navigation").getByRole("link", { name: "Dashboard", exact: true }).click();
  await page.waitForURL(/\/app\/dashboard/);

  const card = page.locator("section", { has: page.getByRole("heading", { name: "Electronic signature" }) });
  await expect(card).toBeVisible();

  // Gated on a drawing, exactly like the consent pad.
  const save = card.getByRole("button", { name: "Save signature" });
  await expect(save).toBeDisabled();
  await drawSignature(page);
  await expect(save).toBeEnabled();
  await save.click();

  // The pad gives way to the saved-signature preview with Replace/Remove.
  await expect(card.getByAltText("Your saved signature")).toBeVisible();
  await expect(card.getByRole("button", { name: "Replace signature" })).toBeVisible();
  // The preview carries the white-backed JPEG the PDF renderer embeds (not the raw PNG).
  await expect(card.getByAltText("Your saved signature")).toHaveAttribute("src", /^data:image\/jpeg;base64,/);

  // Remove restores the empty-state pad.
  await card.getByRole("button", { name: "Remove" }).click();
  await expect(card.getByRole("button", { name: "Save signature" })).toBeDisabled();
});

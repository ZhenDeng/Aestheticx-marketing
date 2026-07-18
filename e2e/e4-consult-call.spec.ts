import { test, expect } from "@playwright/test";
import { DEMO, loginAsDemo } from "./helpers";

// E4 — the teleconsult launch. Live mode rings the other party over LiveKit; demo mode simulates
// the ring → in-call lifecycle locally (no transport), so the whole call UI is exercisable here.
// The doctor starts a consult from the authorisations inbox on a seeded pending request, the call
// overlay runs its simulated lifecycle, and ending it lands the reviewing doctor on the wrap-up.

test("E4 — doctor runs a simulated consult call and ends it", async ({ page }) => {
  await loginAsDemo(page, DEMO.doctor);

  await page.getByRole("navigation").getByRole("link", { name: "Authorisations", exact: true }).click();
  await page.waitForURL(/\/app\/authorisations/);

  // Start a consult on the first pending request.
  const startConsult = page.getByRole("button", { name: "Start consult" }).first();
  await expect(startConsult).toBeVisible();
  await startConsult.click();

  // The call overlay opens and runs the demo lifecycle: ringing → in call (simulated).
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Consult call")).toBeVisible();
  await expect(dialog.getByText(/Demo mode — live video connects/i)).toBeVisible();
  await expect(dialog.getByText("In call (simulated)")).toBeVisible({ timeout: 5000 });

  // Ending the call moves the reviewing doctor to the wrap-up (status reflects the ended call).
  await dialog.getByRole("button", { name: "End call" }).click();
  await expect(dialog.getByText(/Call ended/i)).toBeVisible();
});

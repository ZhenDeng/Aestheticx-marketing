import { test, expect } from "@playwright/test";
import { DEMO, loginAsDemo } from "./helpers";

// E3 — the authorisation handoff (the app's highest-risk cross-role flow).
//
// The FULL round-trip (nurse submits a request -> doctor approves) can't run as one E2E in demo
// mode: the demo store lives in the /app layout and resets on any full reload, and switching from
// the nurse account to the doctor account requires signing out (-> /login -> reload), which wipes
// the nurse's just-submitted request. So we cover the two halves against the deterministic seed:
//   - the doctor's approval of a seeded pending request (below), and
//   - the nurse's request creation (E3b).
// The direction (Clause 68C) PDF produced on approval is covered by unit tests (direction-pdf).
// A true shared-state round-trip belongs in a future live/emulator suite.

test("E3a — doctor approves a pending authorisation request", async ({ page }) => {
  await loginAsDemo(page, DEMO.doctor);

  await page.getByRole("navigation").getByRole("link", { name: "Authorisations", exact: true }).click();
  await page.waitForURL(/\/app\/authorisations/);
  await expect(page.getByRole("heading", { name: "Review requests" })).toBeVisible();

  const approve = page.getByRole("button", { name: "Approve" });
  const before = await approve.count();
  expect(before).toBeGreaterThan(0); // the seed grants Dr Voss a pending request

  await approve.first().click();

  // Approving issues the authorisations and drops the request out of the pending inbox.
  await expect(approve).toHaveCount(before - 1);
});

test("E3b — nurse submits an authorisation request for a patient", async ({ page }) => {
  await loginAsDemo(page, DEMO.nurse);

  // Open a seeded patient's file from the clinical list, then start a request.
  await page.getByRole("navigation").getByRole("link", { name: "Patients", exact: true }).click();
  await page.waitForURL(/\/app\/patients$/);
  // Open the first real patient FILE (exclude the "New patient" and "other" list links, which
  // share the /app/patients/ href prefix).
  const firstPatient = page
    .locator('a[href^="/app/patients/"]:not([href="/app/patients/new"]):not([href="/app/patients/other"])')
    .first();
  await firstPatient.click();
  await expect(page).toHaveURL(/\/app\/patients\/[^/]+$/);

  // A clinical file offers a "Raise authorisation request" entry.
  await page.getByRole("link", { name: "Raise authorisation request" }).click();
  await expect(page).toHaveURL(/\/app\/patients\/[^/]+\/request/);
  await expect(page.getByRole("heading", { name: "Raise authorisation request" })).toBeVisible();
});

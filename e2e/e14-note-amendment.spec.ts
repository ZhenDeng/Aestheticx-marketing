import { test, expect } from "@playwright/test";
import { DEMO, loginAsDemo } from "./helpers";

// E14 (owner feedback 06/08) — a note is correctable on the calendar day it was written.
// The nurse writes a general note on her own patient, reopens it, fixes the wording, and the
// row records that it was amended. One in-app session throughout: the demo store lives in the
// /app layout and resets on any full reload, so every step navigates by clicking.

const ORIGINAL = "Pt tolerated treatment well, no adverse events.";
const CORRECTED = "Pt tolerated treatment well — mild transient erythema, settled in 20 minutes.";

test("E14 — nurse corrects a note she wrote today", async ({ page }) => {
  await loginAsDemo(page, DEMO.nurse);

  await page.getByRole("navigation").getByRole("link", { name: "Patients", exact: true }).click();
  await page.getByRole("link", { name: /Claire Donovan|Coco/ }).first().click();
  await expect(page).toHaveURL(/\/app\/patients\/[^/]+$/);

  // Notes is a collapsed accordion by default (01/08 feedback).
  await page.getByRole("button", { name: /^notes \(/i }).click();
  await page.getByPlaceholder("Add a general note…").fill(ORIGINAL);
  await page.getByRole("button", { name: "Save note" }).click();

  // Open the note that was just written, then correct it inside the same-day window.
  await page.getByRole("button", { name: new RegExp(ORIGINAL.slice(0, 20)) }).click();
  await expect(page.getByText(/editable until midnight/i)).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Note", { exact: true }).fill(CORRECTED);
  await page.getByRole("button", { name: "Save changes" }).click();

  // The corrected wording stands, the editor is gone, and the row says it was amended.
  // Both the row preview and the open body carry the correction, hence .first().
  await expect(page.getByText(CORRECTED).first()).toBeVisible();
  await expect(page.getByLabel("Note", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/· edited /i).first()).toBeVisible();
});

import { test, expect, type Page } from "@playwright/test";
import { NURSE, DOCTOR, PASSWORD } from "./seed";

// THE full cross-role authorisation round-trip, in a real browser, with real persistence:
// a nurse (real email/password) creates a patient and submits an authorisation request; she signs
// out; the doctor signs in, sees the SAME request (hydrated from the emulator's Firestore), and
// approves it — which runs the REAL `approveRequest` Cloud Function in the functions emulator.
// This is exactly what the demo E2E can't do (no shared state) and the domain test can't do (no
// real function / persistence). Requires the emulators + seed (see e2e-emulator/README.md).

async function liveLogin(page: Page, email: string, password: string) {
  await page.goto("/login");
  await expect(page.getByText("Sign in with your AestheticX account.")).toBeVisible();
  await page.getByRole("textbox", { name: /email/i }).fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL(/\/app\//, { timeout: 30_000 });
}

test("cross-repo round-trip — nurse submits, the doctor approves the real request", async ({ page }) => {
  // --- Nurse: create a patient ---
  await liveLogin(page, NURSE.email, PASSWORD);
  await page.getByRole("navigation").getByRole("link", { name: "Patients", exact: true }).click();
  await page.getByRole("link", { name: "New patient" }).click();
  await page.getByLabel(/given name/i).fill("Roundtrip");
  await page.getByLabel(/last name/i).fill("Patient");
  await page.getByLabel(/date of birth/i).fill("1990-05-02");
  await page.getByLabel(/gender/i).selectOption("Female");
  await page.getByLabel(/phone/i).fill("0400 000 000");
  await page.getByLabel(/address/i).fill("1 Test St, Bondi NSW 2026");
  await page.getByLabel(/email/i).fill("roundtrip.patient@e2e.test");
  await page.getByLabel(/allergies/i).fill("None");
  await page.getByLabel(/current medications/i).fill("None");
  await page.getByRole("button", { name: "Create patient" }).click();
  await expect(page).toHaveURL(/\/app\/patients\/[^/]+$/);

  // --- Nurse: raise an authorisation request (HA filler) to the cooperating doctor ---
  await page.getByRole("link", { name: "Raise authorisation request" }).click();
  await expect(page.getByRole("heading", { name: "Raise authorisation request" })).toBeVisible();
  await page.getByRole("button", { name: /Other \/ compounded medication/i }).click();
  await page.getByLabel("Medication name").fill("Voluma");
  await page.getByLabel(/HA \(hyaluronic acid\) filler/i).check();
  await page.getByLabel("Dosage").fill("2");
  await page.getByLabel("Route of administration").selectOption("subcutaneous");

  const submit = page.getByRole("button", { name: "Submit request" });
  await expect(submit).toBeEnabled(); // the only cooperating doctor is auto-selected
  await submit.click();
  await expect(page).toHaveURL(/\/app\/patients\/[^/]+$/);
  // Let the Firestore mirror write settle before the doctor's session hydrates.
  await page.waitForTimeout(1500);

  // --- Hand off: nurse signs out, doctor signs in (real accounts, persistent Firestore) ---
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/login/);
  await liveLogin(page, DOCTOR.email, PASSWORD);

  // --- Doctor: the SAME request is waiting; approve it via the real Cloud Function ---
  await page.getByRole("navigation").getByRole("link", { name: "Authorisations", exact: true }).click();
  await page.waitForURL(/\/app\/authorisations/);
  await expect(page.getByRole("heading", { name: "Review requests" })).toBeVisible();

  const approve = page.getByRole("button", { name: "Approve" });
  await expect(approve.first()).toBeVisible({ timeout: 15_000 }); // hydrated from Firestore
  await approve.first().click();

  // approveRequest (real backend) issues the authorisations and clears the pending inbox.
  await expect(page.getByText("No pending requests.")).toBeVisible({ timeout: 15_000 });
});

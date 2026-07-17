import { type Page, expect } from "@playwright/test";

// Demo accounts as they appear in the role picker (src/lib/demo/accounts.ts). Data resets on
// every page load, so each test starts from the same deterministic seed.
export const DEMO = {
  nurse: "Sarah Chen — Nurse",
  nurse2: "Ruby Walsh — Nurse",
  doctor: "Dr Elena Voss — Doctor",
  clinicAdmin: "Ava Lim — Clinic Admin",
  platformAdmin: "Priya Nair — Platform Admin",
} as const;

/**
 * Sign in through the demo role picker and wait for the app shell to land. `label` is one of the
 * DEMO constants. The demo password field accepts any value.
 */
export async function loginAsDemo(page: Page, label: string): Promise<void> {
  await page.goto("/login");
  await expect(page.getByText("Choose a role to explore AestheticX")).toBeVisible();
  await page.getByText(label, { exact: true }).click();
  await page.getByRole("button", { name: "Enter the demo" }).click();
  // The picker routes to the role's home; wait for the app chrome to appear.
  await page.waitForURL(/\/app\//);
}

/** Fill the create-patient form's required fields (PatientForm) with the given name. */
export async function fillNewPatient(page: Page, given: string, last: string): Promise<void> {
  await page.getByLabel(/given name/i).fill(given);
  await page.getByLabel(/last name/i).fill(last);
  await page.getByLabel(/date of birth/i).fill("1990-05-02");
  await page.getByLabel(/gender/i).selectOption("Female");
  await page.getByLabel(/phone/i).fill("0400 000 000");
  await page.getByLabel(/address/i).fill("1 Test Street, Bondi NSW 2026");
  await page.getByLabel(/email/i).fill("e2e.patient@example.test");
  await page.getByLabel(/allergies/i).fill("None");
  await page.getByLabel(/current medications/i).fill("None");
}

/**
 * Draw a stroke on the consent SignaturePad canvas so hasSignature becomes true. The pad fires
 * onChange only on pointermove while the pointer is down, so the moves use `steps` to emit the
 * intermediate pointermove events React needs.
 */
export async function drawSignature(page: Page): Promise<void> {
  const canvas = page.locator("canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("signature canvas not found");
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, y + 15, { steps: 10 });
  await page.mouse.move(box.x + box.width * 0.8, y - 15, { steps: 10 });
  await page.mouse.up();
}

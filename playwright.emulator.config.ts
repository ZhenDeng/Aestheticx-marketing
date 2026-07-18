import { defineConfig, devices } from "@playwright/test";

// Cross-repo round-trip E2E: drives the app in LIVE mode against the local Firebase Emulator
// Suite, so the REAL backend Cloud Functions (approveRequest, …) run and Firestore persists
// across the sign-out — the one thing the demo E2E can't do.
//
// PREREQUISITE: the emulators must be running from the backend repo:
//   cd ../AestheticX/backend && firebase emulators:start --only auth,firestore,functions
// See e2e-emulator/README.md. global-setup seeds the nurse + doctor + cooperation each run.
const PORT = 3098;
const PROJECT_ID = "aestheticx-91e6b";

// Force LIVE mode (all six vars non-empty → isFirebaseConfigured()) AND emulator wiring. App Check
// is explicitly blanked so it stays off. These override any real values in a local .env.local
// (Next never overwrites already-set process env).
const EMULATOR_ENV = {
  NEXT_PUBLIC_FIREBASE_EMULATORS: "true",
  NEXT_PUBLIC_FIREBASE_API_KEY: "demo-api-key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: `${PROJECT_ID}.firebaseapp.com`,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: `${PROJECT_ID}.appspot.com`,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "1234567890",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:1234567890:web:demoemulator",
  NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY: "",
};

export default defineConfig({
  testDir: "./e2e-emulator",
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./e2e-emulator/global-setup.ts",
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: true,
    timeout: 120_000,
    env: EMULATOR_ENV,
  },
});

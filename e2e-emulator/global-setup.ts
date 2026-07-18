// Playwright global setup for the emulator suite: verifies the emulators are reachable, then
// seeds the nurse + doctor + cooperation relationship before the round-trip runs.
import { seed, PROJECT_ID } from "./seed";

async function reachable(url: string): Promise<boolean> {
  try {
    await fetch(url);
    return true;
  } catch {
    return false;
  }
}

// Wipe emulator data so every run starts from an identical, isolated state (Firestore + auth
// persist across runs otherwise, leaving stale patients/requests that break the assertions).
async function resetEmulators() {
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: "DELETE" });
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: "DELETE" });
}

export default async function globalSetup() {
  const authUp = await reachable("http://127.0.0.1:9099/");
  const fsUp = await reachable("http://127.0.0.1:8080/");
  if (!authUp || !fsUp) {
    throw new Error(
      "Firebase emulators are not running. Start them from the backend repo:\n" +
        "  cd ../AestheticX/backend && firebase emulators:start --only auth,firestore,functions\n" +
        "See e2e-emulator/README.md.",
    );
  }
  await resetEmulators();
  await seed();
}

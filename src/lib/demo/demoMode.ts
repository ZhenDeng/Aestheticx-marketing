// Per-tab sandbox flag. Visiting /demo turns the in-memory demo on for THIS tab only, which
// is what lets the demo and the real Firebase login coexist on one deployment.
//
// sessionStorage, deliberately: localStorage would make the sandbox sticky across every tab
// and survive a browser restart, so a clinician who once clicked "demo" could later find
// their real login silently sandboxed. Per-tab scoping dies with the tab, which also matches
// the demo's "resets on refresh" character.
//
// Storage is injected so this is unit-testable, and every access is wrapped because storage
// can throw (private browsing, disabled cookies) — the provider mounts at the app root, so a
// throw here would take the whole tree down. Same shape as loginPrefs.ts.
export const DEMO_MODE_KEY = "ax.demoMode";

const ON = "1";

export function isDemoModeRequested(storage: Storage): boolean {
  try {
    return storage.getItem(DEMO_MODE_KEY) === ON;
  } catch {
    // Storage unavailable — fall back to the environment-derived mode.
    return false;
  }
}

export function setDemoMode(storage: Storage, on: boolean): void {
  try {
    if (on) storage.setItem(DEMO_MODE_KEY, ON);
    else storage.removeItem(DEMO_MODE_KEY);
  } catch {
    // Storage unavailable — sandbox activation is best-effort.
  }
}

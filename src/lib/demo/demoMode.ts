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

// sessionStorage does not notify the tab that wrote it, so the flag is exposed as a tiny
// external store: the auth provider reads it via useSyncExternalStore, and every write here
// tells React to re-read the snapshot.
const listeners = new Set<() => void>();

// `window.sessionStorage` can throw on the PROPERTY ACCESS itself, not just on getItem/setItem
// (privacy configurations that block storage entirely). The functions above take an injected
// Storage so they stay unit-testable, which means the access happens at the call site — these
// wrappers own it, so the provider never touches `window.sessionStorage` unguarded. It mounts
// at the app root, so an unguarded throw there would blank the entire app.
function sessionStorageOrNull(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** This tab's sandbox flag, or false if storage is unreachable. */
export function readDemoMode(): boolean {
  const storage = sessionStorageOrNull();
  return storage ? isDemoModeRequested(storage) : false;
}

/** Set this tab's sandbox flag and notify subscribers, even if storage is unreachable. */
export function writeDemoMode(on: boolean): void {
  const storage = sessionStorageOrNull();
  if (storage) setDemoMode(storage, on);
  else listeners.forEach((l) => l()); // setDemoMode would have notified; keep that contract
}

export function subscribeDemoMode(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => { listeners.delete(onChange); };
}

export function setDemoMode(storage: Storage, on: boolean): void {
  try {
    if (on) storage.setItem(DEMO_MODE_KEY, ON);
    else storage.removeItem(DEMO_MODE_KEY);
  } catch {
    // Storage unavailable — sandbox activation is best-effort.
  }
  // Notify even if the write threw: the snapshot must be re-read either way, or the UI would
  // sit on a mode the storage never accepted.
  listeners.forEach((l) => l());
}

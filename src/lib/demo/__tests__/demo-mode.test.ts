import { describe, expect, it, vi } from "vitest";
import { DEMO_MODE_KEY, isDemoModeRequested, readDemoMode, setDemoMode, subscribeDemoMode, writeDemoMode } from "@/lib/demo/demoMode";

/** Minimal in-memory Storage stand-in (the loginPrefs.test pattern). */
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  } as Storage;
}

/** Storage that throws on every access — private browsing / disabled storage. */
function throwingStorage(): Storage {
  const boom = () => { throw new Error("storage unavailable"); };
  return {
    get length(): number { return boom(); },
    clear: boom, getItem: boom, key: boom, removeItem: boom, setItem: boom,
  } as unknown as Storage;
}

describe("isDemoModeRequested", () => {
  it("is false when nothing has been stored", () => {
    expect(isDemoModeRequested(memoryStorage())).toBe(false);
  });

  it("is true once demo mode is set on", () => {
    const s = memoryStorage();
    setDemoMode(s, true);
    expect(isDemoModeRequested(s)).toBe(true);
  });

  it("is false again once demo mode is set off", () => {
    const s = memoryStorage();
    setDemoMode(s, true);
    setDemoMode(s, false);
    expect(isDemoModeRequested(s)).toBe(false);
    expect(s.getItem(DEMO_MODE_KEY)).toBeNull();
  });

  it("ignores a stored value that is not the on-marker", () => {
    const s = memoryStorage();
    s.setItem(DEMO_MODE_KEY, "maybe");
    expect(isDemoModeRequested(s)).toBe(false);
  });
});

// The provider reads this through useSyncExternalStore, so writes must notify subscribers —
// otherwise entering /demo would set the flag without re-rendering the app into the sandbox.
describe("subscribeDemoMode", () => {
  it("notifies subscribers on every write", () => {
    const s = memoryStorage();
    const cb = vi.fn();
    const unsubscribe = subscribeDemoMode(cb);

    setDemoMode(s, true);
    expect(cb).toHaveBeenCalledTimes(1);
    setDemoMode(s, false);
    expect(cb).toHaveBeenCalledTimes(2);

    unsubscribe();
    setDemoMode(s, true);
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("still notifies when the write itself failed", () => {
    // The snapshot must be re-read either way; swallowing the notify would leave the UI
    // showing a mode the storage never accepted.
    const cb = vi.fn();
    const unsubscribe = subscribeDemoMode(cb);
    setDemoMode(throwingStorage(), true);
    expect(cb).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});

// The provider must never evaluate `window.sessionStorage` itself outside a guard: in some
// privacy configurations the property ACCESS throws, not just getItem/setItem. These wrappers
// own that access so the module's "every access is wrapped" claim actually holds at the call
// site — the provider mounts at the app root, so a throw there blanks the whole app.
describe("readDemoMode / writeDemoMode (window access guarded)", () => {
  it("round-trips through the real sessionStorage", () => {
    window.sessionStorage.clear();
    expect(readDemoMode()).toBe(false);
    writeDemoMode(true);
    expect(readDemoMode()).toBe(true);
    writeDemoMode(false);
    expect(readDemoMode()).toBe(false);
  });

  it("reports not-requested when the window accessor itself throws", () => {
    const spy = vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
      throw new Error("blocked by privacy settings");
    });
    try {
      expect(() => readDemoMode()).not.toThrow();
      expect(readDemoMode()).toBe(false);
      expect(() => writeDemoMode(true)).not.toThrow();
    } finally {
      spy.mockRestore();
    }
  });
});

describe("storage failures degrade to live mode", () => {
  // The provider mounts at the app root: a throwing sessionStorage must never take the
  // whole tree down. Reporting "not requested" falls back to today's env-derived mode.
  it("reports not-requested instead of throwing", () => {
    expect(() => isDemoModeRequested(throwingStorage())).not.toThrow();
    expect(isDemoModeRequested(throwingStorage())).toBe(false);
  });

  it("swallows a write failure", () => {
    expect(() => setDemoMode(throwingStorage(), true)).not.toThrow();
    expect(() => setDemoMode(throwingStorage(), false)).not.toThrow();
  });
});

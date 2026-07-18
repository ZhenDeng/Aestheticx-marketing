import { describe, expect, it } from "vitest";
import { DEMO_MODE_KEY, isDemoModeRequested, setDemoMode } from "@/lib/demo/demoMode";

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

import { describe, expect, it } from "vitest";
import { rememberedEmail, saveLoginPrefs, REMEMBERED_EMAIL_KEY } from "@/lib/demo/loginPrefs";

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    get length() { return map.size; },
  } as Storage;
}

function throwingStorage(): Storage {
  const boom = () => { throw new Error("denied"); };
  return { getItem: boom, setItem: boom, removeItem: boom, clear: boom, key: boom, length: 0 } as unknown as Storage;
}

describe("rememberedEmail", () => {
  it("returns the stored email", () => {
    const s = memoryStorage({ [REMEMBERED_EMAIL_KEY]: "nurse@example.com" });
    expect(rememberedEmail(s)).toBe("nurse@example.com");
  });

  it("returns null when nothing stored or the value is blank", () => {
    expect(rememberedEmail(memoryStorage())).toBeNull();
    expect(rememberedEmail(memoryStorage({ [REMEMBERED_EMAIL_KEY]: "  " }))).toBeNull();
  });

  it("returns null instead of crashing when storage throws (private browsing)", () => {
    expect(rememberedEmail(throwingStorage())).toBeNull();
  });
});

describe("saveLoginPrefs", () => {
  it("stores the email when remembering", () => {
    const s = memoryStorage();
    saveLoginPrefs(s, { email: "doc@example.com", remember: true });
    expect(s.getItem(REMEMBERED_EMAIL_KEY)).toBe("doc@example.com");
  });

  it("clears any stored email when not remembering", () => {
    const s = memoryStorage({ [REMEMBERED_EMAIL_KEY]: "old@example.com" });
    saveLoginPrefs(s, { email: "doc@example.com", remember: false });
    expect(s.getItem(REMEMBERED_EMAIL_KEY)).toBeNull();
  });

  it("does not store a blank email even when remembering", () => {
    const s = memoryStorage({ [REMEMBERED_EMAIL_KEY]: "old@example.com" });
    saveLoginPrefs(s, { email: "   ", remember: true });
    expect(s.getItem(REMEMBERED_EMAIL_KEY)).toBeNull();
  });

  it("swallows storage errors", () => {
    expect(() => saveLoginPrefs(throwingStorage(), { email: "x@y.z", remember: true })).not.toThrow();
  });
});

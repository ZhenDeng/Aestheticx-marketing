import { describe, expect, it } from "vitest";
import {
  identityKey, saveSelectedIdentity, rememberedIdentityKey, pickInitialIdentity,
  SELECTED_IDENTITY_KEY,
} from "@/lib/demo/identityPrefs";
import type { Identity } from "@/lib/demo/types";

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    get length() { return map.size; },
  } as Storage;
}
function throwingStorage(): Storage {
  const boom = () => { throw new Error("denied"); };
  return { getItem: boom, setItem: boom, removeItem: boom, clear: boom, key: boom, length: 0 } as unknown as Storage;
}

const nurseIndependent: Identity = { user: { id: "u1", name: "Zhexia" }, role: "nurse", context: { kind: "independent" } };
const superAdmin: Identity = { user: { id: "u1", name: "Zhexia" }, role: "superAdmin", context: { kind: "independent" } };
const nurseClinic: Identity = { user: { id: "u1", name: "Zhexia" }, role: "nurse", context: { kind: "clinic", clinic: { id: "clinic-lumiere", name: "Lumière" } } };

describe("identityKey", () => {
  it("keys independent identities by role", () => {
    expect(identityKey(nurseIndependent)).toBe("nurse:independent");
    expect(identityKey(superAdmin)).toBe("superAdmin:independent");
  });
  it("keys clinic identities by role + clinic id", () => {
    expect(identityKey(nurseClinic)).toBe("nurse:clinic-lumiere");
  });
});

describe("save + restore round-trip", () => {
  it("remembers the exact identity that was selected", () => {
    const s = memoryStorage();
    saveSelectedIdentity(s, nurseIndependent);
    expect(rememberedIdentityKey(s, "u1")).toBe("nurse:independent");
  });
  it("scopes by uid — a different account does not inherit the choice", () => {
    const s = memoryStorage();
    saveSelectedIdentity(s, nurseIndependent); // uid u1
    expect(rememberedIdentityKey(s, "u2")).toBeNull();
  });
  it("returns null when nothing stored or storage throws", () => {
    expect(rememberedIdentityKey(memoryStorage(), "u1")).toBeNull();
    expect(rememberedIdentityKey(throwingStorage(), "u1")).toBeNull();
  });
  it("swallows storage errors on save", () => {
    expect(() => saveSelectedIdentity(throwingStorage(), nurseIndependent)).not.toThrow();
  });
});

describe("pickInitialIdentity", () => {
  const list = [superAdmin, nurseIndependent]; // default is superAdmin (first)

  it("restores the remembered identity when still present", () => {
    const s = memoryStorage({ [SELECTED_IDENTITY_KEY]: JSON.stringify({ uid: "u1", key: "nurse:independent" }) });
    expect(pickInitialIdentity(s, "u1", list)).toBe(nurseIndependent);
  });
  it("falls back to the first identity when nothing is remembered", () => {
    expect(pickInitialIdentity(memoryStorage(), "u1", list)).toBe(superAdmin);
  });
  it("falls back to the first when the remembered identity is no longer available", () => {
    const s = memoryStorage({ [SELECTED_IDENTITY_KEY]: JSON.stringify({ uid: "u1", key: "nurse:clinic-lumiere" }) });
    expect(pickInitialIdentity(s, "u1", list)).toBe(superAdmin);
  });
  it("returns null for an empty identity list", () => {
    expect(pickInitialIdentity(memoryStorage(), "u1", [])).toBeNull();
  });
});

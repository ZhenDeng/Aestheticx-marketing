import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isFirebaseConfigured, firebaseConfig } from "@/lib/firebase/client";
import { isAppCheckConfigured } from "@/lib/firebase/client";

const KEYS = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
] as const;

describe("isFirebaseConfigured", () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("is false when config is absent", () => {
    expect(isFirebaseConfigured()).toBe(false);
  });

  it("is true only when every key is present", () => {
    for (const k of KEYS) process.env[k] = "x";
    expect(isFirebaseConfigured()).toBe(true);
    expect(firebaseConfig().projectId).toBe("x");
  });
});

describe("isAppCheckConfigured", () => {
  const KEY = "NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY";
  const saved = process.env[KEY];
  afterEach(() => {
    if (saved === undefined) delete process.env[KEY];
    else process.env[KEY] = saved;
  });
  it("is false when no site key is set", () => {
    delete process.env[KEY];
    expect(isAppCheckConfigured()).toBe(false);
  });
  it("is true when a site key is present", () => {
    process.env[KEY] = "site-key-123";
    expect(isAppCheckConfigured()).toBe(true);
  });
});

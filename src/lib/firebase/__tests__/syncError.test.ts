import { describe, it, expect } from "vitest";
import { isPermissionError, syncErrorMessage } from "../syncError";

// 16/07 feedback bug 1: a freshly created nurse whose custom claims got wiped hits
// permission-denied on every write, but the app showed ONE hardcoded "reconcile on
// refresh" banner — indistinguishable from a network blip and impossible to diagnose.
// The categoriser tells the two apart and gives the permission case actionable copy.

describe("isPermissionError", () => {
  it("recognises Firebase callable + Firestore permission codes", () => {
    expect(isPermissionError({ code: "functions/permission-denied" })).toBe(true);
    expect(isPermissionError({ code: "permission-denied" })).toBe(true);
    expect(isPermissionError({ code: "functions/unauthenticated" })).toBe(true);
    expect(isPermissionError({ code: "unauthenticated" })).toBe(true);
  });

  it("recognises permission wording when no code is present", () => {
    expect(isPermissionError(new Error("Missing or insufficient permissions."))).toBe(true);
    expect(isPermissionError(new Error("PERMISSION_DENIED: nope"))).toBe(true);
  });

  it("treats transient/network failures as NOT permission", () => {
    expect(isPermissionError({ code: "functions/unavailable" })).toBe(false);
    expect(isPermissionError(new Error("network request failed"))).toBe(false);
    expect(isPermissionError("Live request updates were interrupted")).toBe(false);
  });
});

describe("syncErrorMessage", () => {
  it("passes an already-friendly string straight through (listener messages)", () => {
    expect(syncErrorMessage("Live calendar updates were interrupted — refresh.")).toBe(
      "Live calendar updates were interrupted — refresh.",
    );
  });

  it("gives a permission failure actionable, category-specific copy", () => {
    const msg = syncErrorMessage({ code: "functions/permission-denied" });
    expect(msg).toMatch(/permission/i);
    expect(msg).toMatch(/administrator/i);
  });

  it("keeps the reconcile-on-refresh copy for a transient failure", () => {
    const msg = syncErrorMessage({ code: "functions/unavailable" });
    expect(msg).toMatch(/reconcile on refresh/i);
  });
});

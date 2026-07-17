import { describe, it, expect, vi } from "vitest";
import { needsClaimsSelfHeal, resolveClaimsWithSelfHeal } from "@/lib/firebase/selfHeal";

// The wiped-claims signature (16/07 bug 1): the ID token carries NO roles while the
// users/{uid} doc — server truth — still records them. Anything else is healthy or
// genuinely role-less and must not trigger a repair call.
describe("needsClaimsSelfHeal", () => {
  it("detects the wiped signature: empty token roles, roled users doc", () => {
    expect(needsClaimsSelfHeal([], { roles: ["nurse"] })).toBe(true);
  });

  it("does not fire for a healthy token", () => {
    expect(needsClaimsSelfHeal(["nurse"], { roles: ["nurse"] })).toBe(false);
  });

  it("does not fire when the users doc has no roles to grant", () => {
    expect(needsClaimsSelfHeal([], { roles: [] })).toBe(false);
    expect(needsClaimsSelfHeal([], {})).toBe(false);
    expect(needsClaimsSelfHeal([], null)).toBe(false);
  });

  it("does not fire on a malformed doc roles shape", () => {
    expect(needsClaimsSelfHeal([], { roles: "nurse" })).toBe(false);
    expect(needsClaimsSelfHeal([], { roles: [42] })).toBe(false);
  });
});

function tokenClaims(roles: string[], clinics: Record<string, string> = {}) {
  return { roles, clinics };
}

describe("resolveClaimsWithSelfHeal", () => {
  it("repairs a wiped account: calls repair once, force-refreshes, returns repaired claims", async () => {
    const readTokenClaims = vi
      .fn()
      .mockResolvedValueOnce(tokenClaims([]))
      .mockResolvedValueOnce(tokenClaims(["nurse"]));
    const repairOwnClaims = vi.fn().mockResolvedValue(undefined);
    const result = await resolveClaimsWithSelfHeal("u-yinghua", {
      readTokenClaims,
      readUserDoc: async () => ({ name: "Yinghua Xu", roles: ["nurse"] }),
      repairOwnClaims,
    });
    expect(repairOwnClaims).toHaveBeenCalledTimes(1);
    expect(readTokenClaims).toHaveBeenNthCalledWith(1, false);
    expect(readTokenClaims).toHaveBeenNthCalledWith(2, true);
    expect(result.claims).toEqual({ uid: "u-yinghua", roles: ["nurse"], clinics: {} });
    expect(result.userDoc).toEqual({ name: "Yinghua Xu", roles: ["nurse"] });
  });

  it("makes no repair call for a healthy token", async () => {
    const repairOwnClaims = vi.fn();
    const readTokenClaims = vi.fn().mockResolvedValue(tokenClaims(["doctor"], { c1: "admin" }));
    const result = await resolveClaimsWithSelfHeal("u-voss", {
      readTokenClaims,
      readUserDoc: async () => ({ name: "Dr Elena Voss", roles: ["doctor"] }),
      repairOwnClaims,
    });
    expect(repairOwnClaims).not.toHaveBeenCalled();
    expect(readTokenClaims).toHaveBeenCalledTimes(1);
    expect(result.claims).toEqual({ uid: "u-voss", roles: ["doctor"], clinics: { c1: "admin" } });
  });

  it("makes no repair call when the users doc grants nothing", async () => {
    const repairOwnClaims = vi.fn();
    const result = await resolveClaimsWithSelfHeal("u-new", {
      readTokenClaims: vi.fn().mockResolvedValue(tokenClaims([])),
      readUserDoc: async () => null,
      repairOwnClaims,
    });
    expect(repairOwnClaims).not.toHaveBeenCalled();
    expect(result.claims).toEqual({ uid: "u-new", roles: [], clinics: {} });
  });

  it("falls through to the original claims when the repair call fails", async () => {
    const readTokenClaims = vi.fn().mockResolvedValue(tokenClaims([]));
    const result = await resolveClaimsWithSelfHeal("u-yinghua", {
      readTokenClaims,
      readUserDoc: async () => ({ name: "Yinghua Xu", roles: ["nurse"] }),
      repairOwnClaims: vi.fn().mockRejectedValue(new Error("permission-denied")),
    });
    // No throw, single token read (no pointless refresh after a failed repair).
    expect(readTokenClaims).toHaveBeenCalledTimes(1);
    expect(result.claims).toEqual({ uid: "u-yinghua", roles: [], clinics: {} });
  });

  it("falls through to the original claims when the post-repair refresh fails", async () => {
    const readTokenClaims = vi
      .fn()
      .mockResolvedValueOnce(tokenClaims([]))
      .mockRejectedValueOnce(new Error("network"));
    const result = await resolveClaimsWithSelfHeal("u-yinghua", {
      readTokenClaims,
      readUserDoc: async () => ({ name: "Yinghua Xu", roles: ["nurse"] }),
      repairOwnClaims: vi.fn().mockResolvedValue(undefined),
    });
    expect(result.claims).toEqual({ uid: "u-yinghua", roles: [], clinics: {} });
  });

  it("sanitises malformed token claim shapes to the empty set", async () => {
    const result = await resolveClaimsWithSelfHeal("u-x", {
      readTokenClaims: vi.fn().mockResolvedValue({ roles: "nurse", clinics: ["c1"] }),
      readUserDoc: async () => null,
      repairOwnClaims: vi.fn(),
    });
    expect(result.claims).toEqual({ uid: "u-x", roles: [], clinics: {} });
  });
});

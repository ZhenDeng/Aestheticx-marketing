import { describe, it, expect, vi, beforeEach } from "vitest";

// Wiring-layer test (17/07 review): the pure selfHeal logic is covered elsewhere;
// this pins the glue a typo would silently break in production — the callable is
// named exactly "syncUserClaims", receives { userId: <uid> }, and the post-repair
// token read forces a refresh.

const innerCallable = vi.fn().mockResolvedValue({ data: { ok: true, roles: ["nurse"] } });
vi.mock("firebase/functions", () => ({ httpsCallable: vi.fn(() => innerCallable) }));
vi.mock("firebase/firestore", () => ({
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(async () => ({ exists: () => true, data: () => ({ name: "Yinghua Xu", roles: ["nurse"] }) })),
}));
vi.mock("@/lib/firebase/client", () => ({
  firebaseAuth: vi.fn(() => ({})),
  firestore: vi.fn(() => ({})),
  functions: vi.fn(() => "fns-instance"),
}));

import { httpsCallable } from "firebase/functions";
import { identitiesForUser } from "@/lib/firebase/auth";
import type { User } from "firebase/auth";

function wipedUser(uid: string): User {
  const getIdTokenResult = vi
    .fn()
    .mockResolvedValueOnce({ claims: { roles: [], clinics: {} } })
    .mockResolvedValue({ claims: { roles: ["nurse"], clinics: {} } });
  return { uid, getIdTokenResult } as unknown as User;
}

describe("identitiesForUser self-heal wiring", () => {
  beforeEach(() => {
    vi.mocked(httpsCallable).mockClear();
    innerCallable.mockClear();
  });

  it("invokes the syncUserClaims callable with { userId } and force-refreshes the token", async () => {
    const user = wipedUser("u-wiring-1");
    const ids = await identitiesForUser(user);
    expect(httpsCallable).toHaveBeenCalledWith("fns-instance", "syncUserClaims");
    expect(innerCallable).toHaveBeenCalledWith({ userId: "u-wiring-1" });
    expect(user.getIdTokenResult).toHaveBeenNthCalledWith(2, true);
    expect(ids).toHaveLength(1);
    expect(ids[0].role).toBe("nurse");
  });

  it("does not repeat the heal for the same uid in the same session (module latch)", async () => {
    await identitiesForUser(wipedUser("u-wiring-2"));
    await identitiesForUser(wipedUser("u-wiring-2"));
    expect(innerCallable).toHaveBeenCalledTimes(1);
  });
});

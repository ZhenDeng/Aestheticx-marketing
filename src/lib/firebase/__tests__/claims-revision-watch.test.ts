// watchClaimsRevision (20/07): revoking a doctor's employee kind converges Auth claims
// server-side immediately, but a signed-in session only sees them at its next ID-token
// refresh (up to an hour). The watcher forces that refresh when the Function-managed
// claimsRevision on the user's own users/{uid} doc moves.
import { describe, it, expect, vi, beforeEach } from "vitest";

const getIdToken = vi.fn(async () => "fresh-token");
const unsubSpy = vi.fn();
let snapNext: (snap: { get: (field: string) => unknown }) => void;

vi.mock("firebase/auth", () => ({
  signInWithEmailAndPassword: vi.fn(), signOut: vi.fn(), onIdTokenChanged: vi.fn(),
  updatePassword: vi.fn(), setPersistence: vi.fn(),
  browserLocalPersistence: {}, browserSessionPersistence: {},
}));
vi.mock("firebase/firestore", () => ({
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(),
  onSnapshot: vi.fn((_ref: unknown, next: (snap: { get: (field: string) => unknown }) => void) => {
    snapNext = next;
    return unsubSpy;
  }),
}));
vi.mock("firebase/functions", () => ({ httpsCallable: vi.fn() }));
vi.mock("@/lib/firebase/client", () => ({
  firebaseAuth: () => ({ currentUser: { getIdToken } }),
  firestore: () => ({}),
  functions: () => ({}),
}));

import { watchClaimsRevision } from "@/lib/firebase/auth";

const snap = (revision?: number) => ({ get: (field: string) => (field === "claimsRevision" ? revision : undefined) });

beforeEach(() => {
  getIdToken.mockClear();
  unsubSpy.mockClear();
});

describe("watchClaimsRevision", () => {
  it("force-refreshes the token only when claimsRevision moves past the baseline", () => {
    const unsubscribe = watchClaimsRevision("u-doc");
    snapNext(snap(3)); // baseline — sign-in just minted a fresh token
    expect(getIdToken).not.toHaveBeenCalled();
    snapNext(snap(3)); // unrelated profile edit re-emits the doc — no refresh
    expect(getIdToken).not.toHaveBeenCalled();
    snapNext(snap(4)); // an admin granted/revoked a membership
    expect(getIdToken).toHaveBeenCalledTimes(1);
    expect(getIdToken).toHaveBeenCalledWith(true);
    unsubscribe();
    expect(unsubSpy).toHaveBeenCalledTimes(1);
  });

  it("treats a missing revision as 0 so the first Function-managed bump still refreshes", () => {
    watchClaimsRevision("u-doc");
    snapNext(snap(undefined)); // pre-claims-sync doc has no revision field
    snapNext(snap(1));
    expect(getIdToken).toHaveBeenCalledTimes(1);
  });
});

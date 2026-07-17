import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { emptyState } from "@/lib/demo/backend";
import { DEMO_ACCOUNTS } from "@/lib/demo/accounts";
import type { NoteTemplate } from "@/lib/demo/types";

// The signed-in live identity used across the test.
const LIVE_IDENTITY = DEMO_ACCOUNTS[2].identities[0];

// Force live mode so applyAndMirror exercises the Firestore mirror path.
vi.mock("@/lib/firebase/client", () => ({
  isFirebaseConfigured: () => true,
}));

// Stand in for Firebase Auth so DemoAuthProvider resolves a live identity
// without touching the real SDK.
vi.mock("@/lib/firebase/auth", () => ({
  watchUser: (cb: (u: unknown) => void) => {
    cb({ uid: LIVE_IDENTITY.user.id });
    return () => {};
  },
  identitiesForUser: async () => [LIVE_IDENTITY],
  mustChangePasswordForUser: async () => false,
  currentUserUid: () => LIVE_IDENTITY.user.id,
}));

// hydrate is the source of "server truth". It always returns an empty state —
// i.e. the server never persisted the optimistic write.
const hydrate = vi.hoisted(() => vi.fn(async () => emptyState()));
vi.mock("@/lib/firebase/hydrate", () => ({ hydrate }));

// Every mirror call rejects, simulating a failed live write.
vi.mock("@/lib/firebase/mirror", () => ({
  mirrorSaveNoteTemplate: vi.fn(async () => {
    throw new Error("network down");
  }),
}));

// Imported after the mocks so the store picks up live mode.
import { DemoStoreProvider, useDemoStore } from "@/lib/demo/store";
import { DemoAuthProvider } from "@/lib/demo/auth";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <DemoAuthProvider>
      <DemoStoreProvider>{children}</DemoStoreProvider>
    </DemoAuthProvider>
  );
}

describe("useDemoStore live-mode mirror failure", () => {
  beforeEach(() => {
    hydrate.mockClear();
  });

  it("reconciles optimistic state with server truth when a mirror write fails", async () => {
    const identity = LIVE_IDENTITY;
    const owner = identity.user.id;
    const template: NoteTemplate = {
      id: "tmpl-1",
      ownerID: owner,
      name: "Botox follow-up",
      body: "Review settling at 2 weeks.",
      aftercareCategories: [],
    };

    const { result } = renderHook(() => useDemoStore(), { wrapper });

    // Initial live hydrate settles to ready with empty (server-truth) state.
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const hydrateCalls = hydrate.mock.calls.length;
    expect(result.current.noteTemplatesForOwner(owner)).toEqual([]);

    // Optimistic local apply makes the template appear immediately.
    act(() => {
      result.current.saveNoteTemplate(template, identity);
    });
    expect(result.current.noteTemplatesForOwner(owner)).toHaveLength(1);

    // The mirror rejects: the banner is surfaced AND a rehydrate reconciles the
    // optimistic state back to server truth (template never persisted -> gone).
    await waitFor(() => expect(result.current.lastSyncError).not.toBeNull());
    await waitFor(() => expect(hydrate.mock.calls.length).toBeGreaterThan(hydrateCalls));
    await waitFor(() => expect(result.current.noteTemplatesForOwner(owner)).toEqual([]));
  });
});

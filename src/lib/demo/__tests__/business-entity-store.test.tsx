import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { emptyState } from "@/lib/demo/backend";
import { DEMO_ACCOUNTS } from "@/lib/demo/accounts";
import type { BusinessEntity } from "@/lib/demo/types";

// A super-admin live identity (the only role allowed to edit business entities).
const SUPER = DEMO_ACCOUNTS.flatMap((a) => a.identities).find((i) => i.role === "superAdmin")!;
const ENTITY: BusinessEntity = { id: "clinic-lumiere", type: "clinic", legalName: "Lumière Clinic Pty Ltd", tradingName: "Lumière", abn: "82601443218", isActive: true };

vi.mock("@/lib/firebase/client", () => ({ isFirebaseConfigured: () => true }));
vi.mock("@/lib/firebase/auth", () => ({
  watchUser: (cb: (u: unknown) => void) => { cb({ uid: SUPER.user.id }); return () => {}; },
  identitiesForUser: async () => [SUPER],
  mustChangePasswordForUser: async () => false,
  currentUserUid: () => SUPER.user.id,
}));
// Server truth: one active entity exists.
vi.mock("@/lib/firebase/hydrate", () => ({ hydrate: vi.fn(async () => ({ ...emptyState(), businessEntitiesByID: { [ENTITY.id]: ENTITY } })) }));

const mirrorSetBusinessEntity = vi.hoisted(() => vi.fn(async () => {}));
const mirrorDeactivateBusinessEntity = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/firebase/mirror", () => ({ mirrorSetBusinessEntity, mirrorDeactivateBusinessEntity }));

import { DemoStoreProvider, useDemoStore } from "@/lib/demo/store";
import { DemoAuthProvider } from "@/lib/demo/auth";

function wrapper({ children }: { children: ReactNode }) {
  return <DemoAuthProvider><DemoStoreProvider>{children}</DemoStoreProvider></DemoAuthProvider>;
}

describe("useDemoStore business-entity actions (live, Tier 3 #4)", () => {
  beforeEach(() => { mirrorSetBusinessEntity.mockClear(); mirrorDeactivateBusinessEntity.mockClear(); });

  it("deactivate → mirrorDeactivateBusinessEntity(id) only", async () => {
    const { result } = renderHook(() => useDemoStore(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => { result.current.setBusinessEntityActive(ENTITY.id, false, SUPER); });
    await waitFor(() => expect(mirrorDeactivateBusinessEntity).toHaveBeenCalledWith(ENTITY.id));
    expect(mirrorSetBusinessEntity).not.toHaveBeenCalled();
  });

  it("reactivate → mirrorSetBusinessEntity with the stored fields + isActive:true (no reactivate callable)", async () => {
    const { result } = renderHook(() => useDemoStore(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => { result.current.setBusinessEntityActive(ENTITY.id, true, SUPER); });
    await waitFor(() => expect(mirrorSetBusinessEntity).toHaveBeenCalledWith({
      id: ENTITY.id, type: "clinic", legalName: "Lumière Clinic Pty Ltd", tradingName: "Lumière", abn: "82601443218", isActive: true,
    }));
    expect(mirrorDeactivateBusinessEntity).not.toHaveBeenCalled();
  });

  it("setBusinessEntity(edit) → mirrorSetBusinessEntity with the input (e.g. filling a clinic ABN)", async () => {
    const { result } = renderHook(() => useDemoStore(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => { result.current.setBusinessEntity({ id: ENTITY.id, type: "clinic", legalName: "Lumière Clinic Pty Ltd", abn: "82601443218" }, SUPER); });
    await waitFor(() => expect(mirrorSetBusinessEntity).toHaveBeenCalledWith({ id: ENTITY.id, type: "clinic", legalName: "Lumière Clinic Pty Ltd", abn: "82601443218" }));
  });
});

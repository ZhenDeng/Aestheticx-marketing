import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { emptyState } from "@/lib/demo/backend";
import { DEMO_ACCOUNTS } from "@/lib/demo/accounts";
import type { CatalogProduct } from "@/lib/demo/catalog";

// A super-admin live identity (the only role allowed to edit the catalog).
const SUPER = DEMO_ACCOUNTS.flatMap((a) => a.identities).find((i) => i.role === "superAdmin")!;
const PRODUCT: CatalogProduct = { id: "hafiller-juvederm-voluma", category: "haFiller", brand: "Juvederm", name: "Voluma", unit: "millilitres", isActive: true };

vi.mock("@/lib/firebase/client", () => ({ isFirebaseConfigured: () => true }));
vi.mock("@/lib/firebase/auth", () => ({
  watchUser: (cb: (u: unknown) => void) => { cb({ uid: SUPER.user.id }); return () => {}; },
  identitiesForUser: async () => [SUPER],
  mustChangePasswordForUser: async () => false,
}));
// Server truth: one active product exists.
vi.mock("@/lib/firebase/hydrate", () => ({ hydrate: vi.fn(async () => ({ ...emptyState(), productsByID: { [PRODUCT.id]: PRODUCT } })) }));

const mirrorSetProduct = vi.hoisted(() => vi.fn(async () => {}));
const mirrorDeactivateProduct = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/firebase/mirror", () => ({ mirrorSetProduct, mirrorDeactivateProduct }));

import { DemoStoreProvider, useDemoStore } from "@/lib/demo/store";
import { DemoAuthProvider } from "@/lib/demo/auth";

function wrapper({ children }: { children: ReactNode }) {
  return <DemoAuthProvider><DemoStoreProvider>{children}</DemoStoreProvider></DemoAuthProvider>;
}

describe("useDemoStore catalog actions (live, Tier 3 #5B)", () => {
  beforeEach(() => { mirrorSetProduct.mockClear(); mirrorDeactivateProduct.mockClear(); });

  it("deactivate → mirrorDeactivateProduct(id) only", async () => {
    const { result } = renderHook(() => useDemoStore(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => { result.current.setProductActive(PRODUCT.id, false, SUPER); });
    await waitFor(() => expect(mirrorDeactivateProduct).toHaveBeenCalledWith(PRODUCT.id));
    expect(mirrorSetProduct).not.toHaveBeenCalled();
  });

  it("reactivate → mirrorSetProduct with the stored fields + isActive:true (no reactivate callable)", async () => {
    const { result } = renderHook(() => useDemoStore(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => { result.current.setProductActive(PRODUCT.id, true, SUPER); });
    await waitFor(() => expect(mirrorSetProduct).toHaveBeenCalledWith({
      id: PRODUCT.id, category: "haFiller", brand: "Juvederm", name: "Voluma", unit: "millilitres", isActive: true,
    }));
    expect(mirrorDeactivateProduct).not.toHaveBeenCalled();
  });

  it("setProduct(create) → mirrorSetProduct with the input", async () => {
    const { result } = renderHook(() => useDemoStore(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => { result.current.setProduct({ category: "neurotoxin", name: "Botox", unit: "units" }, SUPER); });
    await waitFor(() => expect(mirrorSetProduct).toHaveBeenCalledWith({ category: "neurotoxin", name: "Botox", unit: "units" }));
  });
});

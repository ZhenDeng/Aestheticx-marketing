import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { DemoStoreProvider, useDemoStore } from "@/lib/demo/store";
import { DemoAuthProvider } from "@/lib/demo/auth";
import { DEMO_ACCOUNTS } from "@/lib/demo/accounts";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <DemoAuthProvider>
      <DemoStoreProvider>{children}</DemoStoreProvider>
    </DemoAuthProvider>
  );
}

describe("useDemoStore", () => {
  it("starts from the seed and approves a pending request", () => {
    const { result } = renderHook(() => useDemoStore(), { wrapper });
    const voss = DEMO_ACCOUNTS[2].identities[0];

    const pending = result.current.pendingRequestsForDoctor("u-voss");
    expect(pending.length).toBeGreaterThanOrEqual(1);

    act(() => {
      result.current.approveRequest(pending[0].id, voss);
    });

    expect(result.current.pendingRequestsForDoctor("u-voss").length).toBe(pending.length - 1);
  });
});

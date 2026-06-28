import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { DemoAuthProvider, useDemoAuth } from "@/lib/demo/auth";
import { DEMO_ACCOUNTS } from "@/lib/demo/accounts";

function wrapper({ children }: { children: ReactNode }) {
  return <DemoAuthProvider>{children}</DemoAuthProvider>;
}

describe("DemoAuthProvider (demo mode)", () => {
  it("defaults to demo mode and signs in with a preset identity", () => {
    const { result } = renderHook(() => useDemoAuth(), { wrapper });
    expect(result.current.mode).toBe("demo");
    expect(result.current.identity).toBeNull();
    act(() => result.current.signIn(DEMO_ACCOUNTS[0].identities[0]));
    expect(result.current.identity?.user.name).toBe("Sarah Chen");
  });
});

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }), usePathname: () => "/app/dashboard" }));

import { DemoAuthProvider } from "@/lib/demo/auth";
import { AuthGuard } from "@/components/app/AuthGuard";

function SignedOut() {
  return (
    <DemoAuthProvider>
      <AuthGuard>
        <div>secret</div>
      </AuthGuard>
    </DemoAuthProvider>
  );
}

describe("AuthGuard", () => {
  it("redirects to /login when there is no identity", () => {
    render(<SignedOut />);
    expect(replace).toHaveBeenCalledWith("/login");
    expect(screen.queryByText("secret")).not.toBeInTheDocument();
  });
});

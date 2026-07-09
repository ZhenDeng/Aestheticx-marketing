import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Identity } from "@/lib/demo/types";

// AuthGuard is the enforcement point for the §16/Rule 7 admin/clinical route separation: it
// applies redirectForRole and blocks the disallowed screen from flashing.

const replace = vi.fn();
let path = "/app/dashboard";
let currentIdentity: Identity | null = null;

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }), usePathname: () => path }));
vi.mock("@/lib/demo/auth", () => ({
  useDemoAuth: () => ({ identity: currentIdentity, resolved: true, mustChangePassword: false }),
}));

import { AuthGuard } from "@/components/app/AuthGuard";

const admin: Identity = { user: { id: "u-admin", name: "Priya" }, role: "superAdmin", context: { kind: "independent" } };
const doctor: Identity = { user: { id: "u-voss", name: "Dr Voss" }, role: "doctor", context: { kind: "independent" } };

function renderAt(identity: Identity, pathname: string) {
  currentIdentity = identity;
  path = pathname;
  return render(<AuthGuard><div>protected</div></AuthGuard>);
}

beforeEach(() => { replace.mockClear(); });

describe("AuthGuard role separation", () => {
  it("bounces a super admin off a clinical route to the admin home and hides it", () => {
    renderAt(admin, "/app/calendar");
    expect(replace).toHaveBeenCalledWith("/app/admin");
    expect(screen.queryByText("protected")).not.toBeInTheDocument();
  });

  it("lets a super admin stay in the admin area", () => {
    renderAt(admin, "/app/admin/audit");
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByText("protected")).toBeInTheDocument();
  });

  it("bounces a clinical role out of the admin area to the dashboard", () => {
    renderAt(doctor, "/app/admin");
    expect(replace).toHaveBeenCalledWith("/app/dashboard");
    expect(screen.queryByText("protected")).not.toBeInTheDocument();
  });

  it("leaves a clinical role on its own routes", () => {
    renderAt(doctor, "/app/calendar");
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByText("protected")).toBeInTheDocument();
  });
});

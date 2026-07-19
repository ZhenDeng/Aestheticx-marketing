import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Identity } from "@/lib/demo/types";

// Role-aware navigation (constitution §16/Rule 7): Platform Admin gets the admin modules, not
// the clinical shell. Driven by AppShell → navItemsFor(identity.role).

let currentIdentity: Identity;
let refreshing = false;
vi.mock("next/navigation", () => ({ usePathname: () => "/app/admin" }));
vi.mock("@/lib/demo/auth", () => ({ useDemoAuth: () => ({ identity: currentIdentity, signOut: vi.fn() }) }));
vi.mock("@/lib/demo/store", () => ({ useDemoStore: () => ({ status: "ready" as const, refreshing, lastSyncError: null }) }));

import { AppShell } from "@/components/app/AppShell";

const admin: Identity = { user: { id: "u-admin", name: "Priya Nair" }, role: "superAdmin", context: { kind: "independent" } };
const doctor: Identity = { user: { id: "u-voss", name: "Dr Voss" }, role: "doctor", context: { kind: "independent" } };

function navLabels(): string[] {
  return screen.getAllByRole("link").map((a) => a.textContent?.trim() ?? "");
}

describe("AppShell navigation", () => {
  it("shows Platform Admin the admin modules and hides the clinical daily tabs", () => {
    currentIdentity = admin;
    render(<AppShell><div /></AppShell>);
    const labels = navLabels();
    expect(labels).toEqual(expect.arrayContaining(["Admin", "Patient lookup", "Audit", "Profile"]));
    expect(labels).not.toContain("Calendar");
    expect(labels).not.toContain("Patients");
    expect(labels).not.toContain("Authorisations");
  });

  it("keeps the full clinical nav for a doctor (no Admin tab)", () => {
    currentIdentity = doctor;
    render(<AppShell><div /></AppShell>);
    const labels = navLabels();
    expect(labels).toEqual(expect.arrayContaining(["Dashboard", "Patients", "Calendar", "Profile"]));
    expect(labels).not.toContain("Admin");
  });
});

describe("AppShell refresh overlay (20/07 feedback)", () => {
  it("keeps the page content mounted under a blocking Syncing overlay while refreshing", () => {
    currentIdentity = admin;
    refreshing = true;
    render(<AppShell><div data-testid="page-content" /></AppShell>);
    expect(screen.getByTestId("page-content")).toBeInTheDocument(); // not unmounted
    expect(screen.getByRole("status", { name: "Syncing" })).toBeInTheDocument();
    refreshing = false;
  });

  it("renders no overlay when not refreshing", () => {
    currentIdentity = admin;
    render(<AppShell><div /></AppShell>);
    expect(screen.queryByRole("status", { name: "Syncing" })).not.toBeInTheDocument();
  });
});

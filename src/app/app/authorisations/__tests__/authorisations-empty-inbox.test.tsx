import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Identity } from "@/lib/demo/types";

// Owner feedback 2026-07-13 (bug 1): the doctor's empty inbox must not tell the DOCTOR
// to "Sign in as Sarah Chen to raise one" — doctors approve requests, they never raise
// them, and Sarah Chen is demo-cast copy that leaks into live mode.

const doctorIdentity: Identity = {
  user: { id: "doc-1", name: "Dr Demo" },
  role: "doctor",
  context: { kind: "independent" },
};

const consult = { start: vi.fn(), active: false };

vi.mock("@/lib/demo/auth", () => ({ useDemoAuth: () => ({ identity: doctorIdentity, availableIdentities: [doctorIdentity] }) }));
vi.mock("@/components/app/ConsultCall", () => ({ useConsultCall: () => consult }));
vi.mock("@/lib/demo/store", () => ({
  useDemoStore: () => ({
    status: "ready" as const,
    pendingRequestsForDoctor: () => [],
  }),
}));

import AuthorisationsPage from "@/app/app/authorisations/page";

describe("Authorisations doctor view — empty inbox", () => {
  it("shows a plain empty state without demo-cast instructions", () => {
    render(<AuthorisationsPage />);
    expect(screen.getByText("No pending requests.")).toBeInTheDocument();
    expect(screen.queryByText(/Sarah Chen/)).not.toBeInTheDocument();
  });
});

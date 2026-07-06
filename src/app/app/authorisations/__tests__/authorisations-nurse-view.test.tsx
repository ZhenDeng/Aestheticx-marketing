import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { AuthorisationRequest, Identity, Patient } from "@/lib/demo/types";

// A doctor-returned (needsEdit) request must give the nurse a way to edit and resubmit it;
// a still-pending request must not. The link targets the request builder in edit mode.

const nurse: Identity = {
  user: { id: "nurse-1", name: "Zhexia" },
  role: "nurse",
  context: { kind: "independent" },
};

const patient = { id: "pat-1", givenName: "Jane", lastName: "Roe" } as unknown as Patient;

function req(id: string, status: AuthorisationRequest["status"]): AuthorisationRequest {
  return {
    id,
    patientID: "pat-1",
    nurse: { id: "nurse-1", name: "Zhexia" },
    doctorID: "doc-1",
    context: { kind: "independent" },
    items: [{ name: "Botox", dosage: "20", category: "neurotoxin", unit: "units", areas: ["Glabella"] }],
    status,
    createdAt: 1,
  };
}

const requests: Record<string, AuthorisationRequest[]> = {
  needs: [req("req-needs", "needsEdit")],
  pending: [req("req-pending", "pending")],
};
let mode: keyof typeof requests = "needs";

vi.mock("@/lib/demo/auth", () => ({ useDemoAuth: () => ({ identity: nurse }) }));
vi.mock("@/components/app/ConsultCall", () => ({ useConsultCall: () => ({ start: vi.fn(), active: false }) }));
vi.mock("@/lib/demo/store", () => ({
  useDemoStore: () => ({
    status: "ready" as const,
    searchPatients: () => [patient],
    openRequestsForPatient: () => requests[mode],
  }),
}));

import AuthorisationsPage from "@/app/app/authorisations/page";

describe("Authorisations nurse view — edit & resubmit", () => {
  it("offers an Edit & resubmit link (to the builder in edit mode) for a returned request", () => {
    mode = "needs";
    render(<AuthorisationsPage />);
    const link = screen.getByRole("link", { name: /Edit & resubmit/i });
    expect(link).toHaveAttribute("href", "/app/patients/pat-1/request?edit=req-needs");
  });

  it("does not offer an edit link while the request is still pending", () => {
    mode = "pending";
    render(<AuthorisationsPage />);
    expect(screen.queryByRole("link", { name: /Edit & resubmit/i })).not.toBeInTheDocument();
  });
});

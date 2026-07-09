import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { AuthorisationRequest, Identity } from "@/lib/demo/types";

// Policy (spec 2026-07-07 reviewer-file-access): while a request is open the addressed
// doctor has read-only access to the patient's full file, so the review card links the
// patient name straight to it. The clinical alert stays visible at a glance.

const doctorIdentity: Identity = {
  user: { id: "doc-1", name: "Dr Demo" },
  role: "doctor",
  context: { kind: "independent" },
};

const request: AuthorisationRequest = {
  id: "req-1",
  patientID: "pat-1",
  nurse: { id: "nurse-1", name: "Zhexia" },
  doctorID: "doc-1",
  context: { kind: "independent" },
  items: [{ name: "Botox", dosage: "20", category: "neurotoxin", unit: "units", areas: ["Glabella"] }],
  status: "pending",
  createdAt: 1,
  patientSummary: {
    fullName: "Jane Roe",
    dateOfBirth: { year: 1990, month: 4, day: 12 },
    allergies: "Penicillin",
    currentMedications: "Sertraline",
    alert: "Pregnant",
  },
};

const consult = { start: vi.fn(), active: false };

vi.mock("@/lib/demo/auth", () => ({ useDemoAuth: () => ({ identity: doctorIdentity, availableIdentities: [doctorIdentity] }) }));
vi.mock("@/components/app/ConsultCall", () => ({ useConsultCall: () => consult }));
vi.mock("@/lib/demo/store", () => ({
  useDemoStore: () => ({
    status: "ready" as const,
    pendingRequestsForDoctor: () => [request],
  }),
}));

import AuthorisationsPage from "@/app/app/authorisations/page";

describe("Authorisations doctor view — reviewer file access", () => {
  it("links the patient name to the full patient file", () => {
    render(<AuthorisationsPage />);
    const link = screen.getByRole("link", { name: /Jane Roe/i });
    expect(link).toHaveAttribute("href", "/app/patients/pat-1");
  });

  it("surfaces the clinical alert on the card at a glance", () => {
    render(<AuthorisationsPage />);
    expect(screen.getByText(/Pregnant/)).toBeInTheDocument();
  });
});

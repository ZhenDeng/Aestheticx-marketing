import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AuthorisationRequest, Identity } from "@/lib/demo/types";

// The doctor reviewing a PENDING request has no patient-document access until approval
// (spec 6.12), so the patient name must NOT link to the file. Instead it discloses the
// patient summary the request already carries. These tests pin that behaviour.

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

vi.mock("@/lib/demo/auth", () => ({
  useDemoAuth: () => ({ identity: doctorIdentity }),
}));
vi.mock("@/components/app/ConsultCall", () => ({
  useConsultCall: () => consult,
}));
vi.mock("@/lib/demo/store", () => ({
  useDemoStore: () => ({
    status: "ready" as const,
    pendingRequestsForDoctor: () => [request],
  }),
}));

import AuthorisationsPage from "@/app/app/authorisations/page";

describe("Authorisations doctor view — patient summary disclosure", () => {
  beforeEach(() => {
    consult.start.mockClear();
  });

  it("renders the patient name as a button, not a link to the patient file", () => {
    render(<AuthorisationsPage />);
    const name = screen.getByRole("button", { name: /Jane Roe/i });
    expect(name).toBeInTheDocument();
    // Must not be an anchor to the (inaccessible) patient file.
    expect(screen.queryByRole("link", { name: /Jane Roe/i })).not.toBeInTheDocument();
  });

  it("keeps the DOB and current medications hidden until the name is clicked, then reveals them", async () => {
    const user = userEvent.setup();
    render(<AuthorisationsPage />);
    expect(screen.queryByText(/12\/4\/1990/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sertraline/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Jane Roe/i }));

    expect(screen.getByText(/12\/4\/1990/)).toBeInTheDocument();
    expect(screen.getByText(/Sertraline/)).toBeInTheDocument();
  });

  it("always surfaces the clinical alert without requiring a click", () => {
    render(<AuthorisationsPage />);
    expect(screen.getByText(/Pregnant/)).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { AuthorisationRequest, Identity } from "@/lib/demo/types";

// Tier-2 (constitution): doctor prescribing is always-on. A doctor+clinicAdmin who switches to the
// clinicAdmin workspace must STILL see their approval inbox and be able to approve / require-edit.
// The inbox is resolved from the account's held doctor identity, not the selected identity, and the
// actions run under that doctor identity so the backend's role gate is satisfied.

const doctorIdentity: Identity = {
  user: { id: "u-1", name: "Dr Nadia" }, role: "doctor", context: { kind: "independent" },
};
const clinicAdminIdentity: Identity = {
  user: { id: "u-1", name: "Dr Nadia" }, role: "clinicAdmin", context: { kind: "clinic", clinic: { id: "clinic-lumiere", name: "Lumière" } },
};

const request: AuthorisationRequest = {
  id: "req-1",
  patientID: "pat-1",
  nurse: { id: "nurse-1", name: "Sarah" },
  doctorID: "u-1",
  context: { kind: "independent" },
  items: [{ name: "Botox", dosage: "20", category: "neurotoxin", unit: "units", areas: ["Glabella"] }],
  status: "pending",
  createdAt: 1,
  patientSummary: { fullName: "Jane Roe", dateOfBirth: { year: 1990, month: 4, day: 12 }, allergies: "None", currentMedications: "" },
};

const consult = { start: vi.fn(), active: false };
const approveRequest = vi.fn();
const requireEdit = vi.fn();

// Mutable so each test can set the active identity / held set before importing the page.
const authState: { identity: Identity; availableIdentities: Identity[] } = {
  identity: clinicAdminIdentity,
  availableIdentities: [doctorIdentity, clinicAdminIdentity],
};

vi.mock("@/lib/demo/auth", () => ({ useDemoAuth: () => authState }));
vi.mock("@/components/app/ConsultCall", () => ({ useConsultCall: () => consult }));
vi.mock("@/lib/demo/store", () => ({
  useDemoStore: () => ({
    status: "ready" as const,
    pendingRequestsForDoctor: (doctorID: string) => (doctorID === "u-1" ? [request] : []),
    approveRequest,
    requireEdit,
    searchPatients: () => [],
    openRequestsForPatient: () => [],
  }),
}));

import AuthorisationsPage from "@/app/app/authorisations/page";

describe("Authorisations — cross-workspace prescribing", () => {
  beforeEach(() => {
    approveRequest.mockClear();
    requireEdit.mockClear();
    authState.identity = clinicAdminIdentity;
    authState.availableIdentities = [doctorIdentity, clinicAdminIdentity];
  });

  it("shows the review inbox for a doctor+clinicAdmin even while acting as clinicAdmin", () => {
    render(<AuthorisationsPage />);
    expect(screen.getByText(/Review requests/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Jane Roe/i })).toBeInTheDocument();
  });

  it("runs approve/require-edit under the doctor identity, not the selected clinicAdmin one", () => {
    render(<AuthorisationsPage />);
    fireEvent.click(screen.getByRole("button", { name: /^Approve$/i }));
    expect(approveRequest).toHaveBeenCalledWith("req-1", doctorIdentity);
    fireEvent.click(screen.getByRole("button", { name: /Require edit/i }));
    expect(requireEdit).toHaveBeenCalledWith("req-1", doctorIdentity);
  });

  it("still shows the admin 'don't raise requests' message for a clinicAdmin-only account", () => {
    authState.identity = clinicAdminIdentity;
    authState.availableIdentities = [clinicAdminIdentity];
    render(<AuthorisationsPage />);
    expect(screen.getByText(/Admins don.t raise authorisation requests/i)).toBeInTheDocument();
    expect(screen.queryByText(/Review requests/i)).not.toBeInTheDocument();
  });
});

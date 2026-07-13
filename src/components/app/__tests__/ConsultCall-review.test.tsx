import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { AuthorisationRequest, Identity } from "@/lib/demo/types";

// Owner feature (2026-07-13): while a consult call is up, the addressed doctor reviews the
// patient (summary + requested items) and may Approve / Require edit during the call; after
// hang-up a wrap-up step keeps the decision available and adds a post-call note (a
// doctor-direct treatment note — the only kind the live rules let a prescriber write).

const doctor: Identity = { user: { id: "doc-1", name: "Dr Demo" }, role: "doctor", context: { kind: "independent" } };
const nurse: Identity = { user: { id: "nurse-1", name: "Nina" }, role: "nurse", context: { kind: "independent" } };

function makeRequest(status: AuthorisationRequest["status"]): AuthorisationRequest {
  return {
    id: "req-1",
    patientID: "pat-1",
    nurse: { id: "nurse-1", name: "Nina" },
    doctorID: "doc-1",
    context: { kind: "independent" },
    items: [{ name: "Botox", dosage: "20", category: "neurotoxin", unit: "units", areas: ["Glabella"] }],
    status,
    createdAt: 1,
    patientSummary: {
      fullName: "Jane Roe",
      dateOfBirth: { year: 1990, month: 4, day: 12 },
      allergies: "Penicillin",
      currentMedications: "Sertraline",
      alert: "Pregnant",
    },
  };
}

const store = {
  state: { requests: {} as Record<string, AuthorisationRequest>, patients: {} },
  startConsult: vi.fn(async () => ({ mode: "demo" as const })),
  approveRequest: vi.fn(),
  requireEdit: vi.fn(),
  saveTreatmentNote: vi.fn(),
};
let currentIdentity: Identity = doctor;

vi.mock("@/lib/demo/auth", () => ({
  useDemoAuth: () => ({ identity: currentIdentity, availableIdentities: [currentIdentity] }),
}));
vi.mock("@/lib/demo/store", () => ({ useDemoStore: () => store }));

import { ConsultCallProvider, useConsultCall } from "@/components/app/ConsultCall";

function Starter() {
  const consult = useConsultCall();
  return <button onClick={() => consult.start("req-1", "Jane Roe")}>go</button>;
}

function renderAndStart() {
  render(
    <ConsultCallProvider>
      <Starter />
    </ConsultCallProvider>,
  );
  fireEvent.click(screen.getByText("go"));
}

beforeEach(() => {
  vi.clearAllMocks();
  currentIdentity = doctor;
  store.state = { requests: { "req-1": makeRequest("pending") }, patients: {} };
});

describe("ConsultCall — doctor review during the call", () => {
  it("shows the patient summary and requested items", async () => {
    renderAndStart();
    await waitFor(() => expect(screen.getByText(/Penicillin/)).toBeInTheDocument());
    expect(screen.getByText(/Pregnant/)).toBeInTheDocument();
    expect(screen.getByText(/Sertraline/)).toBeInTheDocument();
    expect(screen.getByText(/Botox/)).toBeInTheDocument();
  });

  it("lets the doctor approve mid-call with their doctor identity", async () => {
    renderAndStart();
    const approve = await screen.findByRole("button", { name: "Approve" });
    fireEvent.click(approve);
    expect(store.approveRequest).toHaveBeenCalledWith("req-1", doctor);
  });

  it("lets the doctor require an edit mid-call", async () => {
    renderAndStart();
    const btn = await screen.findByRole("button", { name: "Require edit" });
    fireEvent.click(btn);
    expect(store.requireEdit).toHaveBeenCalledWith("req-1", doctor);
  });

  it("shows no decision buttons to the nurse", async () => {
    currentIdentity = nurse;
    renderAndStart();
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
  });
});

describe("ConsultCall — wrap-up after hang-up", () => {
  it("moves the doctor to a wrap-up step instead of closing", async () => {
    renderAndStart();
    fireEvent.click(await screen.findByRole("button", { name: "End call" }));
    expect(screen.getByText(/Call ended/)).toBeInTheDocument();
    // Decision still available while the request is pending.
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("explains the note gate while the request is not approved", async () => {
    renderAndStart();
    fireEvent.click(await screen.findByRole("button", { name: "End call" }));
    expect(screen.getByText(/Approve the request to add a note/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save note" })).not.toBeInTheDocument();
  });

  it("saves a post-call consult note once the request is approved", async () => {
    store.state = { requests: { "req-1": makeRequest("approved") }, patients: {} };
    renderAndStart();
    fireEvent.click(await screen.findByRole("button", { name: "End call" }));
    fireEvent.change(screen.getByLabelText("Post-call note"), { target: { value: "Discussed dosage." } });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    expect(store.saveTreatmentNote).toHaveBeenCalledWith({
      patientID: "pat-1",
      tickedIDs: [],
      title: "Consult call note",
      body: "Discussed dosage.",
      medications: [],
      identity: doctor,
    });
    expect(screen.getByText(/Note saved/)).toBeInTheDocument();
  });

  it("ends immediately for a nurse (no wrap-up step)", async () => {
    currentIdentity = nurse;
    renderAndStart();
    fireEvent.click(await screen.findByRole("button", { name: "End call" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

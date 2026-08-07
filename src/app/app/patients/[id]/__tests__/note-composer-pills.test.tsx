// Owner feedback 07/08: the general note box used to sit permanently above the note stream
// while treatment note and aftercare were toggle buttons beside it. All three are now pills
// that pick each other, and the file opens on Treatment note — with the selection degrading
// for a viewer (clinic admin) who cannot write treatment notes at all.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Suspense } from "react";
import { emptyState } from "@/lib/demo/backend";
import { patientAccessLevel } from "@/lib/demo/isolation";
import { LUMIERE } from "@/lib/demo/accounts";
import type { DemoState, Identity, Patient } from "@/lib/demo/types";

const nurse: Identity = {
  user: { id: "u-nurse", name: "Zhexia Shah Wang" },
  role: "nurse",
  context: { kind: "clinic", clinic: LUMIERE },
};

// Writes general notes, never treatment notes (rule 2) — the default has to fall back.
const clinicAdmin: Identity = {
  user: { id: "u-admin", name: "Lumiere Front Desk" },
  role: "clinicAdmin",
  context: { kind: "clinic", clinic: LUMIERE },
};

const patient: Patient = {
  id: "p-1", givenName: "Christina", lastName: "Mao",
  dateOfBirth: { year: 1982, month: 10, day: 1 }, gender: "Female",
  address: "50 Cecil Street, Gordon NSW 2072", phone: "0478787180", email: "c@example.com",
  allergies: "nil", currentMedications: "",
  owner: { kind: "clinic", id: LUMIERE.id }, prescribingDoctorIDs: [], openReviewerDoctorIDs: [],
};

const state: DemoState = { ...emptyState(), patients: { [patient.id]: patient } };

let viewer: Identity = nurse;
const saveGeneralNote = vi.fn();

vi.mock("next/navigation", () => ({ usePathname: () => "/app", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/app/ConsultCall", () => ({ useConsultCall: () => ({ start: vi.fn(), active: false }) }));
vi.mock("@/components/app/PatientAvatar", () => ({ PatientAvatarPicker: () => null, PatientAvatar: () => null }));
vi.mock("@/lib/demo/auth", () => ({ useDemoAuth: () => ({ identity: viewer }) }));
vi.mock("@/lib/demo/store", () => ({
  useDemoStore: () => ({
    status: "demo" as const,
    now: Date.parse("2026-08-07T12:00:00Z"),
    state,
    matrixEnabled: true,
    patientAccess: (p: Patient, id: Identity) => patientAccessLevel(state, id, p),
    walletEntries: () => [], walletBalance: () => 0, priceListFor: () => [], invoicesFor: () => [],
    topUpWallet: vi.fn(), checkoutClient: vi.fn(), finalizeServiceFee: vi.fn(),
    visibleNotesForPatient: () => [],
    activeAuthorisations: () => [], activeEmergencyAuthorisations: () => [],
    formsForPatient: () => [], appointmentsForPatient: () => [], openRequestsForPatient: () => [],
    searchPatients: () => [], recordAdminAccess: vi.fn(),
    noteTemplatesForOwner: () => [],
    deletePatient: vi.fn(), mergePatients: vi.fn(), saveGeneralNote,
    saveTreatmentNote: vi.fn(), sendAftercare: vi.fn(),
    retryAftercare: vi.fn(), withdrawRequest: vi.fn(),
  }),
}));

import PatientFilePage from "@/app/app/patients/[id]/page";

async function openNotes() {
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <PatientFilePage params={Promise.resolve({ id: "p-1" })} />
      </Suspense>,
    );
    await Promise.resolve();
    await Promise.resolve();
  });
  // Notes collapse by default (patient-file accordions) — open the section first.
  await userEvent.click(screen.getByRole("button", { name: /notes \(0\)/i }));
}

const pill = (name: string) => screen.getByRole("button", { name });

beforeEach(() => {
  viewer = nurse;
  saveGeneralNote.mockClear();
});

describe("patient file — note composer pills", () => {
  it("offers all three kinds as pills, with Treatment note selected on open", async () => {
    await openNotes();
    expect(pill("Treatment note")).toHaveAttribute("aria-pressed", "true");
    expect(pill("General note")).toHaveAttribute("aria-pressed", "false");
    expect(pill("Send aftercare")).toHaveAttribute("aria-pressed", "false");
    // Only the selected composer is on screen — the general note box no longer sits
    // permanently above the stream.
    expect(screen.getByPlaceholderText("Treatment details…")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Add a general note…")).not.toBeInTheDocument();
  });

  it("swaps the open composer when another pill is picked", async () => {
    await openNotes();
    await userEvent.click(pill("General note"));

    expect(pill("General note")).toHaveAttribute("aria-pressed", "true");
    expect(pill("Treatment note")).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByPlaceholderText("Treatment details…")).not.toBeInTheDocument();

    const box = screen.getByPlaceholderText("Add a general note…");
    await userEvent.type(box, "Reception call — rebooked for Tuesday.");
    await userEvent.click(screen.getByRole("button", { name: "Save note" }));

    expect(saveGeneralNote).toHaveBeenCalledWith(
      expect.objectContaining({ patientID: "p-1", body: "Reception call — rebooked for Tuesday." }),
    );
  });

  it("falls back to General note for a viewer who cannot write treatment notes", async () => {
    viewer = clinicAdmin;
    await openNotes();
    expect(screen.queryByRole("button", { name: "Treatment note" })).not.toBeInTheDocument();
    expect(pill("General note")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByPlaceholderText("Add a general note…")).toBeInTheDocument();
  });
});

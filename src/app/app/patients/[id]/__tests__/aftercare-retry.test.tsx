import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { Suspense } from "react";
import type { Identity, Note, Patient } from "@/lib/demo/types";

// 18/07 regression cover. A live aftercare send that the provider rejects flips the note to
// "failed"; the backend records WHY (failureReason) and ships a retryAftercare callable. Both
// were previously unused by the web — a bare "Failed" badge with no reason and no retry.
// Retry now sends a REAL email, so it must also be single-flight.

let currentIdentity: Identity;
let currentNotes: Note[];
let currentPatient: Patient;
let retryAftercare: ReturnType<typeof vi.fn>;

const patient: Patient = {
  id: "p-1", givenName: "Danni", lastName: "Wang",
  dateOfBirth: { year: 1990, month: 5, day: 2 }, gender: "Female",
  address: "1 St", phone: "0400", email: "d@example.com", allergies: "", currentMedications: "",
  owner: { kind: "doctor", id: "u-voss" }, prescribingDoctorIDs: [], openReviewerDoctorIDs: [],
};

const failedNote: Note = {
  id: "n-1", patientID: "p-1", kind: "aftercareRecord", title: "Aftercare sent", body: "Body",
  createdAt: 1000, authorID: "u-voss", authorBadge: "Dr Voss", consumedAuthorisationIDs: [],
  medications: [], deliveryStatus: "failed",
  failureReason: "provider 403: You can only send testing emails to your own address.",
};

vi.mock("next/navigation", () => ({ usePathname: () => "/app", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/app/ConsultCall", () => ({ useConsultCall: () => ({ start: vi.fn(), active: false }) }));
vi.mock("@/components/app/PatientAvatar", () => ({ PatientAvatarPicker: () => null, PatientAvatar: () => null }));
vi.mock("@/lib/demo/auth", () => ({ useDemoAuth: () => ({ identity: currentIdentity }) }));
vi.mock("@/lib/demo/store", () => ({
  useDemoStore: () => ({
    // "ready" (not "demo") — the retry affordance must exist in LIVE, which is exactly where
    // a failed send is unrecoverable without it.
    status: "ready" as const,
    state: { patients: { "p-1": currentPatient } },
    visibleNotesForPatient: () => currentNotes,
    activeAuthorisations: () => [],
    activeEmergencyAuthorisations: () => [],
    formsForPatient: () => [],
    appointmentsForPatient: () => [],
    openRequestsForPatient: () => [],
    searchPatients: () => [],
    recordAdminAccess: vi.fn(),
    deletePatient: vi.fn(), mergePatients: vi.fn(), saveGeneralNote: vi.fn(),
    retryAftercare, withdrawRequest: vi.fn(),
  }),
}));

import PatientFilePage from "@/app/app/patients/[id]/page";

const doctor: Identity = { user: { id: "u-voss", name: "Dr Voss" }, role: "doctor", context: { kind: "independent" } };
const admin: Identity = { user: { id: "u-ava", name: "Ava Lim" }, role: "clinicAdmin", context: { kind: "clinic", clinic: { id: "clinic-lumiere", name: "Lumière" } } };

async function renderFile() {
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <PatientFilePage params={Promise.resolve({ id: "p-1" })} />
      </Suspense>,
    );
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** The note row is a collapsed toggle; the reason + retry live in its expanded body. */
async function expandNote() {
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Aftercare sent/ })); });
}

beforeEach(() => {
  currentIdentity = doctor;
  currentPatient = patient;
  currentNotes = [failedNote];
  retryAftercare = vi.fn().mockResolvedValue(undefined);
});

describe("patient file — failed aftercare delivery", () => {
  it("shows the reason the backend recorded, not just a bare Failed badge", async () => {
    await renderFile();
    await expandNote();
    expect(screen.getByText(/You can only send testing emails to your own address/)).toBeInTheDocument();
  });

  it("omits the reason line when the note carries no failureReason", async () => {
    currentNotes = [{ ...failedNote, failureReason: undefined }];
    await renderFile();
    await expandNote();
    expect(screen.queryByText(/Delivery failed:/)).not.toBeInTheDocument();
    // …but retry is still offered, since the send is still recoverable.
    expect(screen.getByRole("button", { name: /Retry delivery/ })).toBeInTheDocument();
  });

  it("offers retry in live mode and calls the store with the note", async () => {
    await renderFile();
    await expandNote();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Retry delivery/ })); });
    expect(retryAftercare).toHaveBeenCalledTimes(1);
    expect(retryAftercare.mock.calls[0].slice(0, 2)).toEqual(["p-1", "n-1"]);
  });

  it("is single-flight — a double-click sends only one email", async () => {
    // Retry stays pending so both clicks land inside the in-flight window.
    let release: () => void = () => {};
    retryAftercare.mockReturnValue(new Promise<void>((resolve) => { release = () => resolve(); }));
    await renderFile();
    await expandNote();
    const button = screen.getByRole("button", { name: /Retry delivery/ });
    await act(async () => { fireEvent.click(button); });
    expect(screen.getByRole("button", { name: /Retrying/ })).toBeDisabled();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Retrying/ })); });
    expect(retryAftercare).toHaveBeenCalledTimes(1);
    // Once it settles the control frees up for a genuine second attempt.
    await act(async () => { release(); await Promise.resolve(); });
    expect(screen.getByRole("button", { name: /Retry delivery/ })).not.toBeDisabled();
  });

  // A clinic admin may write general notes and can view this clinic-owned file, but must not
  // send/re-send aftercare (backend.canSendAftercare is nurse/doctor only) — so the affordance
  // must stay hidden on a file they CAN otherwise open.
  it("hides retry from a role that may not send aftercare", async () => {
    currentIdentity = admin;
    currentPatient = { ...patient, owner: { kind: "clinic", id: "clinic-lumiere" } };
    await renderFile();
    await expandNote();
    expect(screen.getByText(/Delivery failed:/)).toBeInTheDocument(); // the file rendered …
    expect(screen.queryByRole("button", { name: /Retry delivery/ })).not.toBeInTheDocument(); // … without retry
  });
});

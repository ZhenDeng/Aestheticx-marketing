import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { Suspense } from "react";
import type { Identity, Patient } from "@/lib/demo/types";

// Constitution §16/§21: a Platform Admin opening a patient file must be logged and shown an
// audit-access banner; a clinician opening a file they own must not be logged.

let currentIdentity: Identity;
let currentPatients: Record<string, Patient>;
const recordAdminAccess = vi.fn();

const patient: Patient = {
  id: "p-1", givenName: "Danni", lastName: "Wang",
  dateOfBirth: { year: 1990, month: 5, day: 2 }, gender: "Female",
  address: "1 St", phone: "0400", email: "d@example.com", allergies: "", currentMedications: "",
  owner: { kind: "doctor", id: "u-voss" }, prescribingDoctorIDs: [], openReviewerDoctorIDs: [],
};

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/app/ConsultCall", () => ({ useConsultCall: () => ({ start: vi.fn(), active: false }) }));
vi.mock("@/components/app/PatientAvatar", () => ({ PatientAvatarPicker: () => null, PatientAvatar: () => null }));
vi.mock("@/lib/demo/auth", () => ({ useDemoAuth: () => ({ identity: currentIdentity }) }));
vi.mock("@/lib/demo/store", () => ({
  useDemoStore: () => ({
    status: "ready" as const,
    state: { patients: currentPatients },
    visibleNotesForPatient: () => [],
    activeAuthorisations: () => [],
    activeEmergencyAuthorisations: () => [],
    formsForPatient: () => [],
    appointmentsForPatient: () => [],
    openRequestsForPatient: () => [],
    searchPatients: () => [],
    recordAdminAccess,
    deletePatient: vi.fn(), mergePatients: vi.fn(), saveGeneralNote: vi.fn(),
    retryAftercare: vi.fn(), withdrawRequest: vi.fn(),
  }),
}));

import PatientFilePage from "@/app/app/patients/[id]/page";

const admin: Identity = { user: { id: "u-admin", name: "Priya Nair" }, role: "superAdmin", context: { kind: "independent" } };
const doctor: Identity = { user: { id: "u-voss", name: "Dr Voss" }, role: "doctor", context: { kind: "independent" } };

// `use(params)` suspends on the params promise; an async act() flushes its resolution and the
// mount effects so we can assert synchronously.
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

beforeEach(() => { recordAdminAccess.mockClear(); currentPatients = { "p-1": patient }; });

describe("patient file — platform-admin audit access", () => {
  it("logs the access once and shows the recorded banner for a super admin", async () => {
    currentIdentity = admin;
    await renderFile();
    expect(screen.getByText(/Audit access — recorded/i)).toBeInTheDocument();
    expect(recordAdminAccess).toHaveBeenCalledTimes(1);
    expect(recordAdminAccess.mock.calls[0][0]).toMatchObject({ id: "p-1" });
  });

  it("does not log and shows no banner for a clinician viewing their own patient", async () => {
    currentIdentity = doctor;
    await renderFile();
    // The file renders (the doctor owns this patient) …
    expect(screen.getByText("Danni Wang")).toBeInTheDocument();
    // … but no admin-access side effects.
    expect(screen.queryByText(/Audit access — recorded/i)).not.toBeInTheDocument();
    expect(recordAdminAccess).not.toHaveBeenCalled();
  });

  it("still logs when the patient only arrives after hydration (deep-link race)", async () => {
    // Live deep-link: the file mounts before hydration finishes, so the patient is absent.
    currentIdentity = admin;
    currentPatients = {};
    const element = (
      <Suspense fallback={null}>
        <PatientFilePage params={Promise.resolve({ id: "p-1" })} />
      </Suspense>
    );
    // (The initial render suspends on the params promise; RTL emits a benign "suspended inside
    // act" console warning here — cosmetic, doesn't affect the assertions.)
    const { rerender } = render(element);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    // Nothing to log yet — and crucially, the ref must not be "used up" on this empty pass.
    expect(recordAdminAccess).not.toHaveBeenCalled();
    // Hydration completes → the patient appears → the access is logged exactly once.
    await act(async () => { currentPatients = { "p-1": patient }; rerender(element); await Promise.resolve(); });
    expect(recordAdminAccess).toHaveBeenCalledTimes(1);
    expect(recordAdminAccess.mock.calls[0][0]).toMatchObject({ id: "p-1" });
  });
});

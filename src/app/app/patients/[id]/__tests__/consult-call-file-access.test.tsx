// Owner feedback 28/07: a clinic books a teleconsult with a prescribing doctor about a
// patient, and the doctor clicks that patient on their own calendar — and landed on an empty
// file, because the booking granted them nothing. This drives the REAL patient file page from
// state built by the REAL booking path, so it fails if the grant stops flowing anywhere
// between bookAuthSlot and the page's permission check.
import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { Suspense } from "react";
import { emptyState, publishAvailability, bookAuthSlot, markAppointment } from "@/lib/demo/backend";
import { patientAccessLevel } from "@/lib/demo/isolation";
import { LUMIERE } from "@/lib/demo/accounts";
import type { DemoState, Identity, Patient } from "@/lib/demo/types";

const voss: Identity = { user: { id: "u-voss", name: "Dr Elena Voss" }, role: "doctor", context: { kind: "independent" } };
const sarahClinic: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "clinic", clinic: LUMIERE } };

const DAY = "2026-06-26";
const NOW = Date.parse("2026-06-26T12:00:00Z");

const clinicPatient: Patient = {
  id: "p-1", givenName: "Mara", lastName: "Boyd",
  dateOfBirth: { year: 1991, month: 3, day: 12 }, gender: "Female",
  address: "7/22 Fitzroy St", phone: "0401 223 871", email: "mara@example.com",
  allergies: "Lidocaine", currentMedications: "Levothyroxine",
  owner: { kind: "clinic", id: LUMIERE.id }, prescribingDoctorIDs: [], openReviewerDoctorIDs: [],
};

/** The clinic books a 10-minute call with Voss about their patient. */
function stateWithCall(): { state: DemoState; apptID: string } {
  const base = emptyState();
  const seeded = { ...base, patients: { ...base.patients, [clinicPatient.id]: clinicPatient } };
  const published = publishAvailability(seeded, { doctorID: "u-voss", dateISO: DAY, startMinute: 540, endMinute: 570 }, voss).state;
  const { state, appt } = bookAuthSlot(published, {
    doctorID: "u-voss", dateISO: DAY, startMinute: 540,
    patientID: clinicPatient.id, patientName: "Mara Boyd", identity: sarahClinic,
  }, NOW);
  return { state, apptID: appt.id };
}

const currentIdentity: Identity = voss;
let currentState: DemoState = stateWithCall().state;

vi.mock("next/navigation", () => ({ usePathname: () => "/app", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/app/ConsultCall", () => ({ useConsultCall: () => ({ start: vi.fn(), active: false }) }));
vi.mock("@/components/app/PatientAvatar", () => ({ PatientAvatarPicker: () => null, PatientAvatar: () => null }));
vi.mock("@/lib/demo/auth", () => ({ useDemoAuth: () => ({ identity: currentIdentity }) }));
vi.mock("@/lib/demo/store", () => ({
  useDemoStore: () => ({
    status: "demo" as const,
    now: NOW,
    state: currentState,
    matrixEnabled: true,
    patientAccess: (p: Patient, id: Identity) => patientAccessLevel(currentState, id, p),
    walletEntries: () => [], walletBalance: () => 0, priceListFor: () => [],
    topUpWallet: vi.fn(), checkoutClient: vi.fn(), finalizeServiceFee: vi.fn(),
    visibleNotesForPatient: () => [],
    activeAuthorisations: () => [], activeEmergencyAuthorisations: () => [],
    formsForPatient: () => [], appointmentsForPatient: () => [], openRequestsForPatient: () => [],
    searchPatients: () => [], recordAdminAccess: vi.fn(),
    deletePatient: vi.fn(), mergePatients: vi.fn(), saveGeneralNote: vi.fn(),
    retryAftercare: vi.fn(), withdrawRequest: vi.fn(),
  }),
}));

import PatientFilePage from "@/app/app/patients/[id]/page";

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

describe("patient file — the doctor a consult call is booked with", () => {
  it("opens the file the call is about", async () => {
    currentState = stateWithCall().state;
    await renderFile();
    expect(screen.queryByText(/not in your view/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/mara/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/lidocaine/i)).toBeInTheDocument();
  });

  it("closes it again once the call is done", async () => {
    const { state, apptID } = stateWithCall();
    currentState = markAppointment(state, apptID, "completed", voss, NOW);
    await renderFile();
    expect(screen.getByText(/not in your view/i)).toBeInTheDocument();
  });
});

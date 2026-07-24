// Spec client-data-isolation: a collaborating doctor (active cooperation relationship,
// no prescribing/review grant) reaches a clinic client's file to OPERATE (checkout/wallet)
// but gains no clinical rights from it — demographics detail, allergies/medications,
// authorisations, notes, forms, and history stay hidden.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { Suspense } from "react";
import { patientAccessLevel } from "@/lib/demo/isolation";
import { LUMIERE } from "@/lib/demo/accounts";
import type { CooperationRelationship, Identity, Patient } from "@/lib/demo/types";

let currentIdentity: Identity;

const clinicPatient: Patient = {
  id: "p-1", givenName: "Amara", lastName: "Boyd",
  dateOfBirth: { year: 1991, month: 3, day: 12 }, gender: "Female",
  address: "7/22 Fitzroy St", phone: "0401 223 871", email: "amara@example.com",
  allergies: "Lidocaine, Penicillin", currentMedications: "Levothyroxine 75µg daily",
  owner: { kind: "clinic", id: LUMIERE.id }, prescribingDoctorIDs: [], openReviewerDoctorIDs: [],
  alert: "Anaphylaxis to lignocaine",
};

const coop: CooperationRelationship = {
  id: `u-voss_clinic_${LUMIERE.id}`, doctorID: "u-voss", doctorName: "Dr Elena Voss",
  counterpartyType: "clinic", counterpartyID: LUMIERE.id, counterpartyName: LUMIERE.name,
  status: "active", authRequestsAllowed: true, invoiceApplies: true,
  priceCentsOverride: null, createdAt: 0, updatedAt: 0,
};

const storeState = {
  patients: { "p-1": clinicPatient },
  cooperationRelationshipsByID: { [coop.id]: coop },
  priceListByOwner: {},
  serviceFeeCentsByPair: {},
  walletByPatientID: {},
  requests: {},
  accountsByID: {},
  invoices: [],
};

vi.mock("next/navigation", () => ({ usePathname: () => "/app", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/app/ConsultCall", () => ({ useConsultCall: () => ({ start: vi.fn(), active: false }) }));
vi.mock("@/components/app/PatientAvatar", () => ({ PatientAvatarPicker: () => null, PatientAvatar: () => null }));
vi.mock("@/lib/demo/auth", () => ({ useDemoAuth: () => ({ identity: currentIdentity }) }));
vi.mock("@/lib/demo/store", () => ({
  useDemoStore: () => ({
    status: "demo" as const,
    now: 0,
    state: storeState,
    matrixEnabled: true,
    patientAccess: (p: Patient, id: Identity) => patientAccessLevel(storeState as never, id, p),
    walletEntries: () => [],
    walletBalance: () => 0,
    priceListFor: () => [],
    topUpWallet: vi.fn(), checkoutClient: vi.fn(), finalizeServiceFee: vi.fn(),
    visibleNotesForPatient: () => [],
    activeAuthorisations: () => [{ id: "a1", patientID: "p-1", requestID: "r1", medication: { name: "Letybo", dosage: "16", unit: "units", category: "neurotoxin", areas: ["Forehead"], route: "intramuscular" }, repeatsRemaining: 5, expiresAt: 9e15, createdAt: 0, doctorID: "u-other", nurseID: "u-ruby", invoiced: false }],
    activeEmergencyAuthorisations: () => [],
    formsForPatient: () => [],
    appointmentsForPatient: () => [],
    openRequestsForPatient: () => [],
    searchPatients: () => [],
    recordAdminAccess: vi.fn(),
    deletePatient: vi.fn(), mergePatients: vi.fn(), saveGeneralNote: vi.fn(),
    retryAftercare: vi.fn(), withdrawRequest: vi.fn(),
  }),
}));

import PatientFilePage from "@/app/app/patients/[id]/page";

const collaborator: Identity = { user: { id: "u-voss", name: "Dr Elena Voss" }, role: "doctor", context: { kind: "independent" } };
const clinicNurse: Identity = { user: { id: "u-ruby", name: "Ruby Walsh" }, role: "nurse", context: { kind: "clinic", clinic: LUMIERE } };

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

beforeEach(() => { vi.clearAllMocks(); });

describe("patient file — commercial-only collaborator access", () => {
  it("shows the collaborator the Account surface but no clinical content", async () => {
    currentIdentity = collaborator;
    await renderFile();
    // Reaches the file and can operate commercially…
    expect(screen.getAllByText(/amara/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/account balance/i)).toBeInTheDocument();
    // …but no clinical/PHI sections.
    expect(screen.queryByText(/lidocaine/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/levothyroxine/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/anaphylaxis/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/active authorisations/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/consent forms/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^notes$/i)).not.toBeInTheDocument();
  });

  it("clinic staff keep the full clinical file", async () => {
    currentIdentity = clinicNurse;
    await renderFile();
    expect(screen.getByText(/lidocaine, penicillin/i)).toBeInTheDocument();
    expect(screen.getByText(/active authorisations/i)).toBeInTheDocument();
    expect(screen.getByText(/account balance/i)).toBeInTheDocument();
  });
});

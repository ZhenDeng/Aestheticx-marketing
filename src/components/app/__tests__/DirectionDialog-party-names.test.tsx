import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyState } from "@/lib/demo/backend";
import type { Authorisation, CooperationRelationship, MedicationItem, Patient } from "@/lib/demo/types";

// The Clause 68C direction is a legal document, and this dialog is the only surface that
// assembles it. The party lines used to be resolved at render time against DEMO_ACCOUNTS,
// so a live Firebase uid fell through to itself and printed "PRESCRIBER: xY3kf9…" onto the
// document — non-empty, so the export gate waved it through. These tests pin the wiring:
// stamped names render, unresolvable parties fail closed and block the export.

const LIVE_DOCTOR_UID = "xY3kf9QpZ2bNr7WmT1sVdH8cJ4e2";
const LIVE_NURSE_UID = "Kq7pR2mZ9xL4vB6tN1wY3hF5sG8a";

const letybo: MedicationItem = {
  name: "Letybo", dosage: "16", category: "neurotoxin", unit: "units",
  areas: ["Glabella"], route: "intramuscular",
};

const patient: Patient = {
  id: "p1", givenName: "Amara", lastName: "Boyd", dateOfBirth: { year: 1991, month: 3, day: 12 },
  gender: "Female", address: "14 Marra St, Bondi NSW 2026", phone: "0401", email: "a@x.test",
  allergies: "NKDA", currentMedications: "Nil", owner: { kind: "nurse", id: LIVE_NURSE_UID },
  prescribingDoctorIDs: [LIVE_DOCTOR_UID],
};

const authorisation: Authorisation = {
  id: "auth-1", requestID: "req-1", patientID: "p1",
  doctorID: LIVE_DOCTOR_UID, nurseID: LIVE_NURSE_UID, clinicID: null,
  medication: letybo, repeatsRemaining: 5,
  expiresAt: Date.UTC(2026, 11, 17), createdAt: Date.UTC(2026, 5, 17),
  invoiced: false, reviewedAt: Date.UTC(2026, 5, 17),
  premise: { id: "prem-1", name: "Sarah Chen Aesthetics", address: "12 Hall St, Bondi Beach NSW 2026" },
};

const relationship: CooperationRelationship = {
  id: "rel-1", doctorID: LIVE_DOCTOR_UID, doctorName: "Dr Elena Voss",
  counterpartyType: "nurse", counterpartyID: LIVE_NURSE_UID, counterpartyName: "Sarah Chen",
  status: "active", authRequestsAllowed: true, invoiceApplies: true,
  priceCentsOverride: null, createdAt: 0, updatedAt: 0,
};

let relationships: CooperationRelationship[];

const NURSE = { user: { id: LIVE_NURSE_UID, name: "Sarah Chen" }, role: "nurse" as const, context: { kind: "independent" as const } };

function makeStore() {
  return {
    // The originating request is absent, as it is for a live nurse whose hydrate scope
    // didn't load it — the party lines must still resolve without it.
    state: { ...emptyState(), requests: {} },
    profileForUser: vi.fn(() => ({
      ahpra: "MED0001", abn: "", phone: "02 9388 4410",
      address: "", principalPlace: "A. Voss Medical, 88 Oxford St", premises: [],
    })),
    cooperationRelationships: vi.fn(() => relationships),
  };
}
let store: ReturnType<typeof makeStore>;
vi.mock("@/lib/demo/auth", () => ({ useDemoAuth: () => ({ identity: NURSE, mode: "live" }) }));
vi.mock("@/lib/demo/store", () => ({ useDemoStore: () => store }));

import { DirectionDialog } from "@/components/app/DirectionDialog";

function open(over: Partial<Authorisation> = {}) {
  return render(
    <DirectionDialog
      authorisation={{ ...authorisation, ...over }}
      patient={patient}
      emergencies={[]}
      onClose={() => {}}
    />,
  );
}

beforeEach(() => {
  relationships = [];
  store = makeStore();
});

describe("DirectionDialog party lines", () => {
  it("renders the names stamped on the authorisation at approval", async () => {
    const { container } = open({ doctorName: "Dr Elena Voss", nurseName: "Sarah Chen" });
    await userEvent.click(screen.getByRole("button", { name: "Preview direction" }));

    // Appears on the prescriber row and again in the attestation line.
    expect(screen.getAllByText(/Dr Elena Voss/).length).toBeGreaterThan(0);
    expect(screen.getByText("Sarah Chen")).toBeInTheDocument();
    expect(container.textContent).not.toContain(LIVE_DOCTOR_UID);
    expect(container.textContent).not.toContain(LIVE_NURSE_UID);
  });

  // The uid only ever reached the DOM via the preview, so the guard that matters is that
  // an unresolved party can no longer REACH the preview — the gate is what stops the leak.
  it("blocks the export and never exposes a uid when no party resolves", () => {
    const { container } = open();
    expect(screen.getByText(/Still needed:/)).toHaveTextContent("Prescriber name");
    expect(screen.getByText(/Still needed:/)).toHaveTextContent("Responsible provider");
    expect(screen.queryByRole("button", { name: "Preview direction" })).not.toBeInTheDocument();
    expect(container.textContent).not.toContain(LIVE_DOCTOR_UID);
    expect(container.textContent).not.toContain(LIVE_NURSE_UID);
  });

  it("resolves both parties from the cooperation directory for legacy authorisations", async () => {
    relationships = [relationship];
    const { container } = open();
    await userEvent.click(screen.getByRole("button", { name: "Preview direction" }));

    // Appears on the prescriber row and again in the attestation line.
    expect(screen.getAllByText(/Dr Elena Voss/).length).toBeGreaterThan(0);
    expect(screen.getByText("Sarah Chen")).toBeInTheDocument();
    expect(container.textContent).not.toContain(LIVE_DOCTOR_UID);
  });
});


// Owner feedback 06/08: the premise stamped on an authorisation came from a global selection
// made on another page (dashboard "Working from" / Profile), so working elsewhere without
// switching first printed the wrong address. The request form now shows and chooses it.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Suspense } from "react";
import { emptyState, updateProfile } from "@/lib/demo/backend";
import { LUMIERE } from "@/lib/demo/accounts";
import type { DemoState, Identity, Patient, Premise } from "@/lib/demo/types";

const HOME: Premise = { id: "p-home", name: "Home rooms", address: "1 Home St, Sydney NSW 2000" };
const CITY: Premise = { id: "p-city", name: "City rooms", address: "2 City Rd, Sydney NSW 2000" };

const nurse: Identity = { user: { id: "u-n", name: "Nurse" }, role: "nurse", context: { kind: "independent" } };
const nurseAtClinic: Identity = { user: { id: "u-n", name: "Nurse" }, role: "nurse", context: { kind: "clinic", clinic: LUMIERE } };

const basePatient: Patient = {
  id: "p-1", givenName: "Ann", lastName: "Lee",
  dateOfBirth: { year: 1990, month: 1, day: 1 }, gender: "Female",
  address: "", phone: "", email: "", allergies: "", currentMedications: "",
  owner: { kind: "nurse", id: "u-n" }, prescribingDoctorIDs: ["u-d"], openReviewerDoctorIDs: [],
};

let identity: Identity;
let premises: Premise[];
const submitRequest = vi.fn();

function state(): DemoState {
  const s = emptyState();
  const patient: Patient = identity.context.kind === "clinic"
    ? { ...basePatient, owner: { kind: "clinic", id: LUMIERE.id } }
    : basePatient;
  const seeded: DemoState = { ...s, patients: { [patient.id]: patient } };
  return updateProfile(seeded, "u-n", { premises, defaultPremiseId: HOME.id, selectedPremiseId: HOME.id });
}

vi.mock("next/navigation", () => ({
  usePathname: () => "/app",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/demo/auth", () => ({ useDemoAuth: () => ({ identity }) }));
vi.mock("@/lib/demo/store", () => ({
  useDemoStore: () => {
    const s = state();
    return {
      status: "demo" as const,
      now: Date.parse("2026-08-06T00:00:00Z"),
      state: s,
      profileForUser: (uid: string) => s.profileByUser[uid],
      submitRequest,
      editPendingRequest: vi.fn(),
      resubmitRequest: vi.fn(),
      cooperatingDoctors: () => [{ doctorId: "u-d", doctorName: "Dr Who" }],
      openRequestsForPatient: () => [],
    };
  },
}));

import RequestPage from "@/app/app/patients/[id]/request/page";

async function renderPage() {
  await act(async () => {
    render(<Suspense fallback={null}><RequestPage params={Promise.resolve({ id: "p-1" })} /></Suspense>);
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** Add one free-text line so canSubmit turns true (name + dosage + an actively chosen route). */
async function addAnItem() {
  await userEvent.click(screen.getByRole("button", { name: /other \/ compounded medication/i }));
  await userEvent.type(screen.getByLabelText("Medication name"), "Letybo");
  await userEvent.type(screen.getByLabelText("Dosage"), "20");
  await userEvent.selectOptions(screen.getByLabelText("Route of administration"), "intramuscular");
}

beforeEach(() => { submitRequest.mockReset(); identity = nurse; premises = [HOME, CITY]; });

describe("request form — Location", () => {
  it("shows a Location select defaulting to the profile's active premise", async () => {
    await renderPage();
    const select = screen.getByLabelText("Location") as HTMLSelectElement;
    expect(select.value).toBe(HOME.id);
    expect(screen.getByRole("option", { name: /City rooms — 2 City Rd/ })).toBeInTheDocument();
  });

  it("renders a read-only line, not a select, when there is only one premise", async () => {
    premises = [HOME];
    await renderPage();
    expect(screen.queryByLabelText("Location")).not.toBeInTheDocument();
    expect(screen.getByText(/Home rooms — 1 Home St/)).toBeInTheDocument();
  });

  it("is absent under a clinic identity — the clinic's own premises are stamped", async () => {
    identity = nurseAtClinic;
    await renderPage();
    expect(screen.queryByLabelText("Location")).not.toBeInTheDocument();
    expect(screen.queryByText(/Home rooms/)).not.toBeInTheDocument();
  });

  it("passes the chosen premise id to submitRequest", async () => {
    await renderPage();
    await addAnItem();
    await userEvent.selectOptions(screen.getByLabelText("Location"), CITY.id);
    await userEvent.click(screen.getByRole("button", { name: /submit request/i }));
    expect(submitRequest).toHaveBeenCalledTimes(1);
    expect(submitRequest.mock.calls[0][0]).toMatchObject({ premiseId: CITY.id });
  });

  it("passes the active premise when the field is left alone", async () => {
    await renderPage();
    await addAnItem();
    await userEvent.click(screen.getByRole("button", { name: /submit request/i }));
    expect(submitRequest.mock.calls[0][0]).toMatchObject({ premiseId: HOME.id });
  });

  it("sends no premiseId at all under a clinic identity", async () => {
    identity = nurseAtClinic;
    await renderPage();
    await addAnItem();
    await userEvent.click(screen.getByRole("button", { name: /submit request/i }));
    expect(submitRequest.mock.calls[0][0]).not.toHaveProperty("premiseId");
  });
});

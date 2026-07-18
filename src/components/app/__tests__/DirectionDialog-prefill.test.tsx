import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Authorisation, AuthorisationRequest, Patient, Premise, UserProfile } from "@/lib/demo/types";

// The capture dialog left fields blank that the app already held, so a clinician retyped them
// onto a legal document. These pin what it now prefills, and from where.

const BONDI: Premise = { id: "p-bondi", name: "Sarah Chen Aesthetics", address: "12 Hall St, Bondi Beach NSW 2026" };
const NURSE = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse" as const, context: { kind: "independent" as const } };

let profiles: Record<string, UserProfile>;
let requests: Record<string, AuthorisationRequest>;

vi.mock("@/lib/demo/auth", () => ({ useDemoAuth: () => ({ identity: NURSE, mode: "demo" }) }));
vi.mock("@/lib/demo/store", () => ({
  useDemoStore: () => ({
    profileForUser: (id: string) =>
      profiles[id] ?? { ahpra: "", abn: "", phone: "", address: "", principalPlace: "", premises: [] },
    state: { requests },
  }),
}));

import { DirectionDialog } from "@/components/app/DirectionDialog";

const patient: Patient = {
  id: "p-1", givenName: "Coco", lastName: "Donovan",
  dateOfBirth: { day: 4, month: 7, year: 1988 }, gender: "Female",
  phone: "0400 000 000", address: "9 Test St, Bondi NSW 2026", email: "c@example.test",
  allergies: "None", currentMedications: "None",
  owner: { kind: "nurse", id: "u-sarah" },
  prescribingDoctorIDs: ["u-voss"],
};

function authorisation(over: Partial<Authorisation> = {}): Authorisation {
  return {
    id: "req-1-0", requestID: "req-1", patientID: "p-1", doctorID: "u-voss", nurseID: "u-sarah",
    clinicID: null,
    medication: { name: "Botox", dosage: "20", category: "neurotoxin", unit: "units", areas: ["Glabella"] },
    repeatsRemaining: 5, expiresAt: 2_000_000_000_000, createdAt: 1_700_000_000_000, invoiced: false,
    ...over,
  } as Authorisation;
}

function originatingRequest(route?: string): AuthorisationRequest {
  return {
    id: "req-1", patientID: "p-1", nurse: { id: "u-sarah", name: "Sarah Chen" }, doctorID: "u-voss",
    context: { kind: "independent" },
    items: [{ name: "Botox", dosage: "20", category: "neurotoxin", unit: "units", areas: ["Glabella"], ...(route ? { route } : {}) }],
    status: "approved", createdAt: 0,
  };
}

function open(auth: Authorisation) {
  render(<DirectionDialog authorisation={auth} patient={patient} emergencies={[]} onClose={() => {}} />);
}

const field = (label: RegExp | string) => screen.getByLabelText(label) as HTMLInputElement;

beforeEach(() => {
  profiles = { "u-sarah": { ahpra: "", abn: "", phone: "", address: "", principalPlace: "", premises: [BONDI], selectedPremiseId: BONDI.id } };
  requests = { "req-1": originatingRequest("Intradermal") };
});

describe("DirectionDialog prefills", () => {
  it("uses the acting user's selected premise when the authorisation has none stamped", () => {
    open(authorisation());
    expect(field(/premises of administration/i).value).toBe("Sarah Chen Aesthetics, 12 Hall St, Bondi Beach NSW 2026");
  });

  it("prefers the premise stamped on the authorisation", () => {
    const stamped: Premise = { id: "p-s", name: "Stamped Clinic", address: "1 Stamp Rd, Sydney NSW 2000" };
    open(authorisation({ premise: stamped }));
    expect(field(/premises of administration/i).value).toBe("Stamped Clinic, 1 Stamp Rd, Sydney NSW 2000");
  });

  it("recovers Route from the originating request when the medication has none", () => {
    open(authorisation());
    expect(field(/route/i).value).toBe("Intradermal");
  });

  it("shows no Route capture field when the medication already carries one", () => {
    open(authorisation({ medication: { ...authorisation().medication, route: "Intramuscular" } }));
    expect(screen.queryByLabelText(/route/i)).not.toBeInTheDocument();
  });

  it("leaves Route blank when the originating request is not loaded", () => {
    requests = {};
    open(authorisation());
    expect(field(/route/i).value).toBe("");
  });

  it("defaults Number & intervals to PRN, not an invented schedule", () => {
    open(authorisation());
    const v = field(/number & intervals/i).value;
    expect(v).toBe("PRN");
    expect(v).not.toMatch(/weeks apart/i);
  });

  it("keeps prefilled values editable", async () => {
    const user = userEvent.setup();
    open(authorisation());
    const premises = field(/premises of administration/i);
    await user.clear(premises);
    await user.type(premises, "Other Rooms, 5 Elsewhere St");
    expect(premises.value).toBe("Other Rooms, 5 Elsewhere St");
  });
});

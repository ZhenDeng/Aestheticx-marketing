import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ROUTES_OF_ADMINISTRATION, ROUTE_DISPLAY_LABELS } from "@/lib/demo/types";
import type { Authorisation, AuthorisationRequest, Patient, UserProfile } from "@/lib/demo/types";

// A direction is a legal document, so the capture dialog blanks anything it cannot resolve and
// blocks the export. That gating is correct and is NOT what these tests change — they pin that
// the resulting prompt is legible AT the field, and that Route can only ever be one of the five
// legal routes of administration.

const NURSE = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse" as const, context: { kind: "independent" as const } };

let profiles: Record<string, UserProfile>;
let requests: Record<string, AuthorisationRequest>;

vi.mock("@/lib/demo/auth", () => ({ useDemoAuth: () => ({ identity: NURSE, mode: "demo" }) }));
vi.mock("@/lib/demo/store", () => ({
  useDemoStore: () => ({
    profileForUser: (id: string) =>
      profiles[id] ?? { ahpra: "", abn: "", phone: "", address: "", principalPlace: "", premises: [] },
    state: { requests },
    cooperationRelationships: () => [],
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

/** The originating request as it exists for an authorisation that predates per-item routes. */
function routelessRequest(): AuthorisationRequest {
  return {
    id: "req-1", patientID: "p-1", nurse: { id: "u-sarah", name: "Sarah Chen" }, doctorID: "u-voss",
    context: { kind: "independent" },
    items: [{ name: "Botox", dosage: "20", category: "neurotoxin", unit: "units", areas: ["Glabella"] }],
    status: "approved", createdAt: 0,
  };
}

function open(auth: Authorisation) {
  render(<DirectionDialog authorisation={auth} patient={patient} emergencies={[]} onClose={() => {}} />);
}

beforeEach(() => {
  // A nurse caller: hydrate loads only her own users doc, so the prescriber's profile is the
  // blank default. This is the live shape, not an edge case.
  profiles = {
    "u-sarah": {
      ahpra: "", abn: "", phone: "", address: "", principalPlace: "",
      premises: [{ id: "p-bondi", name: "Sarah Chen Aesthetics", address: "12 Hall St, Bondi Beach NSW 2026" }],
      selectedPremiseId: "p-bondi",
    },
  };
  requests = { "req-1": routelessRequest() };
});

describe("Route is captured as one of the five legal routes", () => {
  it("offers exactly the five routes of administration, by display label", () => {
    open(authorisation());

    const select = screen.getByLabelText(/route/i) as HTMLSelectElement;
    expect(select.tagName).toBe("SELECT");

    const values = [...select.options].map((o) => o.value).filter((v) => v !== "");
    expect(values).toEqual([...ROUTES_OF_ADMINISTRATION]);

    for (const route of ROUTES_OF_ADMINISTRATION) {
      expect(within(select).getByRole("option", { name: ROUTE_DISPLAY_LABELS[route] })).toBeInTheDocument();
    }
  });

  it("rests on an unselected placeholder rather than pre-choosing a route", () => {
    open(authorisation());
    // Round 6's rule, carried over from the request form: route must be an active choice.
    expect((screen.getByLabelText(/route/i) as HTMLSelectElement).value).toBe("");
  });

  it("shows a route recovered from the originating request as its selected option", () => {
    requests = { "req-1": { ...routelessRequest(), items: [{ ...routelessRequest().items[0], route: "intradermal" }] } };
    open(authorisation());
    expect((screen.getByLabelText(/route/i) as HTMLSelectElement).value).toBe("intradermal");
  });

  it("shows no Route control at all when the medication already carries one", () => {
    open(authorisation({ medication: { ...authorisation().medication, route: "intramuscular" } }));
    expect(screen.queryByLabelText(/route/i)).not.toBeInTheDocument();
  });

  // An HTML select handed a value matching no option silently selects its first ENABLED option.
  // So a non-canonical stored route would have displayed as a DIFFERENT route than the one the
  // export prints — the clinician reviews "Intradermal" and downloads a direction saying
  // "Intramuscular". Strictly worse than the free-text input this replaced.
  it("never displays a route other than the one it was given", () => {
    requests = { "req-1": { ...routelessRequest(), items: [{ ...routelessRequest().items[0], route: "Intramuscular" }] } };
    open(authorisation());

    const select = screen.getByLabelText(/route/i) as HTMLSelectElement;
    expect(select.value).not.toBe("intradermal");
    // Refused at the source, so it presents as unresolved and must be actively chosen.
    expect(select.value).toBe("");
    expect(select).toHaveAttribute("aria-invalid", "true");
  });
});

describe("An unresolved required field is marked at the field", () => {
  it("marks an empty required control invalid and names it as needed on its own label", () => {
    open(authorisation());

    const phone = screen.getByLabelText(/^phone/i);
    expect(phone).toHaveAttribute("aria-invalid", "true");
    // Not colour alone — the label carries the word, matching the summary's wording.
    expect(screen.getByText(/^phone/i).textContent).toMatch(/needed/i);
  });

  it("leaves a resolved field unmarked", () => {
    open(authorisation({
      prescriberPhone: "02 9555 0100",
      prescriberPrincipalPlace: "88 Oxford St, Paddington NSW 2021",
    }));

    const phone = screen.getByLabelText(/^phone/i);
    expect(phone).toHaveAttribute("aria-invalid", "false");
    expect(screen.getByText(/^phone/i).textContent).not.toMatch(/needed/i);
  });

  it("clears the mark, and the summary entry, once the clinician fills the field", async () => {
    const user = userEvent.setup();
    open(authorisation({ prescriberPrincipalPlace: "88 Oxford St, Paddington NSW 2021" }));

    const phone = screen.getByLabelText(/^phone/i);
    expect(phone).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/still needed/i).textContent).toMatch(/prescriber phone/i);

    await user.type(phone, "02 9555 0100");

    expect(phone).toHaveAttribute("aria-invalid", "false");
    expect(screen.queryByText(/still needed/i)?.textContent ?? "").not.toMatch(/prescriber phone/i);
  });

  it("explains once why the values are missing, and only while something is missing", () => {
    open(authorisation());
    const explanation = screen.getByTestId("direction-missing-explanation");
    // Worded as a prompt, not as a validation failure the clinician caused.
    expect(explanation.textContent).toMatch(/couldn't be filled in/i);

    // Every capture field describes itself by that explanation, so a screen reader reaching a
    // marked control is told why it is empty.
    expect(screen.getByLabelText(/^phone/i)).toHaveAttribute("aria-describedby", explanation.id);
  });

  it("shows no explanation when nothing is missing", () => {
    open(authorisation({
      prescriberPhone: "02 9555 0100",
      prescriberPrincipalPlace: "88 Oxford St, Paddington NSW 2021",
      medication: { ...authorisation().medication, route: "intramuscular" },
    }));

    expect(screen.queryByTestId("direction-missing-explanation")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /preview direction/i })).toBeInTheDocument();
  });
});

// The exact state the 18/07 report hit, which no existing test could reach: every source of the
// three fields is simultaneously empty. Demo mode cannot produce it — the seed fills all three.
describe("A nurse on a pre-stamp authorisation is prompted for all three, and blocked", () => {
  it("marks Phone, Principal place of practice and Route, invents nothing, and blocks export", () => {
    open(authorisation());

    for (const label of [/^phone/i, /principal place of practice/i, /route/i]) {
      const control = screen.getByLabelText(label);
      expect(control).toHaveAttribute("aria-invalid", "true");
      expect((control as HTMLInputElement | HTMLSelectElement).value).toBe("");
    }

    const summary = screen.getByText(/still needed/i).textContent ?? "";
    expect(summary).toMatch(/prescriber phone/i);
    expect(summary).toMatch(/principal place of practice/i);
    expect(summary).toMatch(/route/i);

    // Export stays gated: neither step is reachable.
    expect(screen.queryByRole("button", { name: /preview direction/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /download direction/i })).not.toBeInTheDocument();
  });
});

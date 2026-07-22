import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyDraft, type Identity, type Patient, type PatientDraft } from "@/lib/demo/types";

// PatientForm (in components/app, 23.8% dir coverage) is the clinical create/edit surface. It
// gates submit on missingFields (real helper), creates or updates via the store, and routes to
// the patient file. These tests pin the validation gate, both write paths, and error handling.

const nurse: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "independent" } };

const push = vi.fn();
const back = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => "/app", useRouter: () => ({ push, back }) }));

let identity: Identity | null;
vi.mock("@/lib/demo/auth", () => ({ useDemoAuth: () => ({ identity }) }));

const createPatient = vi.fn(() => "p-new");
const updatePatient = vi.fn();
// The address field biases its suggestions by the signed-in user's own recorded state, so the
// form now reads their profile (see useAddressBias).
const profileForUser = vi.fn(() => ({
  ahpra: "", abn: "", phone: "", address: "14 Acland St, St Kilda VIC 3182",
  principalPlace: "", premises: [],
}));
vi.mock("@/lib/demo/store", () => ({ useDemoStore: () => ({ createPatient, updatePatient, profileForUser }) }));

import { PatientForm } from "@/components/app/PatientForm";

function validDraft(): PatientDraft {
  return {
    ...emptyDraft(),
    givenName: "Amara", lastName: "Boyd", dateOfBirth: { year: 1990, month: 5, day: 2 },
    gender: "Female", address: "1 Test St", phone: "0400 000 000", email: "amara@x.test",
    allergies: "None", currentMedications: "None",
  };
}

const existing: Patient = {
  id: "p-1", givenName: "Amara", lastName: "Boyd", dateOfBirth: { year: 1990, month: 5, day: 2 },
  gender: "Female", address: "1 Test St", phone: "0400 000 000", email: "amara@x.test",
  allergies: "None", currentMedications: "None", owner: { kind: "nurse", id: "u-sarah" }, prescribingDoctorIDs: [],
};

beforeEach(() => {
  identity = nurse;
  push.mockClear();
  back.mockClear();
  createPatient.mockClear();
  updatePatient.mockClear();
});

describe("PatientForm", () => {
  it("renders nothing without an identity", () => {
    identity = null;
    const { container } = render(<PatientForm mode="create" initial={emptyDraft()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("disables submit while required fields are missing", () => {
    render(<PatientForm mode="create" initial={emptyDraft()} />);
    expect(screen.getByRole("button", { name: /create patient/i })).toBeDisabled();
  });

  it("creates the patient, runs the post-create hook, and routes to the file", async () => {
    const onCreated = vi.fn();
    const user = userEvent.setup();
    render(<PatientForm mode="create" initial={validDraft()} onCreated={onCreated} />);

    const submit = screen.getByRole("button", { name: /create patient/i });
    expect(submit).toBeEnabled();
    await user.click(submit);

    expect(createPatient).toHaveBeenCalledWith(validDraft(), nurse);
    expect(onCreated).toHaveBeenCalledWith("p-new");
    expect(push).toHaveBeenCalledWith("/app/patients/p-new");
  });

  it("still navigates when the best-effort post-create hook throws", async () => {
    const onCreated = vi.fn(() => {
      throw new Error("lead link failed");
    });
    const user = userEvent.setup();
    render(<PatientForm mode="create" initial={validDraft()} onCreated={onCreated} />);
    await user.click(screen.getByRole("button", { name: /create patient/i }));
    expect(push).toHaveBeenCalledWith("/app/patients/p-new");
  });

  it("saves an edit with trimmed fields and routes back to the file", async () => {
    const user = userEvent.setup();
    const initial: PatientDraft = { ...validDraft(), preferredName: "" };
    render(<PatientForm mode="edit" initial={initial} existing={existing} />);

    // Add surrounding whitespace that the component must trim before saving.
    const given = screen.getByDisplayValue("Amara");
    await user.clear(given);
    await user.type(given, "  Amara  ");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(updatePatient).toHaveBeenCalledTimes(1);
    const [saved] = updatePatient.mock.calls[0] as [Patient, Identity];
    expect(saved.givenName).toBe("Amara");
    expect(saved.id).toBe("p-1");
    expect(push).toHaveBeenCalledWith("/app/patients/p-1");
  });

  it("shows an error when the store rejects the save", async () => {
    createPatient.mockImplementation(() => {
      throw new Error("forbidden");
    });
    const user = userEvent.setup();
    render(<PatientForm mode="create" initial={validDraft()} />);
    await user.click(screen.getByRole("button", { name: /create patient/i }));
    expect(await screen.findByText(/could not save/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("cancels via the provided callback", async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(<PatientForm mode="create" initial={emptyDraft()} onCancel={onCancel} />);
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();
  });

  it("falls back to router.back when no cancel handler is given", async () => {
    const user = userEvent.setup();
    render(<PatientForm mode="create" initial={emptyDraft()} />);
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(back).toHaveBeenCalled();
  });
});

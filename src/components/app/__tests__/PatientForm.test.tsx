import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
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
let authMode: "demo" | "live";
vi.mock("@/lib/demo/auth", () => ({ useDemoAuth: () => ({ identity, mode: authMode }) }));

const autocompleteAddress = vi.fn();
const resolveAddress = vi.fn();
vi.mock("@/lib/firebase/addressLookup", () => ({
  autocompleteAddress: (...args: unknown[]) => autocompleteAddress(...args),
  resolveAddress: (...args: unknown[]) => resolveAddress(...args),
}));

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
  authMode = "demo";
  push.mockClear();
  back.mockClear();
  createPatient.mockClear();
  updatePatient.mockClear();
  autocompleteAddress.mockReset();
  autocompleteAddress.mockResolvedValue([
    { placeId: "place-1", label: "12 Smith Street, Richmond VIC 3121, Australia" },
  ]);
  resolveAddress.mockReset();
  resolveAddress.mockResolvedValue("Unit 5/12 Smith Street, Richmond VIC 3121, Australia");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
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

  it("keeps demo mode as a native street-address textbox without lookup", () => {
    render(<PatientForm mode="create" initial={validDraft()} />);

    const address = screen.getByRole("textbox", { name: /address/i });
    expect(address).toHaveAttribute("autocomplete", "street-address");
    fireEvent.change(address, { target: { value: "12 Smith" } });
    expect(autocompleteAddress).not.toHaveBeenCalled();
  });

  it("creates a live patient with the resolved address instead of the prediction label", async () => {
    authMode = "live";
    vi.useFakeTimers();
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("d9428888-122b-4a8f-a585-89e1f51ed487");
    render(<PatientForm mode="create" initial={validDraft()} />);

    const address = screen.getByRole("combobox", { name: /address/i });
    fireEvent.focus(address);
    fireEvent.change(address, { target: { value: "Unit 5/12 Smith" } });
    await act(async () => vi.advanceTimersByTime(250));
    fireEvent.click(screen.getByRole("option", { name: /Richmond/ }));
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: /create patient/i }));

    expect(createPatient).toHaveBeenCalledTimes(1);
    const [saved] = createPatient.mock.calls[0] as [PatientDraft, Identity];
    expect(saved.address).toBe("Unit 5/12 Smith Street, Richmond VIC 3121, Australia");
    expect(saved.address).not.toBe("12 Smith Street, Richmond VIC 3121, Australia");
  });

  it("updates a live patient with the resolved address instead of the prediction label", async () => {
    authMode = "live";
    vi.useFakeTimers();
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("d9428888-122b-4a8f-a585-89e1f51ed487");
    render(<PatientForm mode="edit" initial={validDraft()} existing={existing} />);

    const address = screen.getByRole("combobox", { name: /address/i });
    fireEvent.focus(address);
    fireEvent.change(address, { target: { value: "Unit 5/12 Smith" } });
    await act(async () => vi.advanceTimersByTime(250));
    fireEvent.click(screen.getByRole("option", { name: /Richmond/ }));
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(updatePatient).toHaveBeenCalledTimes(1);
    const [saved] = updatePatient.mock.calls[0] as [Patient, Identity];
    expect(saved.address).toBe("Unit 5/12 Smith Street, Richmond VIC 3121, Australia");
    expect(saved.address).not.toBe("12 Smith Street, Richmond VIC 3121, Australia");
  });

  it("creates through the create override (not the plain store create) and routes to its id", async () => {
    const create = vi.fn(() => "p-linked");
    const user = userEvent.setup();
    render(<PatientForm mode="create" initial={validDraft()} create={create} />);

    const submit = screen.getByRole("button", { name: /create patient/i });
    expect(submit).toBeEnabled();
    await user.click(submit);

    expect(create).toHaveBeenCalledWith(validDraft());
    expect(createPatient).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/app/patients/p-linked");
  });

  // 28/07 regression: the old onCreated hook swallowed link failures and navigated anyway,
  // leaving lead appointments silently unlinked. A create-override throw means NOTHING was
  // created (the action is atomic), so the form must show its error and stay put.
  it("shows the error and does not navigate when the create override throws", async () => {
    const create = vi.fn(() => {
      throw new Error("appointment already linked");
    });
    const user = userEvent.setup();
    render(<PatientForm mode="create" initial={validDraft()} create={create} />);
    await user.click(screen.getByRole("button", { name: /create patient/i }));
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByText(/could not save/i)).toBeInTheDocument();
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

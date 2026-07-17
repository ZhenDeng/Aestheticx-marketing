import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyState } from "@/lib/demo/backend";
import type { DemoState, Identity, Patient } from "@/lib/demo/types";

// AftercareForm emails aftercare to the patient. The 15/07 bug was a blank recipient silently
// queuing a doomed send, so the empty-recipient guard is the headline behaviour to lock down.
// Uses the REAL aftercare helpers via a mocked store.

const nurse: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "independent" } };

function patient(email: string): Patient {
  return {
    id: "p1", givenName: "Amara", lastName: "Boyd", dateOfBirth: { year: 1990, month: 5, day: 2 },
    gender: "Female", address: "", phone: "", email, allergies: "", currentMedications: "",
    owner: { kind: "nurse", id: "u-sarah" }, prescribingDoctorIDs: [],
  };
}

const sendAftercare = vi.fn();
let state: DemoState;
vi.mock("@/lib/demo/store", () => ({
  useDemoStore: () => ({
    state,
    sendAftercare,
    visibleNotesForPatient: () => [], // no prior treatment note → no medication attach row
  }),
}));

import { AftercareForm } from "@/components/app/AftercareForm";

beforeEach(() => {
  state = { ...emptyState(), patients: { p1: patient("amara@x.test") } };
  sendAftercare.mockClear();
});

describe("AftercareForm", () => {
  it("blocks sending and warns when the patient has no email on file", () => {
    state = { ...emptyState(), patients: { p1: patient("") } };
    render(<AftercareForm patientID="p1" identity={nurse} onDone={vi.fn()} />);
    expect(screen.getByText(/no email address on file/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^send/i })).toBeDisabled();
  });

  it("shows the recipient and sends when an email is on file", async () => {
    const onDone = vi.fn();
    const user = userEvent.setup();
    render(<AftercareForm patientID="p1" identity={nurse} onDone={onDone} />);

    expect(screen.getByText(/will be emailed to amara@x.test/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^send/i }));

    expect(sendAftercare).toHaveBeenCalledWith(
      expect.objectContaining({ patientID: "p1", categories: [], identity: nurse }),
    );
    expect(onDone).toHaveBeenCalled();
  });

  it("re-assembles the body and counts categories as they are toggled", async () => {
    const user = userEvent.setup();
    render(<AftercareForm patientID="p1" identity={nurse} onDone={vi.fn()} />);
    const body = screen.getByRole("textbox") as HTMLTextAreaElement;
    const before = body.value;

    await user.click(screen.getByRole("button", { name: /^antiwrinkle$/i }));
    expect(body.value).not.toBe(before); // template re-assembled from the selection
    expect(screen.getByRole("button", { name: /send · 1 category/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^skinbooster$/i }));
    expect(screen.getByRole("button", { name: /send · 2 categories/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^send · 2 categories$/i }));
    expect(sendAftercare).toHaveBeenCalledWith(
      expect.objectContaining({ categories: ["antiwrinkle", "skinbooster"] }),
    );
  });
});

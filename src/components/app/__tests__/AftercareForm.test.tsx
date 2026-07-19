import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyState } from "@/lib/demo/backend";
import { AFTERCARE_CLOSING, aftercareTemplate } from "@/lib/demo/aftercare";
import type { DemoState, Identity, Patient } from "@/lib/demo/types";

// 19/07: aftercare hands off to the practitioner's own mail client (same as "Send a consent to
// sign") instead of being sent server-side through Resend. The form composes a mailto prefill
// and records the send on the patient file; it never sends. The 15/07 empty-recipient guard
// still matters — a mailto with no address is just as useless as a queued send with none.
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

/** The compose control is a mailto anchor once a recipient exists. */
function mailtoLink(): HTMLAnchorElement {
  return screen.getByRole("link", { name: /^email/i }) as HTMLAnchorElement;
}

/** mailto:addr?subject=…&body=… → the decoded body. */
function bodyOf(href: string): string {
  return decodeURIComponent(new URL(href).searchParams.get("body") ?? "");
}

beforeEach(() => {
  state = { ...emptyState(), patients: { p1: patient("amara@x.test") } };
  sendAftercare.mockClear();
});

describe("AftercareForm", () => {
  it("blocks composing and warns when the patient has no email on file", () => {
    state = { ...emptyState(), patients: { p1: patient("") } };
    render(<AftercareForm patientID="p1" identity={nurse} onDone={vi.fn()} />);
    expect(screen.getByText(/no email address on file/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^email/i })).toBeDisabled();
    expect(screen.queryByRole("link", { name: /^email/i })).not.toBeInTheDocument();
  });

  it("addresses the mailto to the patient and carries subject + body", () => {
    render(<AftercareForm patientID="p1" identity={nurse} onDone={vi.fn()} />);
    expect(screen.getByText(/amara@x.test/i)).toBeInTheDocument();

    const href = mailtoLink().getAttribute("href")!;
    expect(href.startsWith("mailto:amara@x.test?")).toBe(true);
    expect(decodeURIComponent(new URL(href).searchParams.get("subject") ?? ""))
      .toBe("Your aftercare instructions");
    expect(bodyOf(href)).toContain("Hi Amara Boyd,");
    expect(bodyOf(href)).toContain(AFTERCARE_CLOSING);
  });

  it("records the send on the patient file when the practitioner hands off", async () => {
    const onDone = vi.fn();
    const user = userEvent.setup();
    render(<AftercareForm patientID="p1" identity={nurse} onDone={onDone} />);

    await user.click(mailtoLink());

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
    expect(screen.getByRole("link", { name: /email · 1 category/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^skinbooster$/i }));
    expect(screen.getByRole("link", { name: /email · 2 categories/i })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: /^email · 2 categories$/i }));
    expect(sendAftercare).toHaveBeenCalledWith(
      expect.objectContaining({ categories: ["antiwrinkle", "skinbooster"] }),
    );
  });

  it("sends the practitioner's edits, not the regenerated template", async () => {
    const user = userEvent.setup();
    render(<AftercareForm patientID="p1" identity={nurse} onDone={vi.fn()} />);
    const body = screen.getByRole("textbox");
    await user.clear(body);
    await user.type(body, "Hand written instructions.");

    expect(bodyOf(mailtoLink().getAttribute("href")!)).toContain("Hand written instructions.");
    await user.click(mailtoLink());
    expect(sendAftercare).toHaveBeenCalledWith(
      expect.objectContaining({ content: "Hand written instructions." }),
    );
  });

  it("keeps the urgent-symptom guidance intact in a filler send", async () => {
    const user = userEvent.setup();
    render(<AftercareForm patientID="p1" identity={nurse} onDone={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /^ha filler$/i }));

    const sent = bodyOf(mailtoLink().getAttribute("href")!);
    expect(sent).toContain(aftercareTemplate("haFiller"));
    expect(sent).toContain("URGENT");
    expect(sent).not.toMatch(/do not reply/i);
  });
});

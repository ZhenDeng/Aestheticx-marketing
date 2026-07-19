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
      .toBe("Your Aftercare Guide");
    expect(bodyOf(href)).toContain("Dear Amara Boyd,");
    expect(bodyOf(href)).toContain(AFTERCARE_CLOSING);
  });

  it("records the send on the patient file when the practitioner hands off", async () => {
    const user = userEvent.setup();
    render(<AftercareForm patientID="p1" identity={nurse} onDone={vi.fn()} />);

    await user.click(mailtoLink());

    expect(sendAftercare).toHaveBeenCalledWith(
      expect.objectContaining({ patientID: "p1", categories: [], identity: nurse }),
    );
  });

  // The panel must NOT unmount inside the anchor's own click handler: detaching the element
  // before the browser performs the mailto navigation can silently drop it. Staying open also
  // keeps the composed text on screen if the mail client never opened.
  it("stays open after hand-off, confirming what was recorded", async () => {
    const onDone = vi.fn();
    const user = userEvent.setup();
    render(<AftercareForm patientID="p1" identity={nurse} onDone={onDone} />);

    await user.click(mailtoLink());

    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toBeInTheDocument();     // body still readable/copyable
    expect(screen.getByText(/recorded on the patient file/i)).toBeInTheDocument();
    expect(mailtoLink()).toBeInTheDocument();                     // re-clickable if mail never opened
  });

  it("records only once even if the practitioner re-opens their mail client", async () => {
    const user = userEvent.setup();
    render(<AftercareForm patientID="p1" identity={nurse} onDone={vi.fn()} />);

    await user.click(mailtoLink());
    await user.click(mailtoLink());

    expect(sendAftercare).toHaveBeenCalledTimes(1);
  });

  // "Recorded" means THIS composed content was recorded. Editing after a hand-off must clear it,
  // or the mail client opens with the new instructions while the patient file silently keeps the
  // old ones — and the banner would still claim the send was recorded.
  it("records a second send after the practitioner changes the content", async () => {
    const user = userEvent.setup();
    render(<AftercareForm patientID="p1" identity={nurse} onDone={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /^anti-wrinkle$/i }));
    await user.click(mailtoLink());
    expect(sendAftercare).toHaveBeenCalledTimes(1);
    expect(sendAftercare.mock.calls[0][0]).toMatchObject({ categories: ["antiwrinkle"] });

    // Swap the category — the composed email is now different aftercare entirely.
    await user.click(screen.getByRole("button", { name: /^anti-wrinkle$/i }));
    await user.click(screen.getByRole("button", { name: /^ha filler$/i }));
    expect(screen.queryByText(/recorded on the patient file/i)).not.toBeInTheDocument();

    await user.click(mailtoLink());
    expect(sendAftercare).toHaveBeenCalledTimes(2);
    expect(sendAftercare.mock.calls[1][0]).toMatchObject({ categories: ["haFiller"] });
  });

  it("clears the recorded confirmation when the body is edited by hand", async () => {
    const user = userEvent.setup();
    render(<AftercareForm patientID="p1" identity={nurse} onDone={vi.fn()} />);
    await user.click(mailtoLink());
    expect(screen.getByText(/recorded on the patient file/i)).toBeInTheDocument();

    await user.type(screen.getByRole("textbox"), " Extra guidance.");
    expect(screen.queryByText(/recorded on the patient file/i)).not.toBeInTheDocument();

    await user.click(mailtoLink());
    expect(sendAftercare).toHaveBeenCalledTimes(2);
    expect(sendAftercare.mock.calls[1][0].content).toContain("Extra guidance.");
  });

  // Both banners appear only after an interaction, so screen readers need them announced —
  // matching ConsultCall's existing role="alert" / role="status" convention.
  it("announces the confirmation and the truncation warning", async () => {
    const user = userEvent.setup();
    render(<AftercareForm patientID="p1" identity={nurse} onDone={vi.fn()} />);

    await user.click(mailtoLink());
    expect(screen.getByRole("status")).toHaveTextContent(/recorded on the patient file/i);

    for (const name of [/^anti-wrinkle$/i, /^skinbooster$/i, /^ha filler$/i, /^fat dissolve$/i, /^filler dissolve \(hylase\)$/i]) {
      await user.click(screen.getByRole("button", { name }));
    }
    expect(screen.getByRole("alert")).toHaveTextContent(/some email apps/i);
  });

  // A mailto href beyond ~2k characters is truncated or refused by some desktop handlers, and
  // with no delivery signal that would fail silently — so warn rather than let it fail unseen.
  it("warns when the composed email is long enough to risk truncation", async () => {
    const user = userEvent.setup();
    render(<AftercareForm patientID="p1" identity={nurse} onDone={vi.fn()} />);
    expect(screen.queryByText(/some email apps/i)).not.toBeInTheDocument();

    for (const name of [/^anti-wrinkle$/i, /^skinbooster$/i, /^ha filler$/i, /^fat dissolve$/i, /^filler dissolve \(hylase\)$/i]) {
      await user.click(screen.getByRole("button", { name }));
    }
    expect(screen.getByText(/some email apps/i)).toBeInTheDocument();
  });

  it("re-assembles the body and counts categories as they are toggled", async () => {
    const user = userEvent.setup();
    render(<AftercareForm patientID="p1" identity={nurse} onDone={vi.fn()} />);
    const body = screen.getByRole("textbox") as HTMLTextAreaElement;
    const before = body.value;

    await user.click(screen.getByRole("button", { name: /^anti-wrinkle$/i }));
    expect(body.value).not.toBe(before); // template re-assembled from the selection
    expect(screen.getByRole("link", { name: /email · 1 category/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^skinbooster$/i }));
    expect(screen.getByRole("link", { name: /email · 2 categories/i })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: /^email · 2 categories$/i }));
    expect(sendAftercare).toHaveBeenCalledWith(
      expect.objectContaining({ categories: ["antiwrinkle", "skinbooster"] }),
    );
    expect(screen.getByText(/recorded on the patient file/i)).toBeInTheDocument();
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

  // 19/07 owner templates: a single selection also drives the per-treatment subject line.
  it("sends the owner's filler template under its per-treatment subject", async () => {
    const user = userEvent.setup();
    render(<AftercareForm patientID="p1" identity={nurse} onDone={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /^ha filler$/i }));

    const href = mailtoLink().getAttribute("href")!;
    expect(decodeURIComponent(new URL(href).searchParams.get("subject") ?? ""))
      .toBe("Your Aftercare Guide for HA Dermal Filler Treatment");
    const sent = bodyOf(href);
    expect(sent).toContain(aftercareTemplate("haFiller"));
    expect(sent).toContain("Pain Management: Mild tenderness is expected.");
    expect(sent).not.toMatch(/do not reply/i);
  });

  it("offers the three 19/07 categories and reverts to the generic subject for several", async () => {
    const user = userEvent.setup();
    render(<AftercareForm patientID="p1" identity={nurse} onDone={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /^prp \/ prf$/i }));
    let href = mailtoLink().getAttribute("href")!;
    expect(decodeURIComponent(new URL(href).searchParams.get("subject") ?? ""))
      .toBe("Your Aftercare Guide for PRP / PRF Treatment");

    await user.click(screen.getByRole("button", { name: /^biostimulator filler$/i }));
    await user.click(screen.getByRole("button", { name: /^biostimulator rejuvenation$/i }));
    href = mailtoLink().getAttribute("href")!;
    expect(decodeURIComponent(new URL(href).searchParams.get("subject") ?? ""))
      .toBe("Your Aftercare Guide");
    expect(bodyOf(href)).toContain("— BIOSTIMULATOR REJUVENATION —");
  });
});

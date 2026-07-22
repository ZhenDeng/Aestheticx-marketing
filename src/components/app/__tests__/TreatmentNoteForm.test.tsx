import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyState } from "@/lib/demo/backend";
import type { DemoState, Identity } from "@/lib/demo/types";

// TreatmentNoteForm is a core clinical data-entry surface (dir coverage 23.8%). A treatment note
// needs no authorisation (spec rule 1), so with an empty authorisation list it must still save.
// Uses the REAL usableAuthorisations helper via a mocked store carrying an empty DemoState.

const nurse: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "independent" } };
const doctor: Identity = { user: { id: "u-mira", name: "Dr Mira Patel" }, role: "doctor", context: { kind: "independent" } };

const saveTreatmentNote = vi.fn();
let state: DemoState;
let templates: { id: string; name: string; body: string }[];

vi.mock("@/lib/demo/store", () => ({
  useDemoStore: () => ({
    state,
    now: Date.UTC(2026, 6, 17),
    saveTreatmentNote,
    noteTemplatesForOwner: () => templates,
  }),
}));

import { TreatmentNoteForm } from "@/components/app/TreatmentNoteForm";

beforeEach(() => {
  state = emptyState();
  templates = [];
  saveTreatmentNote.mockClear();
});

describe("TreatmentNoteForm", () => {
  it("reminds the writer when no authorisation is on file but still allows saving", () => {
    render(<TreatmentNoteForm patientID="p1" identity={nurse} onDone={vi.fn()} />);
    expect(screen.getByText(/no authorisation on file/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save treatment note/i })).toBeEnabled();
  });

  it("saves an authorisation-free note with the typed title and body", async () => {
    const onDone = vi.fn();
    const user = userEvent.setup();
    render(<TreatmentNoteForm patientID="p1" identity={nurse} onDone={onDone} />);

    await user.type(screen.getByPlaceholderText(/title/i), "Antiwrinkle");
    await user.type(screen.getByPlaceholderText(/treatment details/i), "1 area, forehead");
    await user.click(screen.getByRole("button", { name: /save treatment note/i }));

    expect(saveTreatmentNote).toHaveBeenCalledWith(
      expect.objectContaining({ patientID: "p1", tickedIDs: [], title: "Antiwrinkle", body: "1 area, forehead", identity: nurse }),
    );
    expect(onDone).toHaveBeenCalled();
  });

  it("cancels without saving", async () => {
    const onDone = vi.fn();
    const user = userEvent.setup();
    render(<TreatmentNoteForm patientID="p1" identity={nurse} onDone={onDone} />);
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(saveTreatmentNote).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalled();
  });

  it("prefills the body from a chosen note template while leaving it editable", async () => {
    templates = [{ id: "t1", name: "Standard antiwrinkle", body: "Injected forehead + glabella." }];
    const user = userEvent.setup();
    render(<TreatmentNoteForm patientID="p1" identity={nurse} onDone={vi.fn()} />);

    await user.selectOptions(screen.getByRole("combobox"), "t1");
    const body = screen.getByPlaceholderText(/treatment details/i) as HTMLTextAreaElement;
    expect(body.value).toBe("Injected forehead + glabella.");

    await user.type(body, " Tolerated well.");
    expect(body.value).toBe("Injected forehead + glabella. Tolerated well.");
  });
});

// 22/07 feedback #1: the doctor's no-script medication field suggests catalog products while
// typing. The catalog is a shortcut only — a doctor may administer a product it doesn't carry.
describe("TreatmentNoteForm medication combobox", () => {
  async function addMedicationRow() {
    const user = userEvent.setup();
    render(<TreatmentNoteForm patientID="p1" identity={doctor} onDone={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /add medication/i }));
    return { user, input: screen.getByRole("combobox", { name: /medication/i }) };
  }

  it("suggests catalog products matching the typed text", async () => {
    const { user, input } = await addMedicationRow();
    await user.type(input, "boto");
    expect(await screen.findByRole("option", { name: /Botox/ })).toBeInTheDocument();
  });

  it("matches on brand as well as product name", async () => {
    const { user, input } = await addMedicationRow();
    await user.type(input, "juvederm");
    expect(await screen.findByRole("option", { name: /Juvederm · Voluma/ })).toBeInTheDocument();
  });

  it("fills the field with the chosen product and saves that name", async () => {
    const { user, input } = await addMedicationRow();
    await user.type(input, "volux");
    await user.click(await screen.findByRole("option", { name: /Juvederm · Volux/ }));
    expect(input).toHaveValue("Juvederm · Volux");

    await user.click(screen.getByRole("button", { name: /save treatment note/i }));
    expect(saveTreatmentNote).toHaveBeenCalledWith(
      expect.objectContaining({
        medications: [expect.objectContaining({ name: "Juvederm · Volux" })],
      }),
    );
  });

  it("saves a typed medication the catalog does not carry", async () => {
    const { user, input } = await addMedicationRow();
    await user.type(input, "Compounded lignocaine 2%");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /save treatment note/i }));
    expect(saveTreatmentNote).toHaveBeenCalledWith(
      expect.objectContaining({
        medications: [expect.objectContaining({ name: "Compounded lignocaine 2%" })],
      }),
    );
  });

  it("is not offered to a nurse, whose medications come from an authorisation", () => {
    render(<TreatmentNoteForm patientID="p1" identity={nurse} onDone={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /add medication/i })).not.toBeInTheDocument();
  });
});

// Owner feedback 06/08 (2): a note can be corrected on the calendar day it was written, and
// is finalized from the next day. The window rule itself is unit-tested in notes-ops; this
// drives the real patient file to lock the UI contract — who is offered an Edit button, what
// the editor writes back, and that an amendment shows on the row. The store is mocked (so
// `now` and the note stream are exact) but canAmendNote delegates to the real backend rule,
// keeping the button and the write in agreement.
import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Suspense } from "react";
import { canAmendNote, emptyState } from "@/lib/demo/backend";
import { patientAccessLevel } from "@/lib/demo/isolation";
import type { DemoState, Identity, Note, Patient } from "@/lib/demo/types";

// Local-constructor times: the window turns on the viewer's own midnight, so the fixtures
// must not drift with the suite's timezone.
const NOW = new Date(2026, 7, 6, 15, 0).getTime();       // 6 Aug, 15:00 local
const THIS_MORNING = new Date(2026, 7, 6, 9, 0).getTime();
const YESTERDAY = new Date(2026, 7, 5, 16, 0).getTime();

const nurse: Identity = {
  user: { id: "u-sarah", name: "Sarah Chen" },
  role: "nurse",
  context: { kind: "independent" },
};

const patient: Patient = {
  id: "p-1", givenName: "Claire", lastName: "Donovan",
  dateOfBirth: { year: 1987, month: 7, day: 4 }, gender: "Female",
  address: "", phone: "0432 901 343", email: "claire@example.com",
  allergies: "NKDA", currentMedications: "Nil",
  owner: { kind: "nurse", id: "u-sarah" }, prescribingDoctorIDs: [], openReviewerDoctorIDs: [],
};

const base: Omit<Note, "id" | "createdAt"> = {
  patientID: "p-1", kind: "general", title: "", body: "",
  authorID: "u-sarah", authorBadge: "Sarah Chen", consumedAuthorisationIDs: [], medications: [],
};

const todayNote: Note = { ...base, id: "n-today", createdAt: THIS_MORNING, title: "Today", body: "Original wording." };
const oldNote: Note = { ...base, id: "n-old", createdAt: YESTERDAY, title: "Yesterday", body: "Filed and finalized." };
const amendedNote: Note = { ...base, id: "n-amended", createdAt: THIS_MORNING, editedAt: NOW, title: "Amended", body: "Corrected." };

const notes = [todayNote, oldNote, amendedNote];
const state: DemoState = {
  ...emptyState(), patients: { [patient.id]: patient }, notesByPatient: { "p-1": notes },
};

const amendNote = vi.fn();

vi.mock("next/navigation", () => ({ usePathname: () => "/app", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/app/ConsultCall", () => ({ useConsultCall: () => ({ start: vi.fn(), active: false }) }));
vi.mock("@/components/app/PatientAvatar", () => ({ PatientAvatarPicker: () => null, PatientAvatar: () => null }));
vi.mock("@/lib/demo/auth", () => ({ useDemoAuth: () => ({ identity: nurse }) }));
vi.mock("@/lib/demo/store", () => ({
  useDemoStore: () => ({
    status: "demo" as const,
    now: NOW,
    state,
    matrixEnabled: true,
    patientAccess: (p: Patient, id: Identity) => patientAccessLevel(state, id, p),
    walletEntries: () => [], walletBalance: () => 0, priceListFor: () => [], invoicesFor: () => [],
    topUpWallet: vi.fn(), checkoutClient: vi.fn(), finalizeServiceFee: vi.fn(),
    visibleNotesForPatient: () => notes,
    canAmendNote: (n: Note, id: Identity) => canAmendNote(state, n, id, NOW),
    amendNote,
    activeAuthorisations: () => [], activeEmergencyAuthorisations: () => [],
    formsForPatient: () => [], appointmentsForPatient: () => [], openRequestsForPatient: () => [],
    searchPatients: () => [], recordAdminAccess: vi.fn(),
    deletePatient: vi.fn(), mergePatients: vi.fn(), saveGeneralNote: vi.fn(),
    retryAftercare: vi.fn(), withdrawRequest: vi.fn(),
  }),
}));

import PatientFilePage from "@/app/app/patients/[id]/page";

// Opens the file, the Notes accordion, and the given note row.
async function openNote(rowName: RegExp) {
  const user = userEvent.setup();
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <PatientFilePage params={Promise.resolve({ id: "p-1" })} />
      </Suspense>,
    );
    await Promise.resolve();
  });
  await user.click(screen.getByRole("button", { name: /notes \(3\)/i }));
  await user.click(screen.getByRole("button", { name: rowName }));
  return user;
}

describe("patient file — same-day note amendment", () => {
  it("offers Edit on a note written today and writes back the corrected wording", async () => {
    const user = await openNote(/Today/);
    expect(screen.getByText(/editable until midnight/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const body = screen.getByLabelText("Note");
    await user.clear(body);
    await user.type(body, "Corrected wording.");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(amendNote).toHaveBeenCalledWith(expect.objectContaining({
      patientID: "p-1", noteID: "n-today", title: "Today", body: "Corrected wording.", identity: nurse,
    }));
    // The editor closes back to the note body.
    expect(screen.queryByLabelText("Note")).not.toBeInTheDocument();
  });

  it("finalizes yesterday's note — no Edit button, no window hint", async () => {
    await openNote(/Yesterday/);
    expect(screen.getByText("Filed and finalized.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByText(/editable until midnight/i)).not.toBeInTheDocument();
  });

  it("shows on the row that a note was amended", async () => {
    await openNote(/Amended/);
    const row = screen.getByText("Amended").closest("button")!;
    expect(row.textContent).toMatch(/edited /i);
  });
});

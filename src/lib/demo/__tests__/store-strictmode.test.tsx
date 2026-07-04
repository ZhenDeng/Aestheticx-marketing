import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import type { DemoState, Identity, Note, Patient, FollowUpTask, SignedFormRecord } from "@/lib/demo/types";
import { emptyState } from "@/lib/demo/backend";

// These tests pin down the StrictMode-safety contract of the live-mirroring mutators:
// every id must be minted ONCE, outside the React setState updater. React Strict Mode
// (and Next dev) double-invoke a functional setState updater; a mutator that minted its
// id inside the updater would generate a second id on the re-invocation and could mirror
// a doc whose id never lands in local state (a phantom Firestore doc + a broken
// follow-up cross-reference). createPatient already mints eagerly; so must the rest.

vi.mock("@/lib/firebase/client", () => ({ isFirebaseConfigured: () => true }));

// watchUser never fires its callback — the test signs in explicitly via auth.signIn.
vi.mock("@/lib/firebase/auth", () => ({
  watchUser: () => () => {},
  identitiesForUser: async () => [],
  mustChangePasswordForUser: async () => false,
  signInWithPassword: async () => {},
  signOutUser: async () => {},
}));

const mirror = {
  mirrorCreateNote: vi.fn(async () => {}),
  mirrorSaveFollowUpTask: vi.fn(async () => {}),
  mirrorCreateForm: vi.fn(async () => {}),
  mirrorCreateRequest: vi.fn(async () => {}),
  mirrorConsumeRepeats: vi.fn(async () => {}),
};
vi.mock("@/lib/firebase/mirror", () => mirror);

const doctor: Identity = {
  user: { id: "u-doc", name: "Dr Doc" },
  role: "doctor",
  context: { kind: "independent" },
};

const patient: Patient = {
  id: "p1",
  givenName: "Ada",
  lastName: "Lovelace",
  dateOfBirth: { year: 1990, month: 1, day: 1 },
  gender: "Female",
  address: "",
  phone: "",
  email: "",
  allergies: "",
  currentMedications: "",
  owner: { kind: "doctor", id: "u-doc" }, // independent doctor owns the file → may write notes
  prescribingDoctorIDs: [],
};

const HYDRATED: DemoState = {
  ...emptyState(),
  patients: { p1: patient },
  // Opt the doctor into follow-up reminders so saveTreatmentNote also mints a follow-up id.
  followUpSettingsByUser: { "u-doc": { enabled: true, intervalDays: 14 } },
};

vi.mock("@/lib/firebase/hydrate", () => ({ hydrate: async () => HYDRATED }));

import { DemoStoreProvider, useDemoStore } from "@/lib/demo/store";
import { DemoAuthProvider, useDemoAuth } from "@/lib/demo/auth";

function StrictWrapper({ children }: { children: ReactNode }) {
  return (
    <StrictMode>
      <DemoAuthProvider>
        <DemoStoreProvider>{children}</DemoStoreProvider>
      </DemoAuthProvider>
    </StrictMode>
  );
}

function useBoth() {
  return { auth: useDemoAuth(), store: useDemoStore() };
}

async function renderSignedIn() {
  const hook = renderHook(() => useBoth(), { wrapper: StrictWrapper });
  await act(async () => {
    hook.result.current.auth.signIn(doctor);
  });
  await waitFor(() => expect(hook.result.current.store.status).toBe("ready"));
  return hook.result;
}

/**
 * Run `fn` inside a synchronous `act` (which reliably triggers the Strict-Mode updater
 * double-invocation) and report how many ids `makeID` minted. A mutator that mints inside
 * the updater would double this count; minting eagerly keeps it at one-per-entity.
 */
function mintsDuring(fn: () => void): number {
  const spy = vi.spyOn(crypto, "randomUUID");
  const before = spy.mock.calls.length;
  act(() => fn());
  const minted = spy.mock.calls.length - before;
  spy.mockRestore();
  return minted;
}

describe("store live mirror is StrictMode-safe", () => {
  beforeEach(() => {
    for (const fn of Object.values(mirror)) fn.mockClear();
  });

  it("mints one id for a general note and mirrors that exact id", async () => {
    const result = await renderSignedIn();

    const minted = mintsDuring(() =>
      result.current.store.saveGeneralNote({ patientID: "p1", title: "", body: "hello", identity: doctor }),
    );
    expect(minted).toBe(1); // not 2 — the id is not minted inside the double-invoked updater

    await waitFor(() => expect(mirror.mirrorCreateNote).toHaveBeenCalledTimes(1));
    const committed = result.current.store.notesForPatient("p1");
    expect(committed).toHaveLength(1);
    const [, mirrored] = mirror.mirrorCreateNote.mock.calls[0] as unknown as [string, Note];
    expect(mirrored.id).toBe(committed[0].id);
  });

  it("mints one note id + one follow-up id, and the follow-up points at the committed note", async () => {
    const result = await renderSignedIn();

    // Doctor-direct treatment note (no ticked authorisations) → mints a note id AND a follow-up id.
    const minted = mintsDuring(() =>
      result.current.store.saveTreatmentNote({
        patientID: "p1", tickedIDs: [], title: "Tx", body: "treated", medications: [], identity: doctor,
      }),
    );
    expect(minted).toBe(2); // exactly note + follow-up, each once

    await waitFor(() => expect(mirror.mirrorCreateNote).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mirror.mirrorSaveFollowUpTask).toHaveBeenCalledTimes(1));

    const committedNote = result.current.store.notesForPatient("p1")[0];
    const [, mirroredNote] = mirror.mirrorCreateNote.mock.calls[0] as unknown as [string, Note];
    const [mirroredFollowUp] = mirror.mirrorSaveFollowUpTask.mock.calls[0] as unknown as [FollowUpTask];

    expect(mirroredNote.id).toBe(committedNote.id);
    // The amplified bug: a divergent note id would leave sourceNoteID dangling.
    expect(mirroredFollowUp.sourceNoteID).toBe(committedNote.id);
    const due = result.current.store.followUpTasksForOwnerOn("u-doc", mirroredFollowUp.dueDateISO);
    expect(due.find((t) => t.id === mirroredFollowUp.id)?.sourceNoteID).toBe(committedNote.id);
  });

  it("mints one id for a signed form and mirrors that exact id", async () => {
    const result = await renderSignedIn();

    const minted = mintsDuring(() =>
      result.current.store.recordForm(
        { patientID: "p1", template: "antiwrinkleConsent", channel: "onDevice", answers: [] },
        doctor,
      ),
    );
    expect(minted).toBe(1);

    await waitFor(() => expect(mirror.mirrorCreateForm).toHaveBeenCalledTimes(1));
    const committed = result.current.store.formsForPatient("p1");
    expect(committed).toHaveLength(1);
    const [mirrored] = mirror.mirrorCreateForm.mock.calls[0] as unknown as [SignedFormRecord];
    expect(mirrored.id).toBe(committed[0].id);
  });
});

// Reported 28/07: creating a patient file from a calendar lead left the appointment
// unlinked — the detail panel asked to create the file again, and the new file showed no
// appointment history. Root cause: create-then-link were two store calls in one tick, and
// linkAppointmentPatient eager-validated against the render-time closure, where the
// just-created patient did not exist yet; PatientForm swallowed the throw as best-effort.
// createPatientForAppointment composes both: validated together, applied in one update,
// and (live) mirrored create-BEFORE-link so the callable never races the patient doc.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { emptyState } from "@/lib/demo/backend";
import { DEMO_ACCOUNTS } from "@/lib/demo/accounts";
import { emptyDraft, type Appointment, type PatientDraft } from "@/lib/demo/types";

const VOSS = DEMO_ACCOUNTS[2].identities[0]; // Dr Elena Voss — owner id u-voss

const LEAD_APPT: Appointment = {
  id: "a-lead-1", ownerID: VOSS.user.id, type: "treatment", status: "confirmed",
  dateISO: "2026-08-03", startMinute: 540, endMinute: 600,
  lead: { givenName: "Jordan", lastName: "Lee", dob: "1990-01-15", phone: "0400111222", email: "jordan@example.com" },
};
const LINKED_APPT: Appointment = { ...LEAD_APPT, id: "a-linked-1", lead: undefined, patientID: "p-existing", patientName: "Someone Else" };

function draft(): PatientDraft {
  return {
    ...emptyDraft(),
    givenName: "Jordan", lastName: "Lee", dateOfBirth: { year: 1990, month: 1, day: 15 },
    gender: "Male", address: "1 Test St", phone: "0400111222", email: "jordan@example.com",
    allergies: "None", currentMedications: "None",
  };
}

vi.mock("@/lib/firebase/client", () => ({ isFirebaseConfigured: () => true }));
vi.mock("@/lib/firebase/auth", () => ({
  watchUser: (cb: (u: unknown) => void) => { cb({ uid: VOSS.user.id }); return () => {}; },
  identitiesForUser: async () => [VOSS],
  mustChangePasswordForUser: async () => false,
  employeeOnlyForUser: async () => false,
  currentUserUid: () => VOSS.user.id,
  watchClaimsRevision: () => () => {},
}));
vi.mock("@/lib/firebase/hydrate", () => ({
  hydrate: vi.fn(async () => ({
    ...emptyState(),
    appointments: { [LEAD_APPT.id]: LEAD_APPT, [LINKED_APPT.id]: LINKED_APPT },
  })),
}));

// Deferred create mirror so the test can hold the patient write open and prove the link
// callable is not fired until the patient doc exists.
let resolveCreate: () => void;
const mirrorCreatePatient = vi.hoisted(() => vi.fn());
const mirrorLinkAppointmentPatient = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/firebase/mirror", () => ({ mirrorCreatePatient, mirrorLinkAppointmentPatient }));

import { DemoStoreProvider, useDemoStore } from "@/lib/demo/store";
import { DemoAuthProvider } from "@/lib/demo/auth";

function wrapper({ children }: { children: ReactNode }) {
  return <DemoAuthProvider><DemoStoreProvider>{children}</DemoStoreProvider></DemoAuthProvider>;
}

describe("createPatientForAppointment", () => {
  beforeEach(() => {
    mirrorCreatePatient.mockReset();
    mirrorCreatePatient.mockImplementation(() => new Promise<void>((res) => { resolveCreate = res; }));
    mirrorLinkAppointmentPatient.mockClear();
  });

  it("creates the patient and links the appointment in one action", async () => {
    const { result } = renderHook(() => useDemoStore(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    let id = "";
    act(() => { id = result.current.createPatientForAppointment(LEAD_APPT.id, draft(), VOSS); });

    expect(id).not.toBe("");
    const appt = result.current.state.appointments[LEAD_APPT.id];
    expect(appt.patientID).toBe(id);
    expect(appt.lead).toBeUndefined();
    expect(appt.patientName).toBe("Jordan Lee");
    expect(result.current.appointmentsForPatient(id).map((a) => a.id)).toContain(LEAD_APPT.id);
  });

  it("mirrors the patient create BEFORE the link callable, never concurrently", async () => {
    const { result } = renderHook(() => useDemoStore(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    let id = "";
    act(() => { id = result.current.createPatientForAppointment(LEAD_APPT.id, draft(), VOSS); });

    await waitFor(() => expect(mirrorCreatePatient).toHaveBeenCalledTimes(1));
    // The create promise is still open — the link must not have fired yet.
    expect(mirrorLinkAppointmentPatient).not.toHaveBeenCalled();
    act(() => resolveCreate());
    await waitFor(() => expect(mirrorLinkAppointmentPatient).toHaveBeenCalledWith(LEAD_APPT.id, id));
  });

  it("throws and creates nothing when the appointment cannot take a link", async () => {
    const { result } = renderHook(() => useDemoStore(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    const patientsBefore = Object.keys(result.current.state.patients).length;
    expect(() => {
      act(() => { result.current.createPatientForAppointment(LINKED_APPT.id, draft(), VOSS); });
    }).toThrow();
    expect(Object.keys(result.current.state.patients).length).toBe(patientsBefore);
    expect(mirrorCreatePatient).not.toHaveBeenCalled();
    expect(mirrorLinkAppointmentPatient).not.toHaveBeenCalled();
  });
});

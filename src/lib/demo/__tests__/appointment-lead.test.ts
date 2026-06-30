import { describe, it, expect } from "vitest";
import {
  emptyState, calendarName, isLeadAppointment, leadName, draftFromLead,
  linkAppointmentPatient, createPatient, BackendError,
} from "@/lib/demo/backend";
import { emptyDraft } from "@/lib/demo/types";
import type { Appointment, DemoState, Identity, Patient } from "@/lib/demo/types";

const voss: Identity = { user: { id: "u-voss", name: "Voss" }, role: "doctor", context: { kind: "independent" } };
const sarah: Identity = { user: { id: "u-sarah", name: "Sarah" }, role: "nurse", context: { kind: "independent" } };

const appt = (over: Partial<Appointment> = {}): Appointment => ({
  id: "a1", type: "treatment", ownerID: "u-voss", dateISO: "2026-06-26",
  startMinute: 600, endMinute: 630, status: "confirmed", ...over,
});

describe("calendarName", () => {
  it("uses the preferred name when present", () => {
    expect(calendarName({ preferredName: "Liz", givenName: "Elizabeth", lastName: "Smith" })).toBe("Liz Smith");
  });
  it("falls back to the given name", () => {
    expect(calendarName({ givenName: "Elizabeth", lastName: "Smith" })).toBe("Elizabeth Smith");
  });
});

describe("isLeadAppointment", () => {
  it("is true for a name without a patient id", () => {
    expect(isLeadAppointment(appt({ patientName: "Jordan Lee (new lead)" }))).toBe(true);
  });
  it("is false for an existing-patient appointment", () => {
    expect(isLeadAppointment(appt({ patientID: "p1", patientName: "Mara Boyd" }))).toBe(false);
  });
  it("is false for block time (no patient name)", () => {
    expect(isLeadAppointment(appt({}))).toBe(false);
  });
});

describe("leadName", () => {
  it("strips a trailing (new lead) marker and trims", () => {
    expect(leadName(appt({ patientName: "Jordan Lee (new lead)" }))).toBe("Jordan Lee");
  });
  it("returns a plain name unchanged", () => {
    expect(leadName(appt({ patientName: "Sam Vale" }))).toBe("Sam Vale");
  });
});

describe("draftFromLead", () => {
  it("splits the first token as given and the rest as last", () => {
    const d = draftFromLead(appt({ patientName: "Jordan Van Lee (new lead)" }));
    expect(d.givenName).toBe("Jordan");
    expect(d.lastName).toBe("Van Lee");
    expect(d).toMatchObject({ ...emptyDraft(), givenName: "Jordan", lastName: "Van Lee" });
  });
  it("handles a single-word lead name (given only)", () => {
    const d = draftFromLead(appt({ patientName: "Jordan (new lead)" }));
    expect(d.givenName).toBe("Jordan");
    expect(d.lastName).toBe("");
  });
});

function withState(...appts: Appointment[]): { state: DemoState; patient: Patient } {
  let state = emptyState();
  const created = createPatient(state, {
    ...emptyDraft(), givenName: "Jordan", lastName: "Lee", dateOfBirth: { day: 1, month: 1, year: 1990 },
    gender: "Female", address: "1 King St", phone: "0400000000", email: "j@example.com",
    allergies: "None", currentMedications: "None",
  }, voss);
  state = created.state;
  state = { ...state, appointments: Object.fromEntries(appts.map((a) => [a.id, a])) };
  return { state, patient: created.patient };
}

describe("linkAppointmentPatient", () => {
  it("stamps the patient id and calendar name onto the appointment", () => {
    const { state, patient } = withState(appt({ patientName: "Jordan Lee (new lead)" }));
    const next = linkAppointmentPatient(state, "a1", patient.id, voss);
    expect(next.appointments.a1.patientID).toBe(patient.id);
    expect(next.appointments.a1.patientName).toBe("Jordan Lee");
  });
  it("rejects another owner's appointment", () => {
    const { state, patient } = withState(appt({ patientName: "Jordan Lee (new lead)" }));
    expect(() => linkAppointmentPatient(state, "a1", patient.id, sarah)).toThrow(BackendError);
  });
  it("throws on a missing appointment", () => {
    const { state, patient } = withState();
    expect(() => linkAppointmentPatient(state, "nope", patient.id, voss)).toThrow(BackendError);
  });
  it("throws on a missing patient", () => {
    const { state } = withState(appt({ patientName: "Jordan Lee (new lead)" }));
    expect(() => linkAppointmentPatient(state, "a1", "p-nope", voss)).toThrow(BackendError);
  });
});

import { describe, it, expect } from "vitest";
import {
  emptyState, calendarName, isLeadAppointment, leadName, draftFromLead,
  linkAppointmentPatient, createPatient, BackendError,
  bookTreatmentAppointment, bookAuthSlot, publishAvailability, requestAdHocAuth, setDoctorStatus,
} from "@/lib/demo/backend";
import { emptyDraft } from "@/lib/demo/types";
import type { Appointment, AppointmentLead, DemoState, Identity, Patient } from "@/lib/demo/types";

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

const jordan: AppointmentLead = {
  givenName: "Jordan", lastName: "Lee", dob: "1990-01-15", phone: "0400111222", email: "jordan@example.com",
};

describe("isLeadAppointment", () => {
  it("is true for a structured lead without a patient id", () => {
    expect(isLeadAppointment(appt({ lead: jordan }))).toBe(true);
  });
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
  it("joins a structured lead's given and last names", () => {
    expect(leadName(appt({ lead: jordan }))).toBe("Jordan Lee");
  });
  it("trims a structured lead with only one name part", () => {
    expect(leadName(appt({ lead: { givenName: "Jordan", lastName: "" } }))).toBe("Jordan");
  });
  it("strips a trailing (new lead) marker and trims", () => {
    expect(leadName(appt({ patientName: "Jordan Lee (new lead)" }))).toBe("Jordan Lee");
  });
  it("returns a plain name unchanged", () => {
    expect(leadName(appt({ patientName: "Sam Vale" }))).toBe("Sam Vale");
  });
});

describe("draftFromLead (structured)", () => {
  it("maps names and contact details and parses the ISO dob", () => {
    const d = draftFromLead(appt({ lead: jordan }));
    expect(d).toMatchObject({
      givenName: "Jordan", lastName: "Lee", phone: "0400111222", email: "jordan@example.com",
      dateOfBirth: { year: 1990, month: 1, day: 15 },
    });
  });
  it("leaves the date of birth null when the dob is absent or malformed", () => {
    expect(draftFromLead(appt({ lead: { givenName: "J", lastName: "L" } })).dateOfBirth).toBeNull();
    expect(draftFromLead(appt({ lead: { givenName: "J", lastName: "L", dob: "15/01/1990" } })).dateOfBirth).toBeNull();
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
  it("returns an empty draft for a missing name", () => {
    const d = draftFromLead(appt({}));
    expect(d).toEqual(emptyDraft());
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

describe("booking with a new-patient lead", () => {
  it("books a treatment appointment carrying the lead and no patient", () => {
    const { appt: a } = bookTreatmentAppointment(emptyState(), {
      dateISO: "2026-06-26", startMinute: 600, durationMinutes: 30, lead: jordan, identity: voss,
    });
    expect(a.lead).toEqual(jordan);
    expect(a.patientID).toBeUndefined();
    expect(a.patientName).toBeUndefined();
  });
  it("still allows patient-less, lead-less block time", () => {
    const { appt: a } = bookTreatmentAppointment(emptyState(), {
      dateISO: "2026-06-26", startMinute: 600, durationMinutes: 30, identity: voss,
    });
    expect(a.lead).toBeUndefined();
    expect(a.patientID).toBeUndefined();
  });
  it("rejects a treatment booking with both a patient and a lead", () => {
    expect(() => bookTreatmentAppointment(emptyState(), {
      dateISO: "2026-06-26", startMinute: 600, durationMinutes: 30,
      patientID: "p1", patientName: "Mara Boyd", lead: jordan, identity: voss,
    })).toThrow(BackendError);
  });
  it("rejects a lead with no name at all", () => {
    expect(() => bookTreatmentAppointment(emptyState(), {
      dateISO: "2026-06-26", startMinute: 600, durationMinutes: 30,
      lead: { givenName: "  ", lastName: "" }, identity: voss,
    })).toThrow(BackendError);
  });

  it("books an auth slot for a lead", () => {
    const s = publishAvailability(emptyState(), { doctorID: "u-voss", dateISO: "2026-06-26", startMinute: 540, endMinute: 570 }, voss).state;
    const { appt: a } = bookAuthSlot(s, { doctorID: "u-voss", dateISO: "2026-06-26", startMinute: 540, lead: jordan, identity: sarah });
    expect(a.lead).toEqual(jordan);
    expect(a.patientID).toBeUndefined();
  });
  it("rejects an auth-slot booking with neither a patient nor a lead", () => {
    const s = publishAvailability(emptyState(), { doctorID: "u-voss", dateISO: "2026-06-26", startMinute: 540, endMinute: 570 }, voss).state;
    expect(() => bookAuthSlot(s, { doctorID: "u-voss", dateISO: "2026-06-26", startMinute: 540, identity: sarah })).toThrow(BackendError);
  });
  it("rejects an auth-slot booking with both a patient and a lead", () => {
    const s = publishAvailability(emptyState(), { doctorID: "u-voss", dateISO: "2026-06-26", startMinute: 540, endMinute: 570 }, voss).state;
    expect(() => bookAuthSlot(s, {
      doctorID: "u-voss", dateISO: "2026-06-26", startMinute: 540, patientID: "p1", patientName: "Mara Boyd", lead: jordan, identity: sarah,
    })).toThrow(BackendError);
  });

  it("sends an ad-hoc request for a lead", () => {
    const s = setDoctorStatus(emptyState(), "u-voss", { online: true });
    const { appt: a } = requestAdHocAuth(s, { doctorID: "u-voss", dateISO: "2026-07-01", atMinute: 600, lead: jordan, identity: sarah });
    expect(a.lead).toEqual(jordan);
    expect(a.patientID).toBeUndefined();
  });
  it("rejects an ad-hoc request with neither a patient nor a lead", () => {
    const s = setDoctorStatus(emptyState(), "u-voss", { online: true });
    expect(() => requestAdHocAuth(s, { doctorID: "u-voss", dateISO: "2026-07-01", atMinute: 600, identity: sarah })).toThrow(BackendError);
  });
});

describe("linkAppointmentPatient", () => {
  it("stamps the patient id and calendar name onto the appointment", () => {
    const { state, patient } = withState(appt({ patientName: "Jordan Lee (new lead)" }));
    const next = linkAppointmentPatient(state, "a1", patient.id, voss);
    expect(next.appointments.a1.patientID).toBe(patient.id);
    expect(next.appointments.a1.patientName).toBe("Jordan Lee");
  });
  it("clears the structured lead when linking", () => {
    const { state, patient } = withState(appt({ lead: jordan }));
    const next = linkAppointmentPatient(state, "a1", patient.id, voss);
    expect(next.appointments.a1.lead).toBeUndefined();
    expect(next.appointments.a1.patientID).toBe(patient.id);
  });
  it("uses the patient's preferred name for the stamped calendar name", () => {
    let { state, patient } = withState(appt({ patientName: "Jordan Lee (new lead)" }));
    state = { ...state, patients: { ...state.patients, [patient.id]: { ...patient, preferredName: "Jode" } } };
    const next = linkAppointmentPatient(state, "a1", patient.id, voss);
    expect(next.appointments.a1.patientName).toBe("Jode Lee");
  });
  it("rejects an already-linked appointment", () => {
    const { state, patient } = withState(appt({ patientID: "p-other", patientName: "Someone Else" }));
    expect(() => linkAppointmentPatient(state, "a1", patient.id, voss)).toThrow(BackendError);
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
